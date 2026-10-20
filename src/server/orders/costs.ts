/**
 * Additional courier costs and the money figures derived from them (Phase 22).
 *
 * **What the owner is told, and what the code is allowed to claim.** Customers pay the product price
 * plus the delivery fee, and the courier keeps a standard delivery charge. The configured delivery fee
 * *is* that standard charge, so it is subtracted **once**, never twice, and only from a figure that
 * already includes it. The courier may also impose an unexpected charge on one particular order; that
 * is the only thing this module records, because it is the only thing the platform can know.
 *
 * **What it deliberately does not do.** It writes no entry on `order`: the customer's charged total is
 * frozen by `order_immutable_columns` and an additional cost is the *shop's* expense, not a line on
 * the customer's invoice. It does not subtract costs from stored revenue anywhere - the dashboard
 * derives every figure on read, so there is no counter that could be adjusted twice. And it does not
 * classify a cost: the owner's description is the classification, because a fixed category list would
 * be a policy nobody approved.
 *
 * **The standard-fee assumption is checked, not assumed.** `order.shipping_minor` is the frozen snapshot
 * of what the customer was charged for delivery. It equals the configured standard fee for every order
 * placed under the three-area model (ADR 0016), because checkout copies the configured amount into the
 * order. It does **not** for an order that predates that model, which carries `0` and has no
 * `district_code`; those orders report the net figure as **unavailable** rather than netting a fee
 * they never really separated.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderAdditionalCost } from '@/db/schema';
import { MAX_PRICE_MINOR, parsePoisha } from '@/server/catalog/validation';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

/** Description bounds. Long enough to say "extra weight fee", short enough not to become a document. */
const MIN_DESCRIPTION = 3;
const MAX_DESCRIPTION = 200;
const MIN_REASON = 3;
const MAX_REASON = 200;

/** One recorded cost, as a screen shows it. */
export type AdditionalCost = {
  readonly id: number;
  readonly amountMinor: number;
  readonly description: string;
  readonly recordedAt: Date;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
};

/**
 * A cost the owner typed, before it is persisted.
 *
 * Both fields are read from the form as untrusted strings and validated in `recordAdditionalCost`, so
 * a caller cannot construct a valid one by accident.
 */
export type AdditionalCostInput = { readonly amount: unknown; readonly description: unknown };

function requiredDescription(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length < MIN_DESCRIPTION) {
    throw new ValidationError(`a cost description of at least ${MIN_DESCRIPTION} characters is required`);
  }
  if (text.length > MAX_DESCRIPTION) {
    throw new ValidationError(`a cost description may be at most ${MAX_DESCRIPTION} characters`);
  }
  return text;
}

function requiredReason(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length < MIN_REASON) throw new ValidationError('a reason is required to void a cost');
  if (text.length > MAX_REASON) throw new ValidationError(`a reason may be at most ${MAX_REASON} characters`);
  return text;
}

/**
 * Parses an owner-typed cost.
 *
 * `parsePoisha` refuses a bare number, a negative value, a formatted amount and any exponent - a number
 * has no unit and guessing wrong is a 100x money error. Zero is refused here (unlike a delivery charge)
 * because a zero-cost row would be a claim that the shop spent nothing.
 */
export function parseCostAmount(value: unknown): number | null {
  const minor = parsePoisha(value, { allowZero: false });
  return minor !== null && minor <= MAX_PRICE_MINOR ? minor : null;
}

/**
 * Appends one cost to an order.
 *
 * Runs inside the caller's transaction, so the payment receipt, the completion and the costs entered
 * with it either all commit or none of them do. The caller has already checked the page permission;
 * this re-checks it, because a service that trusts its caller is a service with no authorization.
 */
export async function recordAdditionalCost(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly amount: unknown; readonly description: unknown },
): Promise<number> {
  await requirePermission(actor, PERMISSIONS.orderCostRecord, 'order', input.orderId);

  const amountMinor = parseCostAmount(input.amount);
  if (amountMinor === null) throw new ValidationError('the cost must be a positive BDT amount');
  const description = requiredDescription(input.description);

  const exists = await tx
    .select({ id: order.id })
    .from(order)
    .where(sql`${order.id} = ${input.orderId}`);
  if (exists.length === 0) throw new ValidationError('no such order');

  const inserted = await tx
    .insert(orderAdditionalCost)
    .values({
      orderId: input.orderId,
      amountMinor,
      description,
      recordedByStaffId: actor.staffUserId,
    })
    .returning({ id: orderAdditionalCost.id });
  const row = inserted[0];
  if (row === undefined) throw new Error('additional cost insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'order.cost_recorded',
    entityType: 'order',
    entityId: input.orderId,
    before: null,
    after: { costId: row.id, amountMinor, description },
  });

  return row.id;
}

/**
 * Voids a recorded cost. `undefined` means it did not exist; an `Error` means the request was refused.
 *
 * A void is the only correction path: the amount and description are frozen, so the history of what the
 * owner recorded stays readable and the active total simply stops counting the row.
 */
export async function voidAdditionalCost(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly costId: number; readonly reason: unknown },
): Promise<void> {
  const rows = await tx
    .select({
      id: orderAdditionalCost.id,
      orderId: orderAdditionalCost.orderId,
      amountMinor: orderAdditionalCost.amountMinor,
      description: orderAdditionalCost.description,
      voidedAt: orderAdditionalCost.voidedAt,
    })
    .from(orderAdditionalCost)
    .where(sql`${orderAdditionalCost.id} = ${input.costId}`);
  const existing = rows[0];

  await requirePermission(
    actor,
    PERMISSIONS.orderCostRecord,
    'order_additional_cost',
    existing?.id ?? input.costId,
  );

  if (existing === undefined) throw new ValidationError('no such cost');
  if (existing.voidedAt !== null) throw new ConflictError('that cost is already voided');
  const reason = requiredReason(input.reason);

  const at = new Date();
  const updated = await tx
    .update(orderAdditionalCost)
    .set({ voidedAt: at, voidedByStaffId: actor.staffUserId, voidReason: reason })
    .where(sql`${orderAdditionalCost.id} = ${input.costId} and ${orderAdditionalCost.voidedAt} is null`)
    .returning({ id: orderAdditionalCost.id });
  if (updated.length === 0) throw new ConflictError('that cost is already voided');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'order.cost_voided',
    entityType: 'order',
    entityId: existing.orderId,
    before: { costId: existing.id, amountMinor: existing.amountMinor, voidedAt: null },
    after: { costId: existing.id, amountMinor: existing.amountMinor, voidedAt: at.toISOString() },
    reason,
  });
}

/** Every cost recorded on an order, voided ones included, newest first. */
export async function listAdditionalCosts(tx: Transaction, orderId: number): Promise<AdditionalCost[]> {
  const rows = await tx
    .select({
      id: orderAdditionalCost.id,
      amountMinor: orderAdditionalCost.amountMinor,
      description: orderAdditionalCost.description,
      recordedAt: orderAdditionalCost.recordedAt,
      voidedAt: orderAdditionalCost.voidedAt,
      voidReason: orderAdditionalCost.voidReason,
    })
    .from(orderAdditionalCost)
    .where(sql`${orderAdditionalCost.orderId} = ${orderId}`)
    .orderBy(sql`${orderAdditionalCost.id} desc`);
  return rows;
}

/**
 * The money figures for one order, kept explicitly separate.
 *
 * `customerPaymentMinor` is what the customer paid: product subtotal plus the delivery fee. It is
 * **gross**, and is never called revenue.
 *
 * `standardDeliveryFeeMinor` is the configured fee the customer paid, which equals the courier's standard
 * charge. It is subtracted from the customer payment **once**; `shipping_minor` is exactly the amount the
 * customer was charged for delivery, so netting it is not a second deduction of the same money.
 *
 * `additionalCostsMinor` is the total of costs that have not been voided.
 *
 * `estimatedNetProceedsMinor` is `customerPayment - standardDeliveryFee - additionalCosts`, and it is an
 * **estimate**: the platform knows the courier kept the standard fee and what the owner recorded, not
 * what the courier actually paid out. It is `null` when the order predates the three-area delivery model
 * and therefore cannot substantiate that its `shipping_minor` separated the standard fee at all.
 */
export type OrderMoney = {
  readonly customerPaymentMinor: number;
  readonly standardDeliveryFeeMinor: number;
  readonly additionalCostsMinor: number;
  readonly activeCostCount: number;
  readonly estimatedNetProceedsMinor: number | null;
};

export function orderMoney(input: {
  readonly itemsSubtotalMinor: number;
  readonly shippingMinor: number;
  readonly additionalCostsMinor: number;
  readonly activeCostCount: number;
  /** False when the order carries no delivery-area snapshot, so the standard-fee split is unknown. */
  readonly deliveryFeeSubstantiated: boolean;
}): OrderMoney {
  const customerPaymentMinor = input.itemsSubtotalMinor + input.shippingMinor;
  return {
    customerPaymentMinor,
    standardDeliveryFeeMinor: input.shippingMinor,
    additionalCostsMinor: input.additionalCostsMinor,
    activeCostCount: input.activeCostCount,
    estimatedNetProceedsMinor: input.deliveryFeeSubstantiated
      ? customerPaymentMinor - input.shippingMinor - input.additionalCostsMinor
      : null,
  };
}
