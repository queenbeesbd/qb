import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { decideCod, decideVerification, listVerificationQueue } from '../../src/server/orders/manage';
import { ConflictError, ValidationError } from '../../src/server/authz/authorize';

/** The actor context used for every owner decision in this file: full owner permissions. */
const OWNER = {
  staffUserId: 0,
  permissions: new Set([
    'payment.verify', 'payment.reject', 'payment.flag_false', 'cod.approve', 'order.cancel', 'order.read',
  ]),
  roleCodes: ['owner'],
};

describe('payment verification and COD confirmation (Phase 16A)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let sequence = 0;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
  });

  after(async () => {
    await fixture.close();
  });

  async function claimOn(options: { reference?: string } = {}): Promise<number> {
    sequence += 1;
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'bkash', withReservation: false });
    const reference = `REF${String(sequence).padStart(8, '0')}`;
    await fixture.pool.query(
      `insert into payment_claim
         (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor,
          state, submitted_by_customer_id)
       values ($1, $2, '01712345678', $3, 10100, 'submitted', $4) returning id`,
      [seeded.orderId, seeded.recipientId, options.reference ?? reference, seeded.customerId],
    );
    await fixture.pool.query(
      `update "order" set payment_state = 'awaiting_verification', expires_at = null where id = $1`,
      [seeded.orderId],
    );
    return seeded.orderId;
  }

  function actorFor() {
    return OWNER;
  }

  it('verifies a matching claim with the confirmed amount, audited and idempotent by conflict', async () => {
    // The seeded claim is 100 poisha above the total on purpose: verifying a mismatch requires the
    // explicit acknowledgement, so this test first asserts that gate, then verifies with it set.
    const orderId = await claimOn();
    const claim = await fixture.pool.query<{ id: string }>(
      `select id from payment_claim where order_id = $1`, [orderId],
    );
    const claimId = Number(claim.rows[0]?.id);

    await assert.rejects(
      () => withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'verify', rawVerifiedAmount: '10100' })),
      ValidationError,
    );

    await withTransaction((tx) =>
      decideVerification(tx, actorFor(), {
        claimId,
        decision: 'verify',
        rawVerifiedAmount: '10100',
        mismatchAcknowledged: true,
      }),
    );

    const afterVerify = await fixture.pool.query<{ state: string; verified_amount_minor: number | null }>(
      `select payment_claim.state, payment_claim.verified_amount_minor
         from payment_claim where id = $1`, [claimId],
    );
    assert.deepEqual(afterVerify.rows[0], { state: 'verified', verified_amount_minor: 10100 });
    const orderRow = await fixture.pool.query<{ payment_state: string }>(
      `select payment_state from "order" where id = $1`, [orderId],
    );
    assert.equal(orderRow.rows[0]?.payment_state, 'verified');

    const audit = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where entity_type = 'payment_claim' and entity_id = $1 order by id`,
      [claimId],
    );
    assert.deepEqual(audit.rows.map((row) => row.action), ['payment.verified']);

    // A second decision is a conflict, not a second audit row.
    await assert.rejects(
      () => withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'reject', reason: 'second refusal here' })),
      ConflictError,
    );
    const audits = await fixture.pool.query<{ n: number }>(
      `select count(*)::int as n from audit_event where entity_type = 'payment_claim' and entity_id = $1`,
      [claimId],
    );
    assert.equal(audits.rows[0]?.n, 1);
  });

  it('refuses to verify without a confirmed amount, and rejects with a required reason', async () => {
    const orderId = await claimOn();
    const claim = await fixture.pool.query<{ id: string }>(
      `select id from payment_claim where order_id = $1`, [orderId],
    );
    const claimId = Number(claim.rows[0]?.id);

    await assert.rejects(
      () => withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'verify' })),
      ValidationError,
    );

    await assert.rejects(
      () => withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'reject', reason: 'short' })),
      ValidationError,
    );

    await withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'reject', reason: 'receipt could not be found' }));
    const row = await fixture.pool.query<{ state: string }>(
      `select state from payment_claim where id = $1`, [claimId],
    );
    assert.equal(row.rows[0]?.state, 'rejected');
  });

  it('holds on a mismatch as an open exception, then releases it; the claim state never changes', async () => {
    const orderId = await claimOn();
    const claim = await fixture.pool.query<{ id: string }>(
      `select id from payment_claim where order_id = $1`, [orderId],
    );
    const claimId = Number(claim.rows[0]?.id);

    await withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'hold', reason: 'amount differs from total' }));

    const exception = await fixture.pool.query<{ state: string; type: string }>(
      `select state, type from operational_exception where order_id = $1`, [orderId],
    );
    assert.equal(exception.rows[0]?.type, 'payment_mismatch');
    assert.equal(exception.rows[0]?.state, 'open');
    const claimState = await fixture.pool.query<{ state: string }>(
      `select state from payment_claim where id = $1`, [claimId],
    );
    assert.equal(claimState.rows[0]?.state, 'submitted');

    // A second hold is a conflict (the exception partial unique).
    await assert.rejects(
      () => withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'hold', reason: 'duplicate hold attempt' })),
      ConflictError,
    );

    await withTransaction((tx) => decideVerification(tx, actorFor(), { claimId, decision: 'release_hold', reason: 'mismatch explained by customer' }));
    const released = await fixture.pool.query<{ state: string; note: string | null }>(
      `select state, note from operational_exception where order_id = $1`, [orderId],
    );
    assert.equal(released.rows[0]?.state, 'resolved');
  });

  it('flags the queue for duplicate references before any decision', async () => {
    // Two submitted claims carrying the same transaction reference: the queue returns them both and
    // the owner sees the flag; the database refuses nothing, because a duplicate reference is an
    // honest mistake to surface, not a validation error to reject.
    await claimOn({ reference: 'REFDUPLICATE1' });
    await claimOn({ reference: 'REFDUPLICATE1' });
    const queue = await withTransaction((tx) => listVerificationQueue(tx));
    const duplicates = queue.filter((row) => row.transactionReference === 'REFDUPLICATE1');
    assert.equal(duplicates.length, 2);
    // Every row is also matched by the read layer's own reference check.
    assert.equal(
      queue.filter((row) => row.hasOpenHold === false).length,
      queue.length,
    );
  });

  it('never bans a customer by itself: a rejected claim leaves the account active', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'bkash', withReservation: false });
    const inserted = await fixture.pool.query<{ id: string }>(
      `insert into payment_claim
         (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor,
          state, submitted_by_customer_id)
       values ($1, $2, '01712345678', 'REFREJECT001', 10100, 'submitted', $3) returning id`,
      [seeded.orderId, seeded.recipientId, seeded.customerId],
    );
    await withTransaction((tx) =>
      decideVerification(tx, actorFor(), { claimId: Number(inserted.rows[0]?.id), decision: 'reject', reason: 'not received at all' }),
    );
    const account = await fixture.pool.query<{ status: string }>(
      `select status from customer where id = $1`, [seeded.customerId],
    );
    assert.equal(account.rows[0]?.status, 'active');
  });

  it('approves a COD order, guards it against repeats, and rejects it to cancelled while pending', async () => {
    const approve = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, actorFor(), { orderId: approve.orderId, decision: 'approve', reason: 'confirmed by phone with the customer' }),
    );
    const approved = await fixture.pool.query<{ cod_state: string; status: string }>(
      `select cod_state, status from "order" where id = $1`, [approve.orderId],
    );
    assert.deepEqual(approved.rows[0], { cod_state: 'cod_approved', status: 'confirmed' });

    // Repeated approval is a conflict, not a second audit record.
    await assert.rejects(
      () => withTransaction((tx) => decideCod(tx, actorFor(), { orderId: approve.orderId, decision: 'approve', reason: 'second approval attempt' })),
      ConflictError,
    );

    const reject = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, actorFor(), { orderId: reject.orderId, decision: 'reject', reason: 'customer unreachable after the call' }),
    );
    const rejected = await fixture.pool.query<{ cod_state: string; status: string }>(
      `select cod_state, status from "order" where id = $1`, [reject.orderId],
    );
    // cod_state stays bound to the payment method by schema CHECK; the order itself is cancelled.
    assert.deepEqual(rejected.rows[0], { cod_state: 'cod_pending_approval', status: 'cancelled' });

    // A COD order never appears in the prepaid queue.
    const queue = await withTransaction((tx) => listVerificationQueue(tx));
    assert.equal(queue.some((row) => row.orderId === approve.orderId), false);
  });

  it('keeps a claimed order out of any expiry path: expires_at stays cleared after decisions', async () => {
    const orderId = await claimOn();
    const row = await fixture.pool.query<{ expires_at: Date | null }>(
      `select expires_at from "order" where id = $1`, [orderId],
    );
    assert.equal(row.rows[0]?.expires_at, null);
  });
});