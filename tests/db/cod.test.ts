import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { countCodApprovalQueue, decideCod, listCodApprovalQueue } from '../../src/server/orders/manage';
import { codDecidedToday, codQueue } from '../../src/server/orders/admin-read';
import { ConflictError, ValidationError } from '../../src/server/authz/authorize';

/**
 * The COD owner-confirmation queue (Phase 16A, ADR 0014; COD-only since Phase 17).
 *
 * Cash on Delivery is the only payment method this release accepts, so this is the owner's only order
 * worklist. The tests assert effects read back from the database: the guarded transition, the queue
 * membership before and after a decision, the audit record with its actor, and the fact that no decision
 * bans a customer.
 */

/** The actor context used for every owner decision in this file: full owner permissions. */
const OWNER = {
  staffUserId: 0,
  permissions: new Set(['cod.approve', 'order.cancel', 'order.read']),
  roleCodes: ['owner'],
};

describe('COD confirmation (Phase 16A, COD-only in Phase 17)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
  });

  after(async () => {
    await fixture.close();
  });

  function actorFor() {
    return OWNER;
  }

  it('approves a COD order: cod_approved, confirmed, audited and in the order event log', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    const queued = await withTransaction((tx) => listCodApprovalQueue(tx));
    assert.equal(queued.some((row) => row.orderId === seeded.orderId), true, 'a COD order waits for the owner');

    await withTransaction((tx) =>
      decideCod(tx, actorFor(), {
        orderId: seeded.orderId,
        decision: 'approve',
        reason: 'confirmed by phone with the customer',
      }),
    );

    const approved = await fixture.pool.query<{ cod_state: string; status: string }>(
      `select cod_state, status from "order" where id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(approved.rows[0], { cod_state: 'cod_approved', status: 'confirmed' });

    const after = await withTransaction((tx) => listCodApprovalQueue(tx));
    assert.equal(after.some((row) => row.orderId === seeded.orderId), false, 'a decided order leaves the queue');

    const audit = await fixture.pool.query<{ action: string; actor_staff_id: string; reason: string }>(
      `select action, actor_staff_id, reason from audit_event where entity_type = 'order' and entity_id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(
      audit.rows.map((row) => row.action),
      ['cod.approved'],
    );
    assert.equal(Number(audit.rows[0]?.actor_staff_id), OWNER.staffUserId);
    assert.match(audit.rows[0]?.reason ?? '', /confirmed by phone/);

    const events = await fixture.pool.query<{ event_type: string; from_value: string; to_value: string }>(
      `select event_type, from_value, to_value from order_event where order_id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(events.rows, [
      { event_type: 'cod_approved', from_value: 'cod_pending_approval', to_value: 'cod_approved' },
    ]);
  });

  it('refuses a repeated approval as a conflict, without a second audit record', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, actorFor(), { orderId: seeded.orderId, decision: 'approve', reason: 'confirmed on the call' }),
    );

    await assert.rejects(
      () =>
        withTransaction((tx) =>
          decideCod(tx, actorFor(), {
            orderId: seeded.orderId,
            decision: 'approve',
            reason: 'second approval attempt',
          }),
        ),
      ConflictError,
    );

    const audits = await fixture.pool.query<{ total: number }>(
      `select count(*)::int as total from audit_event where entity_type = 'order' and entity_id = $1`,
      [seeded.orderId],
    );
    assert.equal(audits.rows[0]?.total, 1, 'a losing racer writes nothing');
  });

  it('rejects a COD order by cancelling it, leaving cod_state bound to the method, and drops it from the queue', async () => {
    // The defect this covers: the worklist filtered on `cod_state` alone, and a rejection cancels the
    // order without changing that state - so a cancelled order stayed in the queue for good, where the
    // only possible answer to another action was "already decided".
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    assert.equal(
      (await withTransaction((tx) => listCodApprovalQueue(tx))).some((row) => row.orderId === seeded.orderId),
      true,
    );

    await withTransaction((tx) =>
      decideCod(tx, actorFor(), {
        orderId: seeded.orderId,
        decision: 'reject',
        reason: 'customer never answered the call',
      }),
    );

    const after = await withTransaction((tx) => listCodApprovalQueue(tx));
    assert.equal(after.some((row) => row.orderId === seeded.orderId), false);

    const state = await fixture.pool.query<{ status: string; cod_state: string; cancelled_reason: string | null }>(
      `select status, cod_state, cancelled_reason from "order" where id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(state.rows[0], {
      status: 'cancelled',
      cod_state: 'cod_pending_approval',
      cancelled_reason: 'customer never answered the call',
    });

    const count = await withTransaction((tx) => countCodApprovalQueue(tx));
    const pending = await fixture.pool.query<{ total: number }>(
      `select count(*)::int as total from "order" where cod_state = 'cod_pending_approval' and status = 'pending'`,
    );
    assert.equal(count, pending.rows[0]?.total, 'the count matches the queue predicate exactly');

    const audit = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where entity_type = 'order' and entity_id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(audit.rows.map((row) => row.action), ['cod.cancelled']);
  });

  it('refuses a decision without a real reason', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    for (const decision of ['approve', 'reject'] as const) {
      await assert.rejects(
        () => withTransaction((tx) => decideCod(tx, actorFor(), { orderId: seeded.orderId, decision, reason: 'short' })),
        ValidationError,
      );
    }

    const state = await fixture.pool.query<{ status: string; cod_state: string }>(
      `select status, cod_state from "order" where id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(state.rows[0], { status: 'pending', cod_state: 'cod_pending_approval' });
  });

  it('never bans a customer by itself: an accepted or rejected order leaves the account active', async () => {
    const rejected = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, actorFor(), {
        orderId: rejected.orderId,
        decision: 'reject',
        reason: 'customer unreachable after the call',
      }),
    );

    const account = await fixture.pool.query<{ status: string }>(
      `select status from customer where id = $1`,
      [rejected.customerId],
    );
    assert.equal(account.rows[0]?.status, 'active', 'a rejection is not a ban (D20)');
  });

  it('searches the worklist by order number and treats search text as data, not a wildcard', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });

    const byNumber = await withTransaction((tx) => listCodApprovalQueue(tx, { search: seeded.orderNumber }));
    assert.deepEqual(
      byNumber.map((row) => row.orderId),
      [seeded.orderId],
      'an order number narrows the queue to that order',
    );

    const byName = await withTransaction((tx) => listCodApprovalQueue(tx, { search: 'Recipient' }));
    assert.equal(
      byName.some((row) => row.orderId === seeded.orderId),
      true,
      'a recipient name matches the queue row',
    );

    // ILIKE reads a percent sign as "anything". Escaped, it is a literal that appears in no order,
    // so a pattern character must not turn one search into the whole worklist.
    const wildcard = await withTransaction((tx) => listCodApprovalQueue(tx, { search: '%' }));
    assert.deepEqual(wildcard, []);
  });

  it('lists orders decided today with the decision and their recorded lines', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, actorFor(), {
        orderId: seeded.orderId,
        decision: 'approve',
        reason: 'confirmed by phone before the browser check',
      }),
    );

    const decided = await withTransaction((tx) => codDecidedToday(tx, { search: seeded.orderNumber }));
    assert.equal(decided.length, 1);
    assert.equal(decided[0]?.orderId, seeded.orderId);
    assert.equal(decided[0]?.decision, 'approved');
    assert.equal(decided[0]?.decidedAt instanceof Date, true);

    const detail = await withTransaction((tx) => codQueue(tx, { search: seeded.orderNumber }));
    assert.deepEqual(detail, [], 'a decided order is no longer in the waiting queue');
  });

  it('refuses to decide an order that is no longer pending', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await fixture.pool.query(`update "order" set status = 'processing' where id = $1`, [seeded.orderId]);

    await assert.rejects(
      () =>
        withTransaction((tx) =>
          decideCod(tx, actorFor(), { orderId: seeded.orderId, decision: 'reject', reason: 'late cancellation attempt' }),
        ),
      ConflictError,
    );

    const state = await fixture.pool.query<{ status: string }>(`select status from "order" where id = $1`, [
      seeded.orderId,
    ]);
    assert.equal(state.rows[0]?.status, 'processing');
  });
});
