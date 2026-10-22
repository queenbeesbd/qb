/**
 * Order creation - the one authoritative write in the storefront (Phase 15; COD-only since Phase 17).
 *
 * Everything here happens inside **one transaction**, supplied by the caller through
 * `withTransaction`. That is the whole design: the idempotency claim, the ban check, the availability
 * read, the price resolution and the order's own rows commit together or not at all, so a failed
 * submission leaves no partial order and a retry cannot create a second one.
 *
 * **Cash on Delivery is the only method this release accepts (Phase 17).** The method is not a request
 * field: there is no payment method in `CreateOrderInput`, so a submission cannot choose one, and no
 * page or endpoint can imply that a manual transfer is supported. A prepaid method is a future roadmap
 * item with no implementation, no provider and no schema change here.
 *
 * What this deliberately does **not** do (ADR 0013):
 *
 * - It writes **no** `inventory_balance` update, **no** `inventory_movement` and **no**
 *   `stock_reservation`. Availability is the only ordering gate, a binary owner-controlled state.
 * - It reserves nothing and allocates nothing. Two valid submissions may each create an order for the
 *   same in-stock product; **overselling is accepted** and managed operationally. The client cart's
 *   quantity is a request, not a hold.
 *
 * What it is authoritative about:
 *
 * - **Prices and totals.** Each line is priced from `product_variant.price_minor` read in this
 *   transaction. A price in the request is never read, so there is no field for it to arrive in.
 * - **Orderability.** Each product is checked with `checkOrderability` from database state, so an
 *   unpublished, archived or out-of-stock product refuses the whole order.
 * - **The account's standing.** A suspended (banned) or deleted customer is refused **inside this
 *   transaction** (D20), not by a UI control.
 * - **Idempotency.** A repeat submission with the same key returns the original order; a reused key with
 *   a different body is a conflict, not a second order.
 */

import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import {
  customer,
  idempotencyKey,
  order,
  orderContact,
  orderEvent,
  orderItem,
  product,
  productImage,
  productVariant,
} from '@/db/schema';
import { checkOrderability } from '@/server/catalog/orderability';
import { quoteDelivery } from '@/lib/delivery';
import { loadDeliveryRates } from '@/server/delivery/service';
import { recordPromoRedemption, resolvePromo } from '@/server/promotions/service';

import { ORDER_LIMITS, type CartLineInput, type ContactInput } from './validation';

const IDEMPOTENCY_SCOPE = 'order_create';
/** The stored key is retained for a bounded window; a replay gets the original order within it. */
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OrderRefusalReason =
  /** The account is suspended (banned) or deleted, checked inside the order transaction (D20). */
  | 'banned'
  /** The submitted cart was empty or malformed. */
  | 'empty_cart'
  /** At least one product is not orderable from current database state (unpublished, archived, out of stock). */
  | 'unavailable'
  /** A submitted line was malformed. */
  | 'invalid'
  /** The selected district is not a canonical code. */
  | 'invalid_district'
  /** The owner has not configured the required default delivery charge. */
  | 'delivery_unconfigured'
  /** The idempotency key was reused with a different body, or a first attempt is still in flight. */
  | 'idempotency_conflict'
  /**
   * The promotion code the form carried could not be applied at the moment of submission.
   *
   * The order is refused rather than placed at full price: the customer agreed to a total that included
   * the discount, and charging more than the screen stated would be a silent overcharge.
   */
  | 'promo_invalid';

export class OrderRefusalError extends Error {
  readonly reason: OrderRefusalReason;

  constructor(reason: OrderRefusalReason, message: string) {
    super(message);
    this.name = 'OrderRefusalError';
    this.reason = reason;
  }
}

export type CreatedOrder = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly totalMinor: number;
  readonly paymentMethod: string;
  readonly status: string;
  readonly paymentState: string;
  readonly codState: string;
  readonly placedAt: Date;
  /**
   * True when this submission replayed an earlier one instead of creating an order.
   *
   * It exists for the notification hook: a customer who double-submits must not ring the owner's phone
   * twice for one order. Nothing else may branch on it - the order it describes is the same order.
   */
  readonly replayed: boolean;
};

export type CreateOrderInput = {
  readonly customerId: number;
  readonly idempotencyKey: string;
  /** Digest of the submitted body; a mismatch on a seen key is a conflict. */
  readonly fingerprint: string;
  readonly lines: readonly CartLineInput[];
  readonly contact: ContactInput;
  /** A code the customer typed, already normalized or not; re-resolved here, never trusted. */
  readonly promoCode?: string | null;
};

/** An opaque public order reference. Random, uppercase hex, never a sequence and never a customer id. */
function generateOrderNumber(): string {
  return `QB${randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * Creates a COD order, or returns the original one for a replayed submission.
 *
 * Returns the created (or replayed) order. Throws `OrderRefusalError` for a refusal the route can map
 * to a user-facing notice, and lets any other error (including a database constraint violation)
 * propagate so the transaction rolls back.
 */
export async function createOrder(tx: Transaction, input: CreateOrderInput): Promise<CreatedOrder> {
  if (input.lines.length === 0) {
    throw new OrderRefusalError('empty_cart', 'the cart is empty');
  }
  if (input.lines.length > ORDER_LIMITS.maxLines) {
    throw new OrderRefusalError('empty_cart', 'too many distinct products for one order');
  }

  // 1. Idempotency: claim the key, or replay the original order.
  const claimed = await tx
    .insert(idempotencyKey)
    .values({
      scope: IDEMPOTENCY_SCOPE,
      key: input.idempotencyKey,
      principalKind: 'customer',
      principalId: input.customerId,
      requestFingerprint: input.fingerprint,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKey.key });

  if (claimed.length === 0) {
    const rows = await tx
      .select({
        fingerprint: idempotencyKey.requestFingerprint,
        resultRef: idempotencyKey.resultRef,
        principalId: idempotencyKey.principalId,
      })
      .from(idempotencyKey)
      .where(
        sql`${idempotencyKey.scope} = ${IDEMPOTENCY_SCOPE} and ${idempotencyKey.key} = ${input.idempotencyKey}`,
      );

    const existing = rows[0];
    if (existing === undefined) {
      // The row vanished between the insert and the read: treat it as a conflict rather than guessing.
      throw new OrderRefusalError('idempotency_conflict', 'the submission could not be resolved');
    }
    // Another customer's key, or the same key with a different body, is never "the same submission".
    if (existing.principalId !== input.customerId || existing.fingerprint !== input.fingerprint) {
      throw new OrderRefusalError('idempotency_conflict', 'this submission key was already used');
    }
    if (existing.resultRef === null) {
      throw new OrderRefusalError('idempotency_conflict', 'this submission is still being processed');
    }

    const replayed = await loadCreatedOrder(tx, input.customerId, existing.resultRef);
    if (replayed === null) {
      throw new OrderRefusalError('idempotency_conflict', 'the original order could not be loaded');
    }
    return { ...replayed, replayed: true };
  }

  // 2. Account standing, inside this transaction (D20). A UI check would not be enforcement.
  const account = await tx
    .select({ status: customer.status })
    .from(customer)
    .where(sql`${customer.id} = ${input.customerId}`);
  if (account[0] === undefined || account[0].status !== 'active') {
    throw new OrderRefusalError('banned', 'this account cannot place orders');
  }

  // 3-4. Every line resolved from database state, priced, and totalled in integer poisha.
  const { lines: resolved, subtotalMinor } = await resolveOrderLines(tx, input.lines);

  // The same resolver the checkout preview uses. A missing default is a refusal, never free delivery;
  // an active district override wins over the default. Nothing in the request can supply this number.
  const rates = await loadDeliveryRates(tx);
  const quote = quoteDelivery(rates, input.contact.districtCode);
  if (!quote.ok) {
    throw new OrderRefusalError(
      quote.reason === 'unconfigured' ? 'delivery_unconfigured' : 'invalid_district',
      quote.reason === 'unconfigured'
        ? 'delivery charges are not configured'
        : 'the selected district is not recognised',
    );
  }
  const shippingMinor = quote.quote.chargeMinor;

  // 5. The promotion code, resolved against the stored rule with the code row locked, so two checkouts
  //    cannot both take the last use. The request supplies a string, never an amount.
  let discountMinor = 0;
  let appliedPromo: { promoCodeId: number; code: string } | null = null;
  const promoCodeInput = input.promoCode ?? null;
  if (promoCodeInput !== null && promoCodeInput.trim() !== '') {
    const promo = await resolvePromo(tx, promoCodeInput, subtotalMinor, { lock: true });
    if (!promo.ok) {
      throw new OrderRefusalError('promo_invalid', `the promotion code was refused: ${promo.reason}`);
    }
    discountMinor = promo.discountMinor;
    appliedPromo = { promoCodeId: promo.promoCodeId, code: promo.code };
  }

  // Delivery is charged after the discount, so a code can never pay for the courier.
  const totalMinor = subtotalMinor - discountMinor + shippingMinor;

  const placedAt = new Date();
  const paymentMethod = 'cod';
  // The three states stay separate (D9): a COD order has no prepaid money state, waits for the owner's
  // confirmation, and carries no expiry - there is no prepaid payment to expire.
  const paymentState = 'not_applicable';
  const codState = 'cod_pending_approval';
  const expiresAt = null;

  const orderRows = await tx
    .insert(order)
    .values({
      orderNumber: generateOrderNumber(),
      customerId: input.customerId,
      currency: 'BDT',
      paymentMethod,
      status: 'pending',
      paymentState,
      codState,
      itemsSubtotalMinor: subtotalMinor,
      discountMinor,
      shippingMinor,
      totalMinor,
      placedAt,
      expiresAt,
    })
    .returning({ id: order.id, orderNumber: order.orderNumber });

  const created = orderRows[0];
  if (created === undefined) throw new Error('order insert returned no row');

  await tx.insert(orderContact).values({
    orderId: created.id,
    recipientName: input.contact.recipientName,
    recipientPhone: input.contact.recipientPhone,
    addressLine: input.contact.addressLine,
    districtCode: input.contact.districtCode,
    area: input.contact.area,
    city: input.contact.city,
    postcode: input.contact.postcode,
    deliveryNote: input.contact.deliveryNote,
  });

  await tx.insert(orderItem).values(
    resolved.map((line) => ({
      orderId: created.id,
      variantId: line.variantId,
      productNameBn: line.nameBn,
      productNameEn: line.nameEn,
      variantLabel: line.variantLabel,
      sku: line.sku,
      unitPriceMinor: line.priceMinor,
      compareAtPriceMinor: line.compareAtPriceMinor,
      quantity: line.quantity,
      lineTotalMinor: line.priceMinor * line.quantity,
      imageKeySnapshot: line.imageKey,
    })),
  );

  if (appliedPromo !== null) {
    await recordPromoRedemption(tx, {
      promoCodeId: appliedPromo.promoCodeId,
      orderId: created.id,
      customerId: input.customerId,
      discountMinor,
    });
  }

  await tx.insert(orderEvent).values({
    eventKey: `order:${created.orderNumber}:placed`,
    orderId: created.id,
    eventType: 'order_placed',
    toValue: 'pending',
    actorType: 'customer',
    actorCustomerId: input.customerId,
    payload: {
      itemCount: resolved.reduce((total, line) => total + line.quantity, 0),
      lineCount: resolved.length,
      paymentMethod,
      shippingMinor,
      discountMinor,
      promoCode: appliedPromo?.code ?? null,
      totalMinor,
    },
  });

  await tx
    .update(idempotencyKey)
    .set({ resultRef: created.orderNumber })
    .where(
      sql`${idempotencyKey.scope} = ${IDEMPOTENCY_SCOPE} and ${idempotencyKey.key} = ${input.idempotencyKey}`,
    );

  return {
    orderId: created.id,
    orderNumber: created.orderNumber,
    totalMinor,
    paymentMethod,
    status: 'pending',
    paymentState,
    codState,
    placedAt,
    replayed: false,
  };
}

/** Loads a customer's own order by number, for the idempotent-replay path. */
async function loadCreatedOrder(
  tx: Transaction,
  customerId: number,
  orderNumber: string,
): Promise<Omit<CreatedOrder, 'replayed'> | null> {
  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalMinor: order.totalMinor,
      paymentMethod: order.paymentMethod,
      status: order.status,
      paymentState: order.paymentState,
      codState: order.codState,
      placedAt: order.placedAt,
    })
    .from(order)
    .where(sql`${order.customerId} = ${customerId} and ${order.orderNumber} = ${orderNumber}`);

  return rows[0] ?? null;
}

/** One cart line, priced from database state. The only shape order creation writes from. */
export type ResolvedOrderLine = {
  readonly productId: number;
  readonly variantId: number;
  readonly nameBn: string | null;
  readonly nameEn: string;
  readonly variantLabel: string | null;
  readonly sku: string;
  readonly priceMinor: number;
  readonly compareAtPriceMinor: number | null;
  readonly quantity: number;
  readonly imageKey: string | null;
};

/**
 * Prices a submitted cart, and is the **only** place a line price is resolved.
 *
 * Order creation calls this, and so does the checkout promotion preview: a discount quoted from a
 * different subtotal than the one stored on the order would be a promise the order could not keep.
 * Every product is checked with `checkOrderability` first, so a line that cannot be ordered refuses the
 * whole cart rather than being silently dropped.
 */
export async function resolveOrderLines(
  tx: Transaction,
  lines: readonly CartLineInput[],
): Promise<{ lines: ResolvedOrderLine[]; subtotalMinor: number }> {
  const resolved: ResolvedOrderLine[] = [];

  for (const line of lines) {
    const productId = Number.parseInt(line.productId, 10);
    if (!Number.isSafeInteger(productId)) {
      throw new OrderRefusalError('unavailable', 'a cart line is invalid');
    }

    const availability = await checkOrderability(tx, productId);
    if (!availability.orderable) {
      throw new OrderRefusalError('unavailable', 'a product in the cart cannot be ordered');
    }

    const rows = await tx
      .select({
        productId: product.id,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        variantLabelBn: productVariant.labelBn,
        variantLabelEn: productVariant.labelEn,
        sku: productVariant.sku,
        priceMinor: productVariant.priceMinor,
        compareAtPriceMinor: productVariant.compareAtPriceMinor,
      })
      .from(productVariant)
      .innerJoin(product, sql`${product.id} = ${productVariant.productId}`)
      .where(sql`${productVariant.id} = ${availability.variantId}`);

    const row = rows[0];
    if (row === undefined) {
      // The product changed between the orderability check and this read - refuse rather than guess.
      throw new OrderRefusalError('unavailable', 'a product in the cart cannot be ordered');
    }

    const imageRows = await tx
      .select({ key: productImage.baseKey })
      .from(productImage)
      .where(sql`${productImage.productId} = ${row.productId} and ${productImage.deletedAt} is null`)
      .orderBy(sql`${productImage.isPrimary} desc, ${productImage.sortOrder}`)
      .limit(1);

    resolved.push({
      productId: row.productId,
      variantId: availability.variantId,
      nameBn: row.nameBn,
      nameEn: row.nameEn,
      variantLabel: row.variantLabelEn ?? row.variantLabelBn,
      sku: row.sku,
      priceMinor: row.priceMinor,
      compareAtPriceMinor: row.compareAtPriceMinor,
      // Clamped here as well as at the request boundary, so the invariant holds for any caller: a
      // quantity outside 1..cap is never stored, whatever path reached this function.
      quantity: Math.min(Math.max(Math.trunc(line.quantity), 1), ORDER_LIMITS.maxQuantityPerLine),
      imageKey: imageRows[0]?.key ?? null,
    });
  }

  let subtotalMinor = 0;
  for (const line of resolved) subtotalMinor += line.priceMinor * line.quantity;

  return { lines: resolved, subtotalMinor };
}
