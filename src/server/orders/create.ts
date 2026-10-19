/**
 * Order creation - the one authoritative write in Phase 15.
 *
 * Everything here happens inside **one transaction**, supplied by the caller through
 * `withTransaction`. That is the whole design: the idempotency claim, the ban check, the availability
 * read, the price resolution and the order's own rows commit together or not at all, so a failed
 * submission leaves no partial order and a retry cannot create a second one.
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
  paymentClaim,
  paymentRecipient,
  product,
  productImage,
  productVariant,
} from '@/db/schema';
import { checkOrderability } from '@/server/catalog/orderability';

import { ORDER_LIMITS, type CartLineInput, type ContactInput, type PaymentMethodInput } from './validation';

const IDEMPOTENCY_SCOPE = 'order_create';
/** Scope for the payment-claim idempotency key; kept distinct so a replay is never an order replay. */
const CLAIM_IDEMPOTENCY_SCOPE = 'claim_submit';
/** The claim idempotency window matches the order window: the browser retries both the same way. */
const CLAIM_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** The stored key is retained for a bounded window; a replay gets the original order within it. */
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OrderRefusalReason =
  /** The account is suspended (banned) or deleted, checked inside the order transaction (D20). */
  | 'banned'
  /** The submitted cart was empty or malformed. */
  | 'empty_cart'
  /** At least one product is not orderable from current database state (unpublished, archived, out of stock). */
  | 'unavailable'
  /** A prepaid submission lacked a claim, or its claim fields were invalid. */
  | 'invalid'
  /**
   * The prepaid method has no active recipient, so the owner is not currently accepting it. Distinct
   * from `invalid` on purpose: the customer did nothing wrong, and telling them to check their input
   * sent them looking for a mistake that was not there (found in the Phase 16B review).
   */
  | 'payment_unavailable'
  /** The idempotency key was reused with a different body, or a first attempt is still in flight. */
  | 'idempotency_conflict';

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
};

export type PaymentClaimInput = {
  /** The active recipient for this method, resolved by the route from owner configuration. */
  readonly paymentRecipientId: number;
  readonly senderMsisdn: string;
  readonly transactionReference: string;
  /** The claimed amount, poisha. Recorded, never trusted (D8; the order total is authoritative). */
  readonly claimedAmountMinor: number;
};

export type CreateOrderInput = {
  readonly customerId: number;
  readonly idempotencyKey: string;
  /** Digest of the submitted body; a mismatch on a seen key is a conflict. */
  readonly fingerprint: string;
  readonly lines: readonly CartLineInput[];
  readonly contact: ContactInput;
  readonly paymentMethod: PaymentMethodInput;
  /** Required when `paymentMethod` is an MFS transfer; `null` for COD (COD has no claim). */
  readonly claim: PaymentClaimInput | null;
};

/** An opaque public order reference. Random, uppercase hex, never a sequence and never a customer id. */
function generateOrderNumber(): string {
  return `QB${randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * Creates an order, or returns the original one for a replayed submission.
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
    return replayed;
  }

  // 2. Account standing, inside this transaction (D20). A UI check would not be enforcement.
  const account = await tx
    .select({ status: customer.status })
    .from(customer)
    .where(sql`${customer.id} = ${input.customerId}`);
  if (account[0] === undefined || account[0].status !== 'active') {
    throw new OrderRefusalError('banned', 'this account cannot place orders');
  }

  // 3. Resolve every line from database state: orderability, then the authoritative price.
  const resolved: {
    productId: number;
    variantId: number;
    nameBn: string;
    nameEn: string;
    variantLabel: string | null;
    sku: string;
    priceMinor: number;
    compareAtPriceMinor: number | null;
    quantity: number;
    imageKey: string | null;
  }[] = [];

  for (const line of input.lines) {
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

  // 4. Totals, in integer poisha, from the database prices only.
  let subtotalMinor = 0;
  for (const line of resolved) subtotalMinor += line.priceMinor * line.quantity;
  // Delivery charges remain unconfigured (ADR 0014 Part 5), so shipping is zero and the total is the
  // subtotal. This is a stated gap, not an estimate: the storefront says delivery is arranged at
  // confirmation, and nothing puts a delivery charge into a total until the owner sets one.
  const shippingMinor = 0;
  const totalMinor = subtotalMinor + shippingMinor;

  const placedAt = new Date();
  const paymentMethod = input.paymentMethod;
  const isCod = paymentMethod === 'cod';
  const paymentState = isCod ? 'not_applicable' : 'awaiting_payment';
  const codState = isCod ? 'cod_pending_approval' : 'not_applicable';
  // D9/ADR 0014: the claim, not a timer, is what makes an order non-expirable. A prepaid order leaving
  // this function carries its submitted claim and **no** expiry timestamp; the expiry rule applies only
  // to claim-less orders, which this flow cannot produce. A COD order has no prepaid payment to expire.
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
      totalMinor,
    },
  });

  // The prepaid claim is written **in the same transaction as the order**, and the order moves to
  // `awaiting_verification` with its expiry cleared: the claim, not a timer, is what makes an order
  // non-expirable (ADR 0014). A replay resolves through the claim's own idempotency key below.
  if (input.claim !== null) {
    const recipient = await tx
      .select({ id: paymentRecipient.id, isActive: paymentRecipient.isActive, method: paymentRecipient.method })
      .from(paymentRecipient)
      .where(sql`${paymentRecipient.id} = ${input.claim.paymentRecipientId}`);
    const recipientRow = recipient[0];
    if (recipientRow === undefined || !recipientRow.isActive || recipientRow.method !== paymentMethod) {
      throw new OrderRefusalError('invalid', 'the payment recipient is not available');
    }

    const claimKey = `${IDEMPOTENCY_SCOPE}:${input.idempotencyKey}`;
    await tx.insert(idempotencyKey).values({
      scope: CLAIM_IDEMPOTENCY_SCOPE,
      key: claimKey,
      principalKind: 'customer',
      principalId: input.customerId,
      requestFingerprint: input.fingerprint,
      resultRef: created.orderNumber,
      expiresAt: new Date(Date.now() + CLAIM_IDEMPOTENCY_TTL_MS),
    });

    await tx.insert(paymentClaim).values({
      orderId: created.id,
      paymentRecipientId: recipientRow.id,
      senderMsisdn: input.claim.senderMsisdn,
      transactionReference: input.claim.transactionReference,
      claimedAmountMinor: input.claim.claimedAmountMinor,
      state: 'submitted',
      submittedByCustomerId: input.customerId,
    });

    const claimedOrder = await tx
      .update(order)
      .set({ paymentState: 'awaiting_verification', expiresAt: null, updatedAt: new Date() })
      .where(sql`${order.id} = ${created.id} and ${order.paymentState} = 'awaiting_payment'`)
      .returning({ id: order.id });
    if (claimedOrder.length === 0) throw new Error('claim: the order was not in awaiting_payment');
  }

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
    paymentState: input.claim !== null ? 'awaiting_verification' : paymentState,
    codState,
    placedAt,
  };
}

/** Loads a customer's own order by number, for the idempotent-replay path. */
async function loadCreatedOrder(
  tx: Transaction,
  customerId: number,
  orderNumber: string,
): Promise<CreatedOrder | null> {
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
