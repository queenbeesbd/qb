/**
 * Order-lifecycle management - the owner's COD decisions and customer moderation
 * (Phase 16A, ADR 0014; narrowed to Cash on Delivery in Phase 17).
 *
 * Every action here is the same shape, on purpose:
 *
 * 1. **The route checked the session; the service re-checks the permission** (`requirePermission`),
 *    so a caller that forgets the route check fails closed.
 * 2. **The transition is guarded in the UPDATE's WHERE clause** on the current state, so a racing
 *    request or a double click cannot produce a second decision: the loser updates zero rows and
 *    reads `conflict` instead.
 * 3. **The order event and the state change commit in the caller's transaction**, so the decision and
 *    its record exist together or not at all.
 * 4. **No adverse decision bans anyone.** A ban is `suspendCustomer`, called explicitly. A COD
 *    rejection touches only the order.
 *
 * Cash on Delivery is the only method this release accepts (Phase 17), so the owner's worklist is the
 * COD confirmation queue: the owner calls the customer, then accepts or cancels. A rejected COD order
 * cancels the order (`status='cancelled'`, guarded to `pending` only) and leaves `cod_state` at
 * `cod_pending_approval` - the schema's `cod_state -> not_applicable` path is the "declined the method"
 * case, not the case where the owner has spoken to the customer. The queue read filters on the same
 * two columns the decision guards, so a cancelled order leaves the worklist for good.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { likeTerm } from '@/lib/search';
import { customer, order, orderContact, orderEvent } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';

// ------------------------------------------------------------------
// Reads - the owner queue
// ------------------------------------------------------------------

export type CodQueueRow = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly totalMinor: number;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly area: string;
  readonly city: string;
  readonly addressLine: string;
};

/**
 * COD orders awaiting the owner's call and confirmation, oldest first.
 *
 * `search` matches the order number, the recipient's name or the phone number - the three things
 * the owner has in front of them when a customer calls back. It is applied in SQL over the same
 * guarded predicate, so filtering cannot widen the worklist.
 */
export async function listCodApprovalQueue(
  tx: Transaction,
  options: { readonly search?: string } = {},
): Promise<CodQueueRow[]> {
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${order.orderNumber} ilike ${likeTerm(search)}
          or ${orderContact.recipientName} ilike ${likeTerm(search)}
          or ${orderContact.recipientPhone} ilike ${likeTerm(search)})`;
  return tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      totalMinor: order.totalMinor,
      recipientName: orderContact.recipientName,
      recipientPhone: orderContact.recipientPhone,
      area: orderContact.area,
      city: orderContact.city,
      addressLine: orderContact.addressLine,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    // Both halves of the same guard the decision holds: `cod_state` alone would keep an order the
    // owner has already rejected - which a rejection cancels - in this worklist for good, where every
    // further action could only answer "already decided".
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending' and ${searchClause}`)
    .orderBy(order.placedAt, order.id);
}

export async function countCodApprovalQueue(tx: Transaction): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`);
  return rows[0]?.total ?? 0;
}

// ------------------------------------------------------------------
// COD confirmation decisions
// ------------------------------------------------------------------

export type CodDecision = 'approve' | 'reject';

/** Minimum reason length shared with `suspendCustomer` and `customer_flag.reason` (>= 10 chars). */
const MIN_REASON = 10;

function decisionReason(raw: string, minimum: number): string {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length < minimum) throw new ValidationError(`a reason of at least ${minimum} characters is required`);
  return value;
}

/**
 * Applies one COD decision after the owner's call.
 *
 * Approving guards `cod_state = 'cod_pending_approval'` and also flips `order.status` to `confirmed`,
 * both guarded, so a COD order the owner accepted is exactly the order that moves on to processing.
 * Rejecting cancels the order - only while it is still `pending`, so an order that somehow moved on is
 * refused rather than cancelled from a later stage.
 */
export async function decideCod(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly decision: CodDecision; readonly reason: string },
): Promise<{ applied: boolean }> {
  const permission = input.decision === 'approve' ? PERMISSIONS.codApprove : PERMISSIONS.orderCancel;
  await requirePermission(actor, permission, 'order', input.orderId);

  const reason = decisionReason(input.reason, MIN_REASON);

  const orderRows = await tx
    .select({ id: order.id, orderNumber: order.orderNumber, codState: order.codState, status: order.status })
    .from(order)
    .where(sql`${order.id} = ${input.orderId}`);
  const row = orderRows[0];
  if (row === undefined) throw new ValidationError('no such order');
  if (row.codState !== 'cod_pending_approval') throw new ConflictError('this order has already been decided');

  const decidedAt = new Date();

  if (input.decision === 'approve') {
    const approved = await tx
      .update(order)
      .set({ codState: 'cod_approved', status: 'confirmed', confirmedAt: decidedAt, updatedAt: decidedAt })
      .where(sql`${order.id} = ${row.id} and ${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`)
      .returning({ id: order.id });
    if (approved.length === 0) throw new ConflictError('this order has already been decided');
    await tx.insert(orderEvent).values({
      eventKey: `order:${row.orderNumber}:cod-approved`,
      orderId: row.id,
      eventType: 'cod_approved',
      fromValue: 'cod_pending_approval',
      toValue: 'cod_approved',
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      reason,
      payload: { orderStatus: 'confirmed' },
    });
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'cod.approved',
      entityType: 'order',
      entityId: row.id,
      before: { codState: 'cod_pending_approval', status: row.status },
      after: { codState: 'cod_approved', status: 'confirmed' },
      reason,
    });
    return { applied: true };
  }

  const cancelled = await tx
    .update(order)
    .set({ status: 'cancelled', cancelledAt: decidedAt, cancelledReason: reason, updatedAt: decidedAt })
    .where(sql`${order.id} = ${row.id} and ${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`)
    .returning({ id: order.id });
  if (cancelled.length === 0) throw new ConflictError('this order has already been decided');
  await tx.insert(orderEvent).values({
    eventKey: `order:${row.orderNumber}:cod-rejected`,
    orderId: row.id,
    eventType: 'order_cancelled',
    fromValue: 'cod_pending_approval',
    toValue: 'cancelled',
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    reason,
    payload: { decision: 'cod_rejected' },
  });
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'cod.cancelled',
    entityType: 'order',
    entityId: row.id,
    // Deliberate: `cod_state` stays `cod_pending_approval` because the schema binds it to the payment
    // method (`order_cod_state_only_for_cod`), and cancelling the order - not changing a COD method -
    // is what a rejection records. The queue read filters on the same state this guard holds, so a
    // rejected COD order leaves the worklist without ever claiming it became something else.
    before: { codState: 'cod_pending_approval', status: 'pending' },
    after: { codState: 'cod_pending_approval', status: 'cancelled' },
    reason,
  });
  return { applied: true };
}

// ------------------------------------------------------------------
// Customer moderation
// ------------------------------------------------------------------

export type CustomerQueueRow = {
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly orderCount: number;
  readonly lastOrderAt: Date | null;
  readonly flagged: boolean;
};

/** The customer worklist, for the owner's moderation view - email, standing and order count only. */
export async function listCustomers(
  tx: Transaction,
  options: { readonly search?: string } = {},
): Promise<CustomerQueueRow[]> {
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${customer.email} ilike ${likeTerm(search)} or coalesce(${customer.displayName}, '') ilike ${likeTerm(search)})`;
  const rows = await tx
    .select({
      customerId: customer.id,
      email: customer.email,
      displayName: customer.displayName,
      status: customer.status,
      createdAt: customer.createdAt,
      orderCount: sql<number>`(
        select count(*)::int from "order" where "order"."customer_id" = customer.id
      )`,
      lastOrderAt: sql<Date | null>`(
        select max("order"."placed_at") from "order" where "order"."customer_id" = customer.id
      )`,
      flagged: sql<boolean>`exists (
        select 1 from customer_flag where customer_flag.customer_id = customer.id and customer_flag.state = 'raised'
      )`,
    })
    .from(customer)
    .where(sql`${customer.deletedAt} is null and ${searchClause}`)
    .orderBy(sql`${customer.createdAt} desc`);
  return rows;
}
