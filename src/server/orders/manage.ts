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
  readonly itemsSubtotalMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly recipientName: string;
  readonly districtCode: string | null;
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
  options: { readonly search?: string; readonly limit?: number; readonly offset?: number } = {},
): Promise<CodQueueRow[]> {
  const search = options.search?.trim() ?? '';
  const limit = Math.min(Math.max(options.limit ?? CUSTOMER_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
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
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
      recipientName: orderContact.recipientName,
      districtCode: orderContact.districtCode,
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
    .orderBy(order.placedAt, order.id)
    .limit(limit)
    .offset(offset);
}

/**
 * The size of the whole waiting worklist, and of the search-narrowed one.
 *
 * Both numbers come from the same predicate the queue and its page use, so the tab badge (no search)
 * and the footer ("showing 25 of 40") cannot disagree with the rows on screen.
 */
export async function countCodApprovalQueue(tx: Transaction, search = ''): Promise<number> {
  const term = search.trim();
  const searchClause =
    term === ''
      ? sql`true`
      : sql`(${order.orderNumber} ilike ${likeTerm(term)}
          or ${orderContact.recipientName} ilike ${likeTerm(term)}
          or ${orderContact.recipientPhone} ilike ${likeTerm(term)})`;
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending' and ${searchClause}`);
  return rows[0]?.total ?? 0;
}

/**
 * When the oldest waiting call was placed, or `null` when nothing waits.
 *
 * The overview states "Waiting on a call 3 / 8 h" and nothing else about the queue since the duplicate
 * panel was removed (owner direction, 2026-11-20), so it needs this one aggregate rather than the rows -
 * reading twenty-five orders and their lines to learn a single timestamp was work nobody saw. The
 * predicate is the queue's own, so the figure and the list it opens cannot disagree.
 */
export async function oldestCodApprovalPlacedAt(tx: Transaction): Promise<Date | null> {
  const rows = await tx
    .select({ placedAt: sql<string | null>`min(${order.placedAt})::text` })
    .from(order)
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`);
  const value = rows[0]?.placedAt ?? null;
  // `min(timestamptz)` arrives as text through the driver, so it is read back into a Date here rather
  // than leaving every caller to remember that this one aggregate is not typed like its column.
  return value === null ? null : new Date(value);
}

// ------------------------------------------------------------------
// COD confirmation decisions
// ------------------------------------------------------------------

export type CodDecision = 'approve' | 'reject';

/** Minimum reason length shared with `suspendCustomer` and `customer_flag.reason` (>= 10 chars). */
const MIN_REASON = 10;

/**
 * What an empty note records. Two different sentences, because the two decisions mean different
 * things: an approval the owner did not annotate was confirmed on the call, and a rejection the owner
 * did not annotate carries no reason the record can claim. `order.cancelled_reason` and the audit row
 * are `NOT NULL`-ish in effect (`order_cancelled_has_reason`), so "no reason" has to be *stated*, not
 * left blank.
 */
const DEFAULT_APPROVAL_NOTE = 'Confirmed by phone';
const DEFAULT_REJECTION_NOTE = 'No reason recorded.';

/**
 * The note a COD decision records.
 *
 * **A reason is optional on both decisions** (owner direction, 2026-11-19). The rejection dialog used
 * to demand ten characters, which on a phone call that is already over was a hurdle with no recorded
 * gain: an order is refused for one obvious reason far more often than not. A typed note is still
 * stored word for word, and still has to be a real sentence - one character is not a note - but an
 * empty field is now accepted, and records the fixed sentence that states what happened rather than
 * leaving the column blank (`order_cancelled_has_reason` and the audit row both want a value).
 */
function decisionReason(raw: string, decision: CodDecision): string {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value === '') {
    return decision === 'reject' ? DEFAULT_REJECTION_NOTE : DEFAULT_APPROVAL_NOTE;
  }
  if (value.length < MIN_REASON) {
    throw new ValidationError(`a note of at least ${MIN_REASON} characters is required, or leave it empty`);
  }
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

  const reason = decisionReason(input.reason, input.decision);

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
  readonly email: string | null;
  /** The second sign-in identifier, when the account has one. */
  readonly phone: string | null;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly orderCount: number;
  readonly lastOrderAt: Date | string | null;
  readonly flagged: boolean;
  /** The reason the latest suspension recorded, for a suspended row only. */
  readonly suspendedReason: string | null;
  readonly suspendedAt: Date | string | null;
};

/** Rows per page for the customer worklist. */
export const CUSTOMER_PAGE_SIZE = 25;

/**
 * The customer worklist, for the owner's moderation view - email, standing and order count only.
 *
 * Paginated with an exact total: the customer table only grows, and an unbounded list would eventually
 * render every account on one page.
 */
export async function listCustomers(
  tx: Transaction,
  options: {
    readonly search?: string;
    readonly limit?: number;
    readonly offset?: number;
    /**
     * Standing filter. `all` is the default; `flagged` is a raised review flag, which blocks nothing
     * and is not a suspension.
     */
    readonly filter?: 'all' | 'active' | 'suspended' | 'flagged';
  } = {},
): Promise<{ readonly rows: CustomerQueueRow[]; readonly total: number }> {
  const limit = Math.min(Math.max(options.limit ?? CUSTOMER_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${customer.email} ilike ${likeTerm(search)}
          or coalesce(${customer.phone}, '') ilike ${likeTerm(search)}
          or coalesce(${customer.displayName}, '') ilike ${likeTerm(search)})`;
  /*
   * The standing filter, applied in SQL beside the search so the pager's total is the filtered total.
   * `flagged` reads a raised review flag rather than a status: a flag blocks nothing (D20), and the
   * screen words it that way, so a shared predicate would be a lie about what the chip does.
   */
  const filter = options.filter ?? 'all';
  const filterClause =
    filter === 'active'
      ? sql`${customer.status} = 'active'`
      : filter === 'suspended'
        ? sql`${customer.status} = 'suspended'`
        : filter === 'flagged'
          ? sql`exists (
              select 1 from customer_flag
              where customer_flag.customer_id = customer.id and customer_flag.state = 'raised'
            )`
          : sql`true`;
  const rows = await tx
    .select({
      customerId: customer.id,
      email: customer.email,
      phone: customer.phone,
      displayName: customer.displayName,
      status: customer.status,
      createdAt: customer.createdAt,
      orderCount: sql<number>`(
        select count(*)::int from "order" where "order"."customer_id" = customer.id
      )`,
      /*
       * A `max()` aggregate over a raw sql`` fragment arrives from the driver as a string, not a Date:
       * there is no column type to map it against. The page serialises both shapes; typed as it really
       * is, so a caller cannot assume a Date and throw on the first customer who has actually ordered.
       */
      lastOrderAt: sql<Date | string | null>`(
        select max("order"."placed_at") from "order" where "order"."customer_id" = customer.id
      )`,
      flagged: sql<boolean>`exists (
        select 1 from customer_flag where customer_flag.customer_id = customer.id and customer_flag.state = 'raised'
      )`,
      /*
       * Why the account stands as it does (owner direction, 2026-11-21).
       *
       * A suspension row stated the fact and nothing else: the owner was asked to decide an
       * irreversible restore - sessions do not come back - with no memory of the finding behind it, and
       * the reason lived only on the audit screen. It is the same appended record the suspension wrote,
       * read for the row that carries it, not a second stored field.
       */
      suspendedReason: sql<string | null>`(
        select audit_event.reason from audit_event
        where audit_event.action = 'customer.banned'
          and audit_event.entity_type = 'customer'
          and audit_event.entity_id = customer.id
        order by audit_event.occurred_at desc
        limit 1
      )`,
      /*
       * `max()` over a timestamptz arrives from the driver as a string, not a Date: a raw sql``
       * expression carries no column type for it to map against. The page serialises both shapes.
       */
      suspendedAt: sql<Date | string | null>`(
        select max(audit_event.occurred_at) from audit_event
        where audit_event.action = 'customer.banned'
          and audit_event.entity_type = 'customer'
          and audit_event.entity_id = customer.id
      )`,
    })
    .from(customer)
    .where(sql`${customer.deletedAt} is null and ${searchClause} and ${filterClause}`)
    .orderBy(sql`${customer.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(customer)
    .where(sql`${customer.deletedAt} is null and ${searchClause} and ${filterClause}`);

  return { rows, total: counted[0]?.total ?? 0 };
}
