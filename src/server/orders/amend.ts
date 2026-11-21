/**
 * ADR 0046 - append one product line to a placed order before dispatch.
 *
 * The customer calls and asks for one more product. The owner adds it from the order screen; the line
 * is a frozen snapshot like every other line, and only the order's goods subtotal and charged total
 * move, by the same positive amount, inside the guarded path the database now allows.
 *
 * Every guarantee from the other order services holds here too: the route checked the session, this
 * service re-checks its own permission, the order row is locked, and the line, totals, event and audit
 * record commit in the caller's transaction. A racing or repeated request writes once and returns the
 * order rather than charging the customer twice.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderEvent, orderItem, product, productImage, productVariant } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';

/** The owner recognises a product on a phone call; this is a confirmation, not a restock operation. */
const MIN_REASON = 10;
const MAX_REASON = 500;
const MAX_QUANTITY = 20;
/** A pasted decimal point must never turn a phone-call addition into a huge charge. */
const MAX_LINE_MINOR = 100_000_000;
const DEFAULT_REASON = 'Added at the customer’s request by phone.';
const IDEMPOTENCY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only an order that has not left the shop can be amended. */
const AMENDABLE_STATUS = ['pending', 'confirmed', 'processing'] as const;

export type AddOrderLineInput = {
  readonly orderId: number;
  readonly productId: number;
  readonly variantId: number | null;
  readonly quantity: number;
  readonly reason: string;
  /** A UUID generated with the form, so a double submit is one fact, not two. */
  readonly idempotencyKey: string;
};

export type AddOrderLineResult = {
  readonly lineTotalMinor: number;
  readonly subtotalMinor: number;
  readonly totalMinor: number;
  /** True when this key had already been recorded; no second line was written. */
  readonly replay: boolean;
};

/**
 * Append one line to an order before dispatch.
 *
 * The product must be published, live and in stock: adding a line is an order, and the availability
 * state is the only ordering gate (ADR 0013). No movement, reservation or stock change is written.
 */
export async function addOrderLine(
  tx: Transaction,
  actor: ActorContext,
  input: AddOrderLineInput,
): Promise<AddOrderLineResult> {
  // The service is the control even when a route, form or future caller forgets the permission.
  await requirePermission(actor, PERMISSIONS.orderAmend, 'order', input.orderId);

  const reason = (input.reason ?? '').replace(/\s+/g, ' ').trim() || DEFAULT_REASON;
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    throw new ValidationError(`a reason of at least ${MIN_REASON} characters is required`);
  }
  if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) {
    throw new ValidationError('invalid addition reference');
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY) {
    throw new ValidationError(`quantity must be between 1 and ${MAX_QUANTITY}`);
  }

  // The row lock makes two simultaneous additions to the same order serial.
  const orderRows = await tx
    .select({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      codState: order.codState,
      paymentMethod: order.paymentMethod,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      totalMinor: order.totalMinor,
    })
    .from(order)
    .where(eq(order.id, input.orderId))
    .for('update')
    .limit(1);
  const row = orderRows[0];
  if (row === undefined) throw new ValidationError('no such order');
  if (
    row.paymentMethod !== 'cod' ||
    !(AMENDABLE_STATUS as readonly string[]).includes(row.status) ||
    (row.codState !== 'cod_pending_approval' && row.codState !== 'cod_approved')
  ) {
    throw new ConflictError('this order can no longer be changed');
  }

  const eventKey = `order:${row.orderNumber}:line:${input.idempotencyKey}`;
  const existing = await tx
    .select({ id: orderEvent.id })
    .from(orderEvent)
    .where(eq(orderEvent.eventKey, eventKey))
    .limit(1);
  if (existing.length > 0) {
    return {
      lineTotalMinor: 0,
      subtotalMinor: row.itemsSubtotalMinor,
      totalMinor: row.totalMinor,
      replay: true,
    };
  }

  const productRows = await tx
    .select({
      id: product.id,
      nameBn: product.nameBn,
      nameEn: product.nameEn,
      availability: product.availability,
    })
    .from(product)
    .where(
      and(
        eq(product.id, input.productId),
        isNull(product.deletedAt),
        eq(product.isPublished, true),
        eq(product.availability, 'in_stock'),
      ),
    )
    .limit(1);
  const selectedProduct = productRows[0];
  if (selectedProduct === undefined) throw new ValidationError('that product is not orderable');

  const variantRows = await tx
    .select({
      id: productVariant.id,
      sku: productVariant.sku,
      labelBn: productVariant.labelBn,
      labelEn: productVariant.labelEn,
      priceMinor: productVariant.priceMinor,
    })
    .from(productVariant)
    .where(
      input.variantId === null
        ? and(eq(productVariant.productId, selectedProduct.id), eq(productVariant.isDefault, true), eq(productVariant.isActive, true))
        : and(
            eq(productVariant.id, input.variantId),
            eq(productVariant.productId, selectedProduct.id),
            eq(productVariant.isActive, true),
          ),
    )
    .limit(1);
  const variant = variantRows[0];
  if (variant === undefined) throw new ValidationError('that product has no available pack');
  if (variant.priceMinor <= 0) throw new ValidationError('the recorded price is not valid');

  const lineTotalMinor = variant.priceMinor * input.quantity;
  if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor > MAX_LINE_MINOR) {
    throw new ValidationError('the addition is too large');
  }

  // The photograph is the primary-or-first asset, the same projection the picker showed the owner.
  const imageRows = await tx
    .select({ baseKey: productImage.baseKey })
    .from(productImage)
    .where(and(eq(productImage.productId, selectedProduct.id), isNull(productImage.deletedAt)))
    .orderBy(sql`"product_image"."is_primary" desc, "product_image"."sort_order" asc, "product_image"."id" asc`)
    .limit(1);

  const subtotalMinor = row.itemsSubtotalMinor + lineTotalMinor;
  const totalMinor = row.totalMinor + lineTotalMinor;

  /*
    The flag is scoped to this transaction (`set_config(..., true)`), so the trigger's exception is not
    a general permission to edit amounts. It is set only after every validation has passed and cleared
    in `finally`, even when a constraint refuses the write.
  */
  await tx.execute(sql`select set_config('qb.order_amendment', 'on', true)`);
  try {
    await tx.insert(orderItem).values({
      orderId: row.id,
      variantId: variant.id,
      productNameBn: selectedProduct.nameBn,
      productNameEn: selectedProduct.nameEn,
      variantLabel: variant.labelEn ?? variant.labelBn,
      sku: variant.sku,
      unitPriceMinor: variant.priceMinor,
      quantity: input.quantity,
      lineTotalMinor,
      imageKeySnapshot: imageRows[0]?.baseKey ?? null,
    });

    await tx
      .update(order)
      .set({ itemsSubtotalMinor: subtotalMinor, totalMinor, updatedAt: new Date() })
      .where(eq(order.id, row.id));

    await tx.insert(orderEvent).values({
      eventKey,
      orderId: row.id,
      eventType: 'order_line_added',
      fromValue: null,
      toValue: selectedProduct.nameEn,
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      reason,
      payload: {
        productId: selectedProduct.id,
        variantId: variant.id,
        quantity: input.quantity,
        unitPriceMinor: variant.priceMinor,
        lineTotalMinor,
      },
    });

    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'order.line_added',
      entityType: 'order',
      entityId: row.id,
      before: { itemsSubtotalMinor: row.itemsSubtotalMinor, totalMinor: row.totalMinor },
      after: { itemsSubtotalMinor: subtotalMinor, totalMinor, lineTotalMinor, productId: selectedProduct.id },
      reason,
    });
  } finally {
    await tx.execute(sql`select set_config('qb.order_amendment', 'off', true)`);
  }

  return { lineTotalMinor, subtotalMinor, totalMinor, replay: false };
}
