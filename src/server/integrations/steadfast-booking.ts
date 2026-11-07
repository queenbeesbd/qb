/**
 * Sending a confirmed COD order to SteadFast, and reading a consignment back.
 *
 * **When it runs.** The owner confirms a COD order on the phone; approving it in the confirmation queue
 * is the moment the parcel becomes real, so the approval route calls `bookApprovedOrder` immediately
 * after the approval transaction commits. The order detail screen offers the same call as **Send to
 * SteadFast**, which is the retry for a courier outage and the deliberate path for an order that was
 * approved while booking was switched off.
 *
 * **What it writes.** One `steadfast_consignment` row per order and an audit record. It never changes
 * `order.status`, `order.cod_state`, payment or stock - a parcel is not a state of the order, and a
 * courier's delivery status is not the owner's cash-collection decision.
 *
 * **One parcel per order, including under a race.** The whole booking runs inside one interactive
 * transaction and takes a **transaction-scoped advisory lock** on the order first; a second request
 * finds the lock taken, answers `in_progress`, and writes nothing. The unique index on `order_id` is
 * the backstop underneath that. The courier call happens while the lock is held, which is deliberate:
 * it is what makes "was this order already booked?" an answer rather than a guess, and the transaction
 * holds no row locks while it waits.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { order, orderContact, steadfastConsignment } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';
import {
  bookingsEnabled,
  buildCreateOrderPayload,
  createOrder,
  credentialsOf,
  getDeliveryStatus,
  loadSteadfastSettings,
  type ClientOptions,
} from './steadfast';

export type StoredConsignment = {
  readonly id: number;
  readonly orderId: number;
  readonly invoice: string;
  readonly consignmentId: number;
  readonly trackingCode: string;
  readonly status: string;
  readonly codAmountMinor: number;
  readonly createdAt: Date;
  readonly statusCheckedAt: Date | null;
};

export type BookingOutcome =
  | { readonly status: 'booked'; readonly consignment: StoredConsignment }
  | { readonly status: 'exists'; readonly consignment: StoredConsignment }
  /** No keys saved, or booking switched off. Not an error: the order is approved and untouched. */
  | { readonly status: 'not_configured' }
  /** Another request holds this order's booking lock right now. */
  | { readonly status: 'in_progress' }
  /** The order is not in a state that may be sent, or its data cannot be sent as it stands. */
  | { readonly status: 'refused'; readonly message: string }
  /** SteadFast refused the consignment, or could not be reached. Nothing was written. */
  | { readonly status: 'failed'; readonly message: string };

export type StatusOutcome =
  | { readonly status: 'refreshed'; readonly deliveryStatus: string; readonly consignment: StoredConsignment }
  | { readonly status: 'missing' }
  | { readonly status: 'not_configured' }
  | { readonly status: 'failed'; readonly message: string };

/** Thrown to roll the booking transaction back with a message the route may show. */
class BookingError extends Error {
  constructor(
    readonly outcome: 'failed' | 'refused' | 'in_progress',
    message: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

function row(record: {
  id: number;
  orderId: number;
  invoice: string;
  consignmentId: number;
  trackingCode: string;
  status: string;
  codAmountMinor: number;
  createdAt: Date;
  statusCheckedAt: Date | null;
}): StoredConsignment {
  return {
    id: record.id,
    orderId: record.orderId,
    invoice: record.invoice,
    consignmentId: record.consignmentId,
    trackingCode: record.trackingCode,
    status: record.status,
    codAmountMinor: record.codAmountMinor,
    createdAt: record.createdAt,
    statusCheckedAt: record.statusCheckedAt,
  };
}

const CONSIGNMENT_COLUMNS = {
  id: steadfastConsignment.id,
  orderId: steadfastConsignment.orderId,
  invoice: steadfastConsignment.invoice,
  consignmentId: steadfastConsignment.consignmentId,
  trackingCode: steadfastConsignment.trackingCode,
  status: steadfastConsignment.status,
  codAmountMinor: steadfastConsignment.codAmountMinor,
  createdAt: steadfastConsignment.createdAt,
  statusCheckedAt: steadfastConsignment.statusCheckedAt,
};

/** The consignment booked for one order, or `null`. */
export async function loadConsignment(tx: Transaction, orderId: number): Promise<StoredConsignment | null> {
  const rows = await tx
    .select(CONSIGNMENT_COLUMNS)
    .from(steadfastConsignment)
    .where(sql`${steadfastConsignment.orderId} = ${orderId}`);
  const found = rows[0];
  return found === undefined ? null : row(found);
}

/**
 * Books one confirmed COD order.
 *
 * The caller's permission is re-checked inside this function (`cod.approve` - sending a parcel is the
 * same commitment as approving the order). A booking that fails writes a **failure audit in its own
 * transaction**, because the record of the attempt would otherwise be rolled back by the very failure
 * it describes.
 */
export async function bookApprovedOrder(
  actor: ActorContext,
  orderId: number,
  options: ClientOptions = {},
): Promise<BookingOutcome> {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(actor, PERMISSIONS.codApprove, 'order', orderId);

      const lock = (await tx.execute(
        sql`select pg_try_advisory_xact_lock(hashtext(${`steadfast:${orderId}`})) as locked`,
      )) as unknown as { rows: { locked: boolean }[] };
      const locked = lock.rows[0]?.locked === true;
      if (!locked) throw new BookingError('in_progress', 'this order is already being sent to SteadFast');

      const existing = await loadConsignment(tx, orderId);
      if (existing !== null) return { status: 'exists', consignment: existing } as const;

      const settings = await loadSteadfastSettings(tx);
      const credentials = credentialsOf(settings);
      if (!settings.enabled || credentials === null) return { status: 'not_configured' } as const;

      const rows = await tx
        .select({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentMethod: order.paymentMethod,
          codState: order.codState,
          totalMinor: order.totalMinor,
          recipientName: orderContact.recipientName,
          recipientPhone: orderContact.recipientPhone,
          addressLine: orderContact.addressLine,
          area: orderContact.area,
          city: orderContact.city,
          postcode: orderContact.postcode,
          deliveryNote: orderContact.deliveryNote,
        })
        .from(order)
        .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
        .where(sql`${order.id} = ${orderId}`);

      const found = rows[0];
      if (found === undefined) throw new BookingError('refused', 'no such order');

      // The same guard the approval itself uses: only an approved, dispatched-not-yet COD order is a
      // parcel. Anything else would tell the courier about goods the shop has not committed to send.
      const bookable =
        found.paymentMethod === 'cod' &&
        found.codState === 'cod_approved' &&
        (found.status === 'confirmed' || found.status === 'processing');
      if (!bookable) {
        throw new BookingError('refused', 'only a confirmed and not yet dispatched COD order can be sent');
      }

      let built: ReturnType<typeof buildCreateOrderPayload>;
      try {
        built = buildCreateOrderPayload({
          invoice: found.orderNumber,
          recipientName: found.recipientName,
          recipientPhone: found.recipientPhone,
          addressLine: found.addressLine,
          area: found.area,
          city: found.city,
          postcode: found.postcode,
          note: found.deliveryNote,
          codAmountMinor: found.totalMinor,
        });
      } catch (error) {
        // A reference or an amount the courier's own rules cannot express is a refusal, not a crash.
        throw new BookingError('refused', error instanceof Error ? error.message : 'the order cannot be sent');
      }
      if (!built.ok) throw new BookingError('refused', built.message);

      const sent = await createOrder(credentials, built.payload, options);
      if (!sent.ok) throw new BookingError('failed', sent.message);

      const inserted = await tx
        .insert(steadfastConsignment)
        .values({
          orderId,
          invoice: sent.consignment.invoice,
          consignmentId: sent.consignment.consignmentId,
          trackingCode: sent.consignment.trackingCode,
          status: sent.consignment.status,
          codAmountMinor: found.totalMinor,
          bookedByStaffId: actor.staffUserId,
        })
        .returning(CONSIGNMENT_COLUMNS);

      const created = inserted[0];
      if (created === undefined) throw new BookingError('failed', 'the consignment was not recorded');

      await recordAudit(tx, {
        actorType: 'staff',
        actorStaffId: actor.staffUserId,
        actorRoleCodes: actor.roleCodes,
        action: 'order.steadfast_booked',
        entityType: 'order',
        entityId: orderId,
        after: {
          invoice: sent.consignment.invoice,
          consignmentId: sent.consignment.consignmentId,
          trackingCode: sent.consignment.trackingCode,
          codAmountMinor: found.totalMinor,
        },
      });

      return { status: 'booked', consignment: row(created) } as const;
    });
  } catch (error) {
    if (error instanceof BookingError) {
      if (error.outcome === 'in_progress') return { status: 'in_progress' };
      // A refusal is also an attempt that left no parcel: the trail says so, and the screen can act
      // on it. Only the lock case is silent, because no attempt was made.
      await recordBookingFailure(actor, orderId, error.message);
      return { status: error.outcome, message: error.message };
    }
    throw error;
  }
}

/**
 * Records a refused or failed booking. Its own transaction, so the record survives the refusal it
 * describes. A message from the courier is bounded and stripped of control characters before it is
 * stored, and it never carries a credential - the client only ever returns the courier's own text.
 */
async function recordBookingFailure(actor: ActorContext, orderId: number, message: string): Promise<void> {
  const reason = message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  await withTransaction((tx) =>
    recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'order.steadfast_booking_failed',
      entityType: 'order',
      entityId: orderId,
      reason: reason.length > 0 ? reason : 'SteadFast booking failed',
    }),
  );
}

/**
 * Asks SteadFast where one parcel is and stores the answer.
 *
 * The stored value is **what the courier said, and when it said it** - it is not used to advance the
 * order. Marking the parcel delivered, or collecting cash, stays the owner's explicit act.
 */
export async function refreshConsignmentStatus(
  actor: ActorContext,
  orderId: number,
  options: ClientOptions = {},
): Promise<StatusOutcome> {
  return withTransaction(async (tx) => {
    await requirePermission(actor, PERMISSIONS.orderRead, 'order', orderId);

    const current = await loadConsignment(tx, orderId);
    if (current === null) return { status: 'missing' } as const;

    const settings = await loadSteadfastSettings(tx);
    const credentials = credentialsOf(settings);
    if (credentials === null) return { status: 'not_configured' } as const;

    const result = await getDeliveryStatus(credentials, current.consignmentId, options);
    if (!result.ok) return { status: 'failed', message: result.message } as const;

    const updated = await tx
      .update(steadfastConsignment)
      .set({ status: result.status, statusCheckedAt: new Date(), updatedAt: new Date() })
      .where(sql`${steadfastConsignment.id} = ${current.id}`)
      .returning(CONSIGNMENT_COLUMNS);

    const stored = updated[0];
    if (stored === undefined) return { status: 'missing' } as const;
    return { status: 'refreshed', deliveryStatus: result.status, consignment: row(stored) } as const;
  });
}

/** Whether a confirmed order would be sent automatically right now, for the screen's own wording. */
export async function bookingAvailability(tx: Transaction): Promise<{ readonly configured: boolean; readonly enabled: boolean }> {
  const settings = await loadSteadfastSettings(tx);
  return { configured: credentialsOf(settings) !== null, enabled: bookingsEnabled(settings) };
}

/** The internal id behind a public order reference, or `null`. Read-only; used to resolve a form post. */
export async function orderIdByNumber(tx: Transaction, orderNumber: string): Promise<number | null> {
  const rows = await tx
    .select({ id: order.id })
    .from(order)
    .where(sql`${order.orderNumber} = ${orderNumber}`);
  return rows[0]?.id ?? null;
}
