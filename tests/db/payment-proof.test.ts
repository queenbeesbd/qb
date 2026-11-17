/**
 * The optional payment screenshot against real PostgreSQL (ADR 0042).
 *
 * The rules this file exists to prove are the ones a screen cannot:
 *
 * - one order holds **one** screenshot, and a re-upload replaces it rather than accumulating images;
 * - a new image returns the row to `pending` - an old "checked" never silently covers a new claim;
 * - a rejection must state why, and a decision must name the owner who made it;
 * - the owner's decision writes an audit row and changes **nothing** about the order.
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
import {
  attachProof,
  loadProofSummary,
  proofTarget,
  reviewPaymentProof,
} from '../../src/server/orders/proof';
import { withTransaction } from '../../src/db/client';
import { SKIP_REASON, seedOrder, startMigratedDatabase, toolingAvailable, type DbFixture, type Seeded } from './helpers';

const owner: ActorContext = {
  staffUserId: 1,
  permissions: new Set([PERMISSIONS.paymentProofReview]),
  roleCodes: ['owner'],
};

/** A key shape the row's own check accepts: the private prefix, lowercase, one WebP file. */
const asset = {
  storageKey: 'payment-proof/proof-lq3k2a-9f1c2e.webp',
  contentType: 'image/webp',
  byteSize: 2048,
  width: 800,
  height: 1200,
} as const;

describe('payment screenshot', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let seeded: Seeded;

  before(async () => {
    fixture = await startMigratedDatabase();
    seeded = await seedOrder(fixture.pool, { guest: false });
    (owner as { staffUserId: number }).staffUserId = seeded.staffId;
  });

  after(async () => {
    await fixture.close();
  });

  it('holds one screenshot per order, and a direct second insert is refused', async () => {
    await withTransaction(async (tx) => {
      const target = await proofTarget(tx, seeded.customerId, seeded.orderNumber);
      assert.ok(target !== null);
      await attachProof(tx, target, asset);
    });

    await assert.rejects(
      fixture.pool.query(
        `insert into payment_proof (order_id, storage_key, content_type, byte_size, width, height)
         values ($1, $2, 'image/webp', 100, 10, 10)`,
        [seeded.orderId, 'payment-proof/proof-second-attempt.webp'],
      ),
      /payment_proof_order_unique/,
    );
  });

  it('replaces the image and returns the row to pending', async () => {
    await withTransaction((tx) =>
      reviewPaymentProof(tx, owner, { orderNumber: seeded.orderNumber, decision: 'checked', note: '' }),
    );

    await withTransaction(async (tx) => {
      const target = await proofTarget(tx, seeded.customerId, seeded.orderNumber);
      assert.ok(target !== null);
      await attachProof(tx, target, { ...asset, storageKey: 'payment-proof/proof-replaced.webp' });
    });

    const summary = await withTransaction((tx) => loadProofSummary(tx, seeded.orderNumber));
    assert.equal(summary?.reviewState, 'pending');
    assert.equal(summary?.reviewedAt, null);
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

    const summary = await withTransaction((tx) => loadProofSummary(tx, seeded.orderNumber));
    assert.equal(summary?.reviewState, 'rejected');
    assert.equal(summary?.reviewNote, 'No matching transaction in the statement.');
    assert.ok(summary?.reviewedAt instanceof Date);
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
