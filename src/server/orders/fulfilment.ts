/**
 * The owner's post-approval COD operations - dispatch, delivery outcome, return to store, inspection
 * and cash collection.
 *
 * Every function here follows the shape Phase 16A established for the COD decision, because the
 * guarantees only hold if they hold everywhere:
 *
 * 1. **The route checked the session; the service re-checks the action's own permission**, so a
 *    caller that forgets the route check fails closed.
 * 2. **The transition is guarded in the UPDATE's WHERE clause** on the state it is allowed to leave.
 *    A racing request, a double click or a stale page updates zero rows and reads `conflict` instead
 *    of producing a second effect.
 * 3. **The state change, its `order_event` and its audit record commit in the caller's transaction**,
 *    so a recorded fact cannot exist without its trail, and a refused one leaves nothing behind.
 * 4. **The event key is unique per order per event**, so even a retry that slipped past the state
 *    guard cannot write the same fact twice.
 *
 * What these functions deliberately do **not** do:
 *
 * - **No stock.** Availability is the owner's binary state and the only ordering gate (D19, ADR 0013).
 *   Inspection records what a person found; it writes no inventory movement, restocks nothing and
 *   does not flip a product In Stock. The owner does that on the product screen, after looking.
 * - **No money is invented.** There is no collected-amount column and no adjustment, so collection
 *   records the event and the actor, and the order's saved total is never rewritten - the `order`
 *   immutability trigger refuses the attempt anyway.
 * - **No courier reconciliation.** QueenBee's has no courier statement and no settlement-matching
 *   workflow, so `cod_reconciled` is written by nothing. Payment receipt is the owner's own recorded
 *   confirmation; it is not a bank or courier statement match, and nothing here compares two sources.
 * - **No automatic anything.** A failed delivery is not retried, cancelled, refunded or reshipped, and
 *   no delivery-charge liability is applied to it.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customerReturn, order, orderEvent, orderItem } from '@/db/schema';
import { recordAudit, type AuditAction } from '../auth/audit';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';

/** Minimum length for a reason a person must give (matching the COD decision and suspension rules). */
const MIN_REASON = 10;
/** Upper bounds, so a pasted log cannot become an order record. */
const MAX_REASON = 500;
const MAX_NOTE = 300;

/** The order's operational position, enough to decide every transition without a second read. */
type OrderStateRow = {
  readonly id: number;
  readonly orderNumber: string;
  readonly status: string;
  readonly codState: string;
  readonly paymentMethod: string;
  readonly paymentState: string;
  readonly totalMinor: number;
};

async function loadOrder(tx: Transaction, orderId: number): Promise<OrderStateRow> {
  const rows = await tx
    .select({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      codState: order.codState,
      paymentMethod: order.paymentMethod,
      paymentState: order.paymentState,
      totalMinor: order.totalMinor,
    })
    .from(order)
    .where(sql`${order.id} = ${orderId}`);
  const row = rows[0];
  if (row === undefined) throw new ValidationError('no such order');
  return row;
}

/** A required reason: collapsed whitespace, bounded, and long enough to mean something. */
function requiredReason(raw: string, what: string): string {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length < MIN_REASON) {
    throw new ValidationError(`a ${what} of at least ${MIN_REASON} characters is required`);
  }
  if (value.length > MAX_REASON) throw new ValidationError(`the ${what} must be at most ${MAX_REASON} characters`);
  return value;
}

/** An optional note: absent stays absent rather than becoming an empty string. */
function optionalNote(raw: string | undefined): string | null {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value === '') return null;
  if (value.length > MAX_NOTE) throw new ValidationError(`a note must be at most ${MAX_NOTE} characters`);
  return value;
}

/**
 * Dispatch eligibility, in one predicate.
 *
 * An unapproved COD order is never dispatched (data-model 11.6), and a prepaid order - the retired
 * method, present only as history - requires a verified payment (11.1). Expressing it once keeps the
 * write guard and any read from disagreeing about what "dispatchable" means.
 */
const dispatchable = sql`${order.status} in ('confirmed', 'processing')
  and ((${order.paymentMethod} = 'cod' and ${order.codState} = 'cod_approved')
    or (${order.paymentMethod} <> 'cod' and ${order.paymentState} = 'verified'))`;

/** Writes one order event. The key makes a repeated fact impossible to record twice. */
async function writeEvent(
  tx: Transaction,
  input: {
    readonly orderId: number;
    readonly orderNumber: string;
    readonly key: string;
    readonly eventType: string;
    readonly fromValue: string | null;
    readonly toValue: string | null;
    readonly actorStaffId: number;
    readonly reason: string | null;
    readonly payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  await tx.insert(orderEvent).values({
    eventKey: `order:${input.orderNumber}:${input.key}`,
    orderId: input.orderId,
    eventType: input.eventType,
    fromValue: input.fromValue,
    toValue: input.toValue,
    actorType: 'staff',
    actorStaffId: input.actorStaffId,
    reason: input.reason,
    payload: input.payload ?? null,
  });
}

async function writeAudit(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly action: AuditAction;
    readonly orderId: number;
    readonly before: Record<string, unknown>;
    readonly after: Record<string, unknown>;
    readonly reason: string | null;
  },
): Promise<void> {
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: input.action,
    entityType: 'order',
    entityId: input.orderId,
    before: input.before,
    after: input.after,
    reason: input.reason,
  });
}

// ------------------------------------------------------------------
// Dispatch
// ------------------------------------------------------------------

/**
 * `confirmed`/`processing` -> `shipped`. The parcel has left the store.
 *
 * Recording dispatch is **not** a claim about money: cash is still owed at the door.
 */
export async function dispatchOrder(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.orderDispatch, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ status: 'shipped', shippedAt: at, updatedAt: at })
    .where(sql`${order.id} = ${input.orderId} and ${dispatchable}`)
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only an approved, undispatched order can be dispatched (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'shipped',
    eventType: 'order_shipped',
    fromValue: current.status,
    toValue: 'shipped',
    actorStaffId: actor.staffUserId,
    reason: note,
  });
  await writeAudit(tx, actor, {
    action: 'order.dispatched',
    orderId: current.id,
    before: { status: current.status, codState: current.codState },
    after: { status: 'shipped', codState: current.codState },
    reason: note,
  });
}

// ------------------------------------------------------------------
// Delivery outcomes
// ------------------------------------------------------------------

/** `shipped` -> `delivered`. The parcel reached the customer. **Not** a claim that cash was received. */
export async function recordDelivered(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.orderDispatch, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ status: 'delivered', deliveredAt: at, updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId} and ${order.status} = 'shipped' and ${order.codState} = 'cod_approved'`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only a dispatched COD order awaiting cash can be marked delivered (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'delivered',
    eventType: 'order_delivered',
    fromValue: 'shipped',
    toValue: 'delivered',
    actorStaffId: actor.staffUserId,
    reason: note,
  });
  await writeAudit(tx, actor, {
    action: 'order.delivered',
    orderId: current.id,
    before: { status: 'shipped', codState: current.codState },
    after: { status: 'delivered', codState: current.codState },
    reason: note,
  });
}

/**
 * `shipped` + `cod_approved` -> `cod_failed`, with one live `customer_return` per line.
 *
 * The goods are coming back, so the return is created here - that is the record of "there is a parcel
 * to receive". The order status stays `shipped` until the parcel is actually back at the store, which
 * is a separate event with a separate actor; writing `returned` on the strength of a failed attempt
 * would claim a receipt nobody has confirmed.
 *
 * **No delivery-charge liability is applied**, the total is untouched, and nothing is retried,
 * cancelled, refunded or reshipped: none of those policies has been decided.
 */
export async function recordDeliveryFailed(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly reason: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.orderDispatch, 'order', input.orderId);
  const reason = requiredReason(input.reason, 'reason');
  const current = await loadOrder(tx, input.orderId);

  const liveReturns = await tx
    .select({ id: customerReturn.id })
    .from(customerReturn)
    .where(
      sql`${customerReturn.orderId} = ${input.orderId}
        and ${customerReturn.state} not in ('closed', 'inspected_rejected')`,
    )
    .limit(1);
  if (liveReturns.length > 0) throw new ConflictError('this order already has a live return');

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ codState: 'cod_failed', updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId} and ${order.status} = 'shipped' and ${order.codState} = 'cod_approved'`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only a dispatched COD order awaiting cash can fail delivery (this one is ${current.status}/${current.codState})`,
    );
  }

  const lines = await tx
    .select({ id: orderItem.id, quantity: orderItem.quantity })
    .from(orderItem)
    .where(sql`${orderItem.orderId} = ${input.orderId}`)
    .orderBy(orderItem.id);
  if (lines.length === 0) throw new ValidationError('this order has no lines to return');

  for (const line of lines) {
    await tx.insert(customerReturn).values({
      orderId: input.orderId,
      orderItemId: line.id,
      quantity: line.quantity,
      reason: 'failed_delivery',
      state: 'requested',
    });
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'cod-failed',
    eventType: 'cod_failed',
    fromValue: 'cod_approved',
    toValue: 'cod_failed',
    actorStaffId: actor.staffUserId,
    reason,
    payload: { returnsCreated: lines.length },
  });
  await writeAudit(tx, actor, {
    action: 'cod.delivery_failed',
    orderId: current.id,
    before: { status: 'shipped', codState: 'cod_approved' },
    after: { status: 'shipped', codState: 'cod_failed' },
    reason,
  });
}

/**
 * The parcel is physically back at the store: live returns -> `received`, order -> `returned`.
 *
 * Physical receipt only. The goods are **not** sellable and no product is made available here - that
 * waits for inspection, and even then availability is the owner's separate decision.
 */
export async function recordParcelReceived(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.returnInspect, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const received = await tx
    .update(customerReturn)
    .set({ state: 'received', receivedAt: at })
    .where(
      sql`${customerReturn.orderId} = ${input.orderId}
        and ${customerReturn.state} in ('requested', 'approved', 'in_transit')`,
    )
    .returning({ id: customerReturn.id });
  if (received.length === 0) {
    throw new ConflictError('no returned parcel is waiting to be received for this order');
  }

  const updated = await tx
    .update(order)
    .set({ status: 'returned', updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId} and ${order.status} = 'shipped' and ${order.codState} = 'cod_failed'`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only an order whose delivery failed can be recorded as returned (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'return-received',
    eventType: 'return_received',
    fromValue: 'shipped',
    toValue: 'returned',
    actorStaffId: actor.staffUserId,
    reason: note,
    payload: { returns: received.length },
  });
  await writeAudit(tx, actor, {
    action: 'return.received',
    orderId: current.id,
    before: { status: 'shipped', codState: 'cod_failed' },
    after: { status: 'returned', codState: 'cod_failed' },
    reason: note,
  });
}

/**
 * One returned line, inspected by a person: `received` -> `inspected_accepted` or `inspected_rejected`.
 *
 * A rejection must say why (the schema requires the note). An acceptance is **only** a finding that
 * the goods came back physically sound: it writes no movement, changes no balance and does not touch
 * `product.availability`. Making the product orderable again stays the owner's deliberate action on
 * the product screen - which is what "returned goods must be inspected before they are sellable
 * again" means when nothing is deducted anywhere (ADR 0013).
 */
export async function inspectReturn(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly returnId: number; readonly accepted: boolean; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.returnInspect, 'customer_return', input.returnId);

  const note = optionalNote(input.note);
  if (!input.accepted && note === null) {
    throw new ValidationError('an inspection that rejects the goods requires a note saying why');
  }

  const rows = await tx
    .select({
      id: customerReturn.id,
      orderId: customerReturn.orderId,
      state: customerReturn.state,
      orderNumber: order.orderNumber,
    })
    .from(customerReturn)
    .innerJoin(order, sql`${order.id} = ${customerReturn.orderId}`)
    .where(sql`${customerReturn.id} = ${input.returnId}`);
  const row = rows[0];
  if (row === undefined) throw new ValidationError('no such return');

  const to = input.accepted ? 'inspected_accepted' : 'inspected_rejected';
  const at = new Date();
  const updated = await tx
    .update(customerReturn)
    .set({
      state: to,
      inspectedAt: at,
      inspectedByStaffId: actor.staffUserId,
      inspectionNote: note,
    })
    .where(sql`${customerReturn.id} = ${input.returnId} and ${customerReturn.state} = 'received'`)
    .returning({ id: customerReturn.id });
  if (updated.length === 0) {
    throw new ConflictError(`only a received return can be inspected (this one is ${row.state})`);
  }

  await tx.insert(orderEvent).values({
    eventKey: `return:${row.id}:inspected`,
    orderId: row.orderId,
    eventType: 'return_inspected',
    fromValue: 'received',
    toValue: to,
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    reason: note,
    payload: { returnId: row.id },
  });
  await writeAudit(tx, actor, {
    action: 'return.inspected',
    orderId: row.orderId,
    before: { returnId: row.id, state: 'received' },
    after: { returnId: row.id, state: to },
    reason: note,
  });
}

// ------------------------------------------------------------------
// Cash collection
// ------------------------------------------------------------------

/**
 * `cod_approved` -> `cod_collected`. **The owner has confirmed the payment arrived.**
 *
 * This is the recorded money fact, and it is written **only** by `markPaymentReceived` - the owner's
 * own act, never a consequence of approval, dispatch or a delivery status, because those record where
 * the parcel is, not whether money arrived. The order's total is the amount due and is never
 * rewritten: the model has no collected-amount column, no partial-payment state and no adjustment, so
 * none is implied here. The event's `amountDueMinor` is read from the order row, never from a request.
 *
 * Collection is not a statement match. There is no courier statement, no settlement period and no
 * comparison of two sources; `cod_reconciled` is written by nothing.
 */
export async function recordCashCollected(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.codConfirmCollection, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ codState: 'cod_collected', updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId}
        and ${order.codState} = 'cod_approved'
        and ${order.status} in ('confirmed', 'processing', 'shipped', 'delivered')`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only an approved COD order awaiting cash can record collection (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'cod-collected',
    eventType: 'cod_collected',
    fromValue: 'cod_approved',
    toValue: 'cod_collected',
    actorStaffId: actor.staffUserId,
    reason: note,
    // The amount is the order's own saved total, recorded as the fact it was collected against. It is
    // read from the row, never from the request, and no second amount is invented here.
    payload: { amountDueMinor: current.totalMinor },
  });
  await writeAudit(tx, actor, {
    action: 'cod.collected',
    orderId: current.id,
    before: { status: current.status, codState: 'cod_approved' },
    after: { status: current.status, codState: 'cod_collected' },
    reason: note,
  });
}

// ------------------------------------------------------------------
// Completion
// ------------------------------------------------------------------

/**
 * `delivered`/`returned` -> `completed`, once money or the failed-parcel question has an answer.
 *
 * Completion is a fulfilment state, not a money fact: an order whose payment was received and an
 * order whose parcel came back both reach it. It is reached directly by `markPaymentReceived` (the
 * owner's normal path, from `shipped` or `delivered`) and by this function for a parcel that came
 * back - receipt already moved the order to `returned`, so that is the state to close out.
 *
 * A returned order is **not** revenue: it recorded no payment. Closing it out without money is the
 * owner's explicit act after inspection, never a timer's.
 */
export async function completeOrder(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.orderDispatch, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ status: 'completed', completedAt: at, updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId}
        and ${order.status} in ('delivered', 'returned')
        and ${order.codState} in ('cod_collected', 'cod_failed')`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only a delivered or returned order with a recorded outcome can be completed (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'completed',
    eventType: 'order_completed',
    fromValue: current.status,
    toValue: 'completed',
    actorStaffId: actor.staffUserId,
    reason: note,
  });
  await writeAudit(tx, actor, {
    action: 'order.completed',
    orderId: current.id,
    before: { status: current.status, codState: current.codState },
    after: { status: 'completed', codState: current.codState },
    reason: note,
  });
}

// ------------------------------------------------------------------
// Cancellation before dispatch
// ------------------------------------------------------------------

/**
 * `pending`/`confirmed`/`processing` -> `cancelled`, with a reason.
 *
 * The existing rule, unchanged: cancellation is a pre-dispatch decision, so `shipped` and everything
 * after it is refused - after dispatch the case is a return, not a cancellation. The COD rejection on
 * the queue is the same act for a still-pending order and keeps its own event key, so an order cannot
 * be cancelled twice through the two routes.
 *
 * No reservation is released (none exists, ADR 0013) and no refund is implied: a cancellation and a
 * refund are separate facts.
 */
export async function cancelOrderBeforeDispatch(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly reason: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.orderCancel, 'order', input.orderId);
  const reason = requiredReason(input.reason, 'reason');
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const updated = await tx
    .update(order)
    .set({ status: 'cancelled', cancelledAt: at, cancelledReason: reason, updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId} and ${order.status} in ('pending', 'confirmed', 'processing')`,
    )
    .returning({ id: order.id });
  if (updated.length === 0) {
    throw new ConflictError(
      `only an order that has not been dispatched can be cancelled (this one is ${current.status})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'cancelled',
    eventType: 'order_cancelled',
    fromValue: current.status,
    toValue: 'cancelled',
    actorStaffId: actor.staffUserId,
    reason,
  });
  await writeAudit(tx, actor, {
    action: 'order.cancelled',
    orderId: current.id,
    before: { status: current.status, codState: current.codState },
    after: { status: 'cancelled', codState: current.codState },
    reason,
  });
}


// ------------------------------------------------------------------
// Payment received (the owner's own money confirmation)
// ------------------------------------------------------------------

/**
 * The owner confirms the payment arrived: **record receipt, then complete the order, as one act.**
 *
 * This is the confirmed business workflow - approve, dispatch, deliver, and when the money is in the
 * owner's hands the owner marks payment received, which completes the order and makes its revenue
 * count. Both writes happen in the caller's transaction, so a completed order either has its
 * `cod_collected` fact and its trail or has nothing at all; there is no window in which revenue is
 * counted for an order whose receipt was rolled back.
 *
 * **Exactly once.** Each step is a guarded `UPDATE ... WHERE <state>`, so a double click, a repeated
 * submission or two concurrent requests update zero rows on the loser and answer `conflict` instead
 * of writing a second receipt or a second completion. The order event keys are unique per order, so
 * even a retry that slipped past a guard cannot record the same fact twice.
 *
 * **The customer's total is never touched.** In particular a failed delivery bears no charge: nothing
 * here adds a fee, adjusts the total or rewrites the snapshot, and the `order` immutability trigger
 * would refuse it. A failed-delivery charge is the owner's cost, not an order line.
 *
 * Reachable from `delivered`, and from `shipped` because the cash often arrives while the parcel is
 * still out with the courier - the owner's confirmation is the money fact, not a delivery status.
 */
export async function markPaymentReceived(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly note?: string },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.codConfirmCollection, 'order', input.orderId);
  const note = optionalNote(input.note);
  const current = await loadOrder(tx, input.orderId);

  const at = new Date();
  const receipted = await tx
    .update(order)
    .set({ codState: 'cod_collected', updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId}
        and ${order.codState} = 'cod_approved'
        and ${order.status} in ('shipped', 'delivered')`,
    )
    .returning({ id: order.id });
  if (receipted.length === 0) {
    throw new ConflictError(
      `only a dispatched order awaiting payment can record receipt (this one is ${current.status}/${current.codState})`,
    );
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'cod-collected',
    eventType: 'cod_collected',
    fromValue: 'cod_approved',
    toValue: 'cod_collected',
    actorStaffId: actor.staffUserId,
    reason: note,
    // The order's own saved total, read from the row - never a figure from the request.
    payload: { amountDueMinor: current.totalMinor },
  });
  await writeAudit(tx, actor, {
    action: 'cod.collected',
    orderId: current.id,
    before: { status: current.status, codState: 'cod_approved' },
    after: { status: current.status, codState: 'cod_collected' },
    reason: note,
  });

  const completed = await tx
    .update(order)
    .set({ status: 'completed', completedAt: at, updatedAt: at })
    .where(
      sql`${order.id} = ${input.orderId}
        and ${order.status} in ('shipped', 'delivered')
        and ${order.codState} = 'cod_collected'`,
    )
    .returning({ id: order.id });
  if (completed.length === 0) {
    throw new ConflictError('payment receipt was recorded but the order could not be completed');
  }

  await writeEvent(tx, {
    orderId: current.id,
    orderNumber: current.orderNumber,
    key: 'completed',
    eventType: 'order_completed',
    fromValue: current.status,
    toValue: 'completed',
    actorStaffId: actor.staffUserId,
    reason: note,
  });
  await writeAudit(tx, actor, {
    action: 'order.completed',
    orderId: current.id,
    before: { status: current.status, codState: 'cod_collected' },
    after: { status: 'completed', codState: 'cod_collected' },
    reason: note,
  });
}

