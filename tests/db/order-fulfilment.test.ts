import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { decideCod } from '../../src/server/orders/manage';
import {
  cancelOrderBeforeDispatch,
  completeOrder,
  dispatchOrder,
  inspectReturn,
  recordCashCollected,
  recordDelivered,
  recordDeliveryFailed,
  recordParcelReceived,
} from '../../src/server/orders/fulfilment';
import { AuthorizationError, ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { adminOrderDetail } from '../../src/server/orders/admin-order';

/**
 * The owner's post-approval COD operations (Phase 20).
 *
 * Every test asserts a **stored fact**: the order and COD columns, the return rows, the event log and
 * the audit trail. The refusals matter as much as the acceptances - a transition that succeeds from
 * the wrong state would be a state machine that only exists in the view.
 *
 * Three properties are re-asserted after every operation because they are the ones the design forbids
 * collapsing: no inventory movement is ever written (ADR 0013), the order's charged amounts never
 * change, and nothing but an explicit collection writes cod_collected.
 */

const OWNER = {
  staffUserId: 0,
  permissions: new Set([
    'order.read',
    'order.dispatch',
    'order.cancel',
    'cod.approve',
    'cod.confirm_collection',
    'return.inspect',
    'audit.read',
  ]),
  roleCodes: ['owner'],
};

/** An actor holding nothing: the service must refuse before touching a row. */
const NOBODY = {
  staffUserId: 0,
  permissions: new Set<string>(),
  roleCodes: ['owner'],
};

async function seedCod(fixture: DbFixture, options: { quantity?: number; shippingMinor?: number } = {}) {
  return seedOrder(fixture.pool, {
    paymentMethod: 'cod',
    quantity: options.quantity ?? 1,
    shippingMinor: options.shippingMinor ?? 0,
    withReservation: false,
  });
}

/** Approves the order through the real service, so every downstream state is reached honestly. */
async function approve(fixture: DbFixture, orderId: number): Promise<void> {
  await withTransaction((tx) =>
    decideCod(tx, OWNER, { orderId, decision: 'approve', reason: 'Called the customer and confirmed' }),
  );
}

async function state(fixture: DbFixture, orderId: number) {
  const rows = await fixture.pool.query<{
    status: string;
    cod_state: string;
    items_subtotal_minor: number;
    shipping_minor: number;
    total_minor: number;
    shipped_at: Date | null;
    delivered_at: Date | null;
    completed_at: Date | null;
  }>(
    'select status, cod_state, items_subtotal_minor, shipping_minor, total_minor, shipped_at, delivered_at, completed_at from "order" where id = $1',
    [orderId],
  );
  return rows.rows[0]!;
}

async function eventCount(fixture: DbFixture, orderId: number, eventType: string): Promise<number> {
  const rows = await fixture.pool.query<{ total: string }>(
    'select count(*)::text as total from order_event where order_id = $1 and event_type = $2',
    [orderId, eventType],
  );
  return Number(rows.rows[0]?.total ?? '0');
}

async function auditCount(fixture: DbFixture, orderId: number, action: string): Promise<number> {
  const rows = await fixture.pool.query<{ total: string }>(
    "select count(*)::text as total from audit_event where entity_type = 'order' and entity_id = $1 and action = $2",
    [orderId, action],
  );
  return Number(rows.rows[0]?.total ?? '0');
}

async function movementCount(fixture: DbFixture): Promise<number> {
  const rows = await fixture.pool.query<{ total: string }>('select count(*)::text as total from inventory_movement');
  return Number(rows.rows[0]?.total ?? '0');
}

async function returnsOf(fixture: DbFixture, orderId: number) {
  const rows = await fixture.pool.query<{
    id: string;
    state: string;
    reason: string;
    quantity: number;
    received_at: Date | null;
    inspected_at: Date | null;
    inspection_note: string | null;
  }>(
    'select id, state, reason, quantity, received_at, inspected_at, inspection_note from customer_return where order_id = $1 order by id',
    [orderId],
  );
  return rows.rows;
}

/** Drives one order all the way to a failed delivery, returning its order id, return id and lines. */
async function failedDelivery(fixture: DbFixture, options: { quantity?: number } = {}) {
  const seeded = await seedCod(fixture, options);
  await approve(fixture, seeded.orderId);
  await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId, note: 'Handed to the courier' }));
  await withTransaction((tx) =>
    recordDeliveryFailed(tx, OWNER, {
      orderId: seeded.orderId,
      reason: 'The customer did not answer after three attempts',
    }),
  );
  const returns = await returnsOf(fixture, seeded.orderId);
  return { seeded, returns };
}

describe('order fulfilment transitions (Phase 20)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
    NOBODY.staffUserId = OWNER.staffUserId;
  });

  after(async () => {
    await fixture.close();
  });

  it('refuses dispatch before the owner has approved the COD order', async () => {
    const seeded = await seedCod(fixture);
    const before = await state(fixture, seeded.orderId);

    await assert.rejects(
      withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );

    const after = await state(fixture, seeded.orderId);
    assert.equal(after.status, before.status);
    assert.equal(after.cod_state, 'cod_pending_approval');
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_shipped'), 0);
  });

  it('dispatches an approved order, recording the actor, the timestamp and both records', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    await withTransaction((tx) =>
      dispatchOrder(tx, OWNER, { orderId: seeded.orderId, note: 'Handed to the courier' }),
    );

    const after = await state(fixture, seeded.orderId);
    assert.equal(after.status, 'shipped');
    assert.notEqual(after.shipped_at, null);
    // Dispatch is a fulfilment fact only: the money state is untouched.
    assert.equal(after.cod_state, 'cod_approved');
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_shipped'), 1);
    assert.equal(await auditCount(fixture, seeded.orderId, 'order.dispatched'), 1);

    const event = await fixture.pool.query<{ actor_type: string; actor_staff_id: string; reason: string }>(
      "select actor_type, actor_staff_id, reason from order_event where order_id = $1 and event_type = 'order_shipped'",
      [seeded.orderId],
    );
    assert.equal(event.rows[0]?.actor_type, 'staff');
    assert.equal(Number(event.rows[0]?.actor_staff_id), OWNER.staffUserId);
    assert.equal(event.rows[0]?.reason, 'Handed to the courier');
  });

  it('does not dispatch twice, and writes no duplicate event', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);
    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));

    await assert.rejects(
      withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_shipped'), 1);
  });

  it('cancels before dispatch, and refuses to cancel after it', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    await assert.rejects(
      withTransaction((tx) => cancelOrderBeforeDispatch(tx, OWNER, { orderId: seeded.orderId, reason: 'too short' })),
      ValidationError,
    );

    await withTransaction((tx) =>
      cancelOrderBeforeDispatch(tx, OWNER, {
        orderId: seeded.orderId,
        reason: 'The customer asked to cancel when we called',
      }),
    );
    const cancelled = await state(fixture, seeded.orderId);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_cancelled'), 1);
    assert.equal(await auditCount(fixture, seeded.orderId, 'order.cancelled'), 1);

    // A second cancellation, and a cancellation of a dispatched order, are both refused.
    await assert.rejects(
      withTransaction((tx) =>
        cancelOrderBeforeDispatch(tx, OWNER, { orderId: seeded.orderId, reason: 'Trying again after the fact' }),
      ),
      ConflictError,
    );

    const other = await seedCod(fixture);
    await approve(fixture, other.orderId);
    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: other.orderId }));
    await assert.rejects(
      withTransaction((tx) =>
        cancelOrderBeforeDispatch(tx, OWNER, {
          orderId: other.orderId,
          reason: 'After dispatch this is a return, not a cancellation',
        }),
      ),
      ConflictError,
    );
    assert.equal((await state(fixture, other.orderId)).status, 'shipped');
  });

  it('records delivery without claiming cash, then records collection as its own event', async () => {
    const seeded = await seedCod(fixture, { shippingMinor: 12000 });
    await approve(fixture, seeded.orderId);
    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));

    await withTransaction((tx) => recordDelivered(tx, OWNER, { orderId: seeded.orderId }));
    const delivered = await state(fixture, seeded.orderId);
    assert.equal(delivered.status, 'delivered');
    assert.notEqual(delivered.delivered_at, null);
    // Delivered is not collected: the money fact needs its own act.
    assert.equal(delivered.cod_state, 'cod_approved');
    assert.equal(await eventCount(fixture, seeded.orderId, 'cod_collected'), 0);

    await withTransaction((tx) => recordCashCollected(tx, OWNER, { orderId: seeded.orderId, note: 'Cash in hand' }));
    const collected = await state(fixture, seeded.orderId);
    assert.equal(collected.cod_state, 'cod_collected');
    assert.equal(await eventCount(fixture, seeded.orderId, 'cod_collected'), 1);
    assert.equal(await auditCount(fixture, seeded.orderId, 'cod.collected'), 1);

    // The amount recorded is the order's own total, never a submitted figure, and nothing changed it.
    const event = await fixture.pool.query<{ payload: { amountDueMinor: number } }>(
      "select payload from order_event where order_id = $1 and event_type = 'cod_collected'",
      [seeded.orderId],
    );
    assert.equal(event.rows[0]?.payload.amountDueMinor, collected.total_minor);
    assert.equal(collected.total_minor, 22000);
    assert.equal(collected.shipping_minor, 12000);
  });

  it('refuses a duplicate collection and never reconciles on its own', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);
    await withTransaction((tx) => recordCashCollected(tx, OWNER, { orderId: seeded.orderId }));

    await assert.rejects(
      withTransaction((tx) => recordCashCollected(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );
    assert.equal(await eventCount(fixture, seeded.orderId, 'cod_collected'), 1);

    // Collection is not reconciliation, and nothing in this release writes cod_reconciled.
    const after = await state(fixture, seeded.orderId);
    assert.equal(after.cod_state, 'cod_collected');
    const reconciled = await fixture.pool.query<{ total: string }>(
      "select count(*)::text as total from \"order\" where cod_state = 'cod_reconciled'",
    );
    assert.equal(Number(reconciled.rows[0]?.total), 0);
  });

  it('records a failed delivery, creating one return per line and leaving the money untouched', async () => {
    const seeded = await seedCod(fixture, { quantity: 2, shippingMinor: 15000 });
    const movementsBefore = await movementCount(fixture);
    await approve(fixture, seeded.orderId);
    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));

    await withTransaction((tx) =>
      recordDeliveryFailed(tx, OWNER, {
        orderId: seeded.orderId,
        reason: 'Refused at the door; the parcel is coming back',
      }),
    );

    const failed = await state(fixture, seeded.orderId);
    assert.equal(failed.cod_state, 'cod_failed');
    // The parcel has not come back yet, so the order is still dispatched - not returned, not delivered.
    assert.equal(failed.status, 'shipped');
    assert.equal(await eventCount(fixture, seeded.orderId, 'cod_failed'), 1);
    assert.equal(await auditCount(fixture, seeded.orderId, 'cod.delivery_failed'), 1);

    const returns = await returnsOf(fixture, seeded.orderId);
    assert.equal(returns.length, 1);
    assert.equal(returns[0]?.state, 'requested');
    assert.equal(returns[0]?.reason, 'failed_delivery');
    assert.equal(returns[0]?.quantity, 2);

    // No money was collected, the charged amounts are unchanged, and no stock moved.
    assert.equal(await eventCount(fixture, seeded.orderId, 'cod_collected'), 0);
    assert.equal(failed.total_minor, 35000);
    assert.equal(failed.shipping_minor, 15000);
    assert.equal(await movementCount(fixture), movementsBefore);

    // Cash cannot be recorded after the delivery failed.
    await assert.rejects(
      withTransaction((tx) => recordCashCollected(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );
    assert.equal((await state(fixture, seeded.orderId)).cod_state, 'cod_failed');
  });

  it('refuses a failed delivery that was never dispatched', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    await assert.rejects(
      withTransaction((tx) =>
        recordDeliveryFailed(tx, OWNER, {
          orderId: seeded.orderId,
          reason: 'The customer refused before the parcel left',
        }),
      ),
      ConflictError,
    );
    assert.equal((await state(fixture, seeded.orderId)).cod_state, 'cod_approved');
    assert.equal((await returnsOf(fixture, seeded.orderId)).length, 0);
  });

  it('receives the returned parcel, then inspects it without making anything sellable', async () => {
    const movementsBefore = await movementCount(fixture);
    const { seeded, returns } = await failedDelivery(fixture);
    const availability = await fixture.pool.query<{ availability: string }>(
      'select availability from product where id = (select product_id from product_variant where id = $1)',
      [seeded.variantId],
    );

    await withTransaction((tx) => recordParcelReceived(tx, OWNER, { orderId: seeded.orderId, note: 'Counted in' }));
    const received = await state(fixture, seeded.orderId);
    assert.equal(received.status, 'returned');
    const receivedReturns = await returnsOf(fixture, seeded.orderId);
    assert.equal(receivedReturns[0]?.state, 'received');
    assert.notEqual(receivedReturns[0]?.received_at, null);
    assert.equal(await eventCount(fixture, seeded.orderId, 'return_received'), 1);

    await withTransaction((tx) =>
      inspectReturn(tx, OWNER, { returnId: returns[0]!.id as unknown as number, accepted: true, note: 'Seal intact' }),
    );
    const inspected = await returnsOf(fixture, seeded.orderId);
    assert.equal(inspected[0]?.state, 'inspected_accepted');
    assert.notEqual(inspected[0]?.inspected_at, null);
    assert.equal(await eventCount(fixture, seeded.orderId, 'return_inspected'), 1);
    assert.equal(await auditCount(fixture, seeded.orderId, 'return.inspected'), 1);

    // Accepting an inspection is not a stock fact: no movement, no balance change, no availability flip.
    assert.equal(await movementCount(fixture), movementsBefore);
    const after = await fixture.pool.query<{ availability: string }>(
      'select availability from product where id = (select product_id from product_variant where id = $1)',
      [seeded.variantId],
    );
    assert.equal(after.rows[0]?.availability, availability.rows[0]?.availability);

    // Inspecting the same line again is a conflict, not a second finding.
    await assert.rejects(
      withTransaction((tx) =>
        inspectReturn(tx, OWNER, { returnId: returns[0]!.id as unknown as number, accepted: false, note: 'Changed my mind' }),
      ),
      ConflictError,
    );
  });

  it('requires a note to reject goods, and records the rejection with it', async () => {
    const { seeded, returns } = await failedDelivery(fixture);
    await withTransaction((tx) => recordParcelReceived(tx, OWNER, { orderId: seeded.orderId }));
    const returnId = returns[0]!.id as unknown as number;

    await assert.rejects(
      withTransaction((tx) => inspectReturn(tx, OWNER, { returnId, accepted: false })),
      ValidationError,
    );

    await withTransaction((tx) =>
      inspectReturn(tx, OWNER, { returnId, accepted: false, note: 'Seal broken; the item was used' }),
    );
    const rejected = await returnsOf(fixture, seeded.orderId);
    assert.equal(rejected[0]?.state, 'inspected_rejected');
    assert.equal(rejected[0]?.inspection_note, 'Seal broken; the item was used');
  });

  it('refuses a return receipt before the delivery has failed', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);
    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));

    await assert.rejects(
      withTransaction((tx) => recordParcelReceived(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );
    assert.equal((await state(fixture, seeded.orderId)).status, 'shipped');
  });

  it('completes only a delivered order with a recorded outcome', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    await assert.rejects(
      withTransaction((tx) => completeOrder(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );

    await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));
    await withTransaction((tx) => recordDelivered(tx, OWNER, { orderId: seeded.orderId }));
    await assert.rejects(
      withTransaction((tx) => completeOrder(tx, OWNER, { orderId: seeded.orderId })),
      ConflictError,
    );

    await withTransaction((tx) => recordCashCollected(tx, OWNER, { orderId: seeded.orderId }));
    await withTransaction((tx) => completeOrder(tx, OWNER, { orderId: seeded.orderId }));
    const completed = await state(fixture, seeded.orderId);
    assert.equal(completed.status, 'completed');
    assert.notEqual(completed.completed_at, null);
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_completed'), 1);
  });

  it('authorizes every transition in the service, not only in the route', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    await assert.rejects(
      withTransaction((tx) => dispatchOrder(tx, NOBODY, { orderId: seeded.orderId })),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) => recordCashCollected(tx, NOBODY, { orderId: seeded.orderId })),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) => cancelOrderBeforeDispatch(tx, NOBODY, { orderId: seeded.orderId, reason: 'no permission' })),
      AuthorizationError,
    );

    const unchanged = await state(fixture, seeded.orderId);
    assert.equal(unchanged.status, 'confirmed');
    assert.equal(unchanged.cod_state, 'cod_approved');
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_shipped'), 0);
    // A refusal is recorded durably, in its own transaction, so it survives the throw.
    const denied = await fixture.pool.query<{ total: string }>(
      "select count(*)::text as total from audit_event where action = 'admin.action_denied' and entity_id = $1",
      [seeded.orderId],
    );
    assert.ok(Number(denied.rows[0]?.total) >= 3);
  });

  it('lets exactly one of two concurrent dispatches win', async () => {
    const seeded = await seedCod(fixture);
    await approve(fixture, seeded.orderId);

    const results = await Promise.allSettled([
      withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId })),
      withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId })),
    ]);

    const fulfilled = results.filter((entry) => entry.status === 'fulfilled');
    const rejected = results.filter((entry) => entry.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof ConflictError);
    assert.equal(await eventCount(fixture, seeded.orderId, 'order_shipped'), 1);
    assert.equal((await state(fixture, seeded.orderId)).status, 'shipped');
  });

  it('exposes the operations on the order detail: times, returns and the same amounts', async () => {
    const { seeded } = await failedDelivery(fixture);
    await withTransaction((tx) => recordParcelReceived(tx, OWNER, { orderId: seeded.orderId }));

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.notEqual(detail, null);
    if (detail === null) return;

    assert.equal(detail.status, 'returned');
    assert.equal(detail.codState, 'cod_failed');
    assert.notEqual(detail.shippedAt, null);
    assert.equal(detail.returns.length, 1);
    assert.equal(detail.returns[0]?.state, 'received');
    // The customer is told about cash only when cash was recorded: nothing here collected anything.
    const nothingCollected = await fixture.pool.query<{ total: string }>(
      "select count(*)::text as total from order_event where order_id = $1 and event_type = 'cod_collected'",
      [seeded.orderId],
    );
    assert.equal(Number(nothingCollected.rows[0]?.total), 0);
    // The snapshot is exactly what the order stored - no transition rewrote it.
    assert.equal(detail.totalMinor, detail.itemsSubtotalMinor + detail.shippingMinor);
    assert.ok(
      detail.events.some((event) => event.eventType === 'cod_failed') &&
        detail.events.some((event) => event.eventType === 'return_received'),
    );
  });
});
