/**
 * The optional payment screenshot against real PostgreSQL (ADR 0042, narrowed 2026-11-19).
 *
 * The rules this file exists to prove are the ones a screen cannot:
 *
 * - one order holds **one** screenshot, and the schema refuses a second row;
 * - a rejection must state why, and a decision must name the owner who made it;
 * - the owner's decision writes an audit row and changes **nothing** about the order.
 *
 * **The customer's write path is checkout only (owner direction, 2026-11-19).** The receipt used to draw
 * the same field and a route accepted a replacement image; both are gone, so the helpers that attached
 * from the receipt no longer exist and this file seeds its row the way checkout writes it - one insert at
 * placement. What a customer can no longer do is therefore not asserted as a screen behaviour here; it is
 * absent by construction.
 *
 * Nothing here proves anything was paid. The table has no payment state to set and the order has no
 * column for one - that absence is the design, so there is no assertion for it beyond "the order rows
 * are byte-identical afterwards".
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ActorContext } from '../../src/server/authz/authorize';
import { ValidationError } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import { reviewPaymentProof } from '../../src/server/orders/proof';
import { withTransaction } from '../../src/db/client';
import { SKIP_REASON, seedOrder, startMigratedDatabase, toolingAvailable, type DbFixture, type Seeded } from './helpers';

/** The owner as the service sees them: one privileged permission, and the id the audit row names. */
function ownerActor(staffUserId: number): ActorContext {
  return {
    staffUserId,
    permissions: new Set([PERMISSIONS.paymentProofReview]),
    roleCodes: ['owner'],
  };
}

/** A key shape the row's own check accepts: the private prefix, lowercase, one WebP file. */
const asset = {
  storageKey: 'payment-proof/proof-lq3k2a-9f1c2e.webp',
  contentType: 'image/webp',
  byteSize: 2048,
  width: 800,
  height: 1200,
} as const;

/** What checkout writes when a customer attached an image while placing the order. */
async function attachAtPlacement(fixture: DbFixture, orderId: number, key: string): Promise<void> {
  await fixture.pool.query(
    `insert into payment_proof (order_id, storage_key, content_type, byte_size, width, height, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, 'customer')`,
    [orderId, key, asset.contentType, asset.byteSize, asset.width, asset.height],
  );
}

describe('payment screenshot', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let seeded: Seeded;
  /** Built in `before` once the fixture has a staff id; the audit row must name a real one. */
  let owner: ActorContext;

  before(async () => {
    fixture = await startMigratedDatabase();
    seeded = await seedOrder(fixture.pool, { guest: false });
    owner = ownerActor(seeded.staffId);
    await attachAtPlacement(fixture, seeded.orderId, asset.storageKey);
  });

  after(async () => {
    await fixture.close();
  });

  it('holds one screenshot per order, and a direct second insert is refused', async () => {
    await assert.rejects(
      fixture.pool.query(
        `insert into payment_proof (order_id, storage_key, content_type, byte_size, width, height)
         values ($1, $2, 'image/webp', 100, 10, 10)`,
        [seeded.orderId, 'payment-proof/proof-second-attempt.webp'],
      ),
      /payment_proof_order_unique/,
    );
  });

  it('starts a screenshot as pending, decided by nobody', async () => {
    const row = await fixture.pool.query<{ review_state: string; reviewed_by: number | null; reviewed_at: Date | null }>(
      `select review_state, reviewed_by, reviewed_at from payment_proof where order_id = $1`,
      [seeded.orderId],
    );
    assert.equal(row.rows[0]?.review_state, 'pending');
    assert.equal(row.rows[0]?.reviewed_by, null);
    assert.equal(row.rows[0]?.reviewed_at, null);
  });

  it('refuses a rejection with no reason, and records one with it', async () => {
    await assert.rejects(
      withTransaction((tx) =>
        reviewPaymentProof(tx, owner, { orderNumber: seeded.orderNumber, decision: 'rejected', note: '  ' }),
      ),
      ValidationError,
    );

    await withTransaction((tx) =>
      reviewPaymentProof(tx, owner, {
        orderNumber: seeded.orderNumber,
        decision: 'rejected',
        note: 'No matching transaction in the statement.',
      }),
    );

    const row = await fixture.pool.query<{ review_state: string; review_note: string; reviewed_at: Date }>(
      `select review_state, review_note, reviewed_at from payment_proof where order_id = $1`,
      [seeded.orderId],
    );
    assert.equal(row.rows[0]?.review_state, 'rejected');
    assert.equal(row.rows[0]?.review_note, 'No matching transaction in the statement.');
    assert.ok(row.rows[0]?.reviewed_at instanceof Date);
  });

  it('writes an audit row and moves no order column', async () => {
    const before = await fixture.pool.query(
      `select status, payment_state, cod_state, items_subtotal_minor, shipping_minor, discount_minor, total_minor
       from "order" where id = $1`,
      [seeded.orderId],
    );

    await withTransaction((tx) =>
      reviewPaymentProof(tx, owner, { orderNumber: seeded.orderNumber, decision: 'checked', note: 'Matched.' }),
    );

    const after = await fixture.pool.query(
      `select status, payment_state, cod_state, items_subtotal_minor, shipping_minor, discount_minor, total_minor
       from "order" where id = $1`,
      [seeded.orderId],
    );
    assert.deepEqual(after.rows[0], before.rows[0]);

    const audit = await fixture.pool.query<{ count: string }>(
      `select count(*)::text as count from audit_event
       where action = 'order.payment_proof_reviewed' and entity_type = 'payment_proof'`,
    );
    assert.ok(Number(audit.rows[0]?.count) >= 2);
  });

  it('refuses to decide a screenshot that does not exist', async () => {
    const other = await seedOrder(fixture.pool, { guest: false, quantity: 1 });
    await assert.rejects(
      withTransaction((tx) =>
        reviewPaymentProof(tx, owner, { orderNumber: other.orderNumber, decision: 'checked', note: '' }),
      ),
      ValidationError,
    );
  });
});
