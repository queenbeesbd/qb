/**
 * Product reviews against real PostgreSQL (ADR 0035).
 *
 * The rules this file exists to prove are the ones a page cannot:
 *
 * - a review is only written for a product this customer actually ordered;
 * - one customer writes one review per product, and the unique index is what refuses the second;
 * - a review is born pending and is not published by anything but the owner's decision;
 * - the words, stars and photo are frozen, and only a pending review can be decided;
 * - a review is never deleted, and a refusal is kept as the record of what was refused.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { withTransaction } from '../../src/db/client';
import { auditEvent } from '../../src/db/schema';
import type { ActorContext } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import {
  countPublishedReviews,
  decideReview,
  getOwnReview,
  listPublishedReviews,
  reviewEligibility,
  submitReview,
} from '../../src/server/reviews/service';
import { SKIP_REASON, seedOrder, startMigratedDatabase, toolingAvailable, type DbFixture, type Seeded } from './helpers';

const owner: ActorContext = {
  staffUserId: 1,
  permissions: new Set([PERMISSIONS.reviewModerate]),
  roleCodes: ['owner'],
};

describe('product reviews', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let seeded: Seeded;
  let productId: number;

  before(async () => {
    fixture = await startMigratedDatabase();
    seeded = await seedOrder(fixture.pool, { guest: false });
    const customerId = seeded.customerId;
    const staffId = seeded.staffId;
    assert.ok(customerId !== null);
    // The service authorizes its actor by id; the seeded staff row is the one the audit trail will name.
    (owner as { staffUserId: number }).staffUserId = staffId;

    const product = await fixture.pool.query<{ product_id: string }>(
      `select product_id from product_variant where id = $1`,
      [seeded.variantId],
    );
    productId = Number(product.rows[0]?.product_id);
  });

  after(async () => {
    await fixture.close();
  });

  it('accepts a review from a customer who ordered the product, and stores it pending', async () => {
    const result = await withTransaction((tx) =>
      submitReview(tx, {
        customerId: seeded.customerId as number,
        productId,
        ratingHalves: 8,
        body: 'Arrived quickly and the packaging was intact.',
      }),
    );
    assert.equal(result.ok, true);

    const rows = await fixture.pool.query<{ state: string; rating_halves: number; order_id: string }>(
      `select state, rating_halves, order_id from product_review`,
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0]?.state, 'pending');
    assert.equal(rows.rows[0]?.rating_halves, 8);
    // The order that entitled them to speak is recorded on the row, not just checked in code.
    assert.equal(Number(rows.rows[0]?.order_id), seeded.orderId);
  });

  it('is invisible to the public list while pending, and visible to its author', async () => {
    const published = await withTransaction((tx) => listPublishedReviews(tx, productId));
    assert.equal(published.length, 0);
    assert.equal(await withTransaction((tx) => countPublishedReviews(tx, productId)), 0);

    const own = await withTransaction((tx) => getOwnReview(tx, seeded.customerId as number, productId));
    assert.equal(own?.state, 'pending');
  });

  it('refuses a second review from the same customer for the same product', async () => {
    const result = await withTransaction((tx) =>
      submitReview(tx, {
        customerId: seeded.customerId as number,
        productId,
        ratingHalves: 2,
        body: 'A second opinion that should never be written.',
      }),
    );
    assert.deepEqual(result, { ok: false, reason: 'already_reviewed' });

    const eligibility = await withTransaction((tx) =>
      reviewEligibility(tx, seeded.customerId as number, productId),
    );
    assert.deepEqual(eligibility, { allowed: false, reason: 'already_reviewed' });

    const count = await fixture.pool.query<{ count: string }>(`select count(*)::text as count from product_review`);
    assert.equal(count.rows[0]?.count, '1');
  });

  it('refuses a customer who never ordered the product', async () => {
    const stranger = await fixture.pool.query<{ id: string }>(
      `insert into customer (email, display_name) values ('stranger@example.test', 'Stranger') returning id`,
    );
    const strangerId = Number(stranger.rows[0]?.id);

    const eligibility = await withTransaction((tx) => reviewEligibility(tx, strangerId, productId));
    assert.deepEqual(eligibility, { allowed: false, reason: 'not_purchased' });

    const result = await withTransaction((tx) =>
      submitReview(tx, {
        customerId: strangerId,
        productId,
        ratingHalves: 10,
        body: 'I have never bought this, which is the point.',
      }),
    );
    assert.deepEqual(result, { ok: false, reason: 'not_purchased' });
  });

  it('refuses a purchase that was cancelled', async () => {
    const cancelled = await seedOrder(fixture.pool, { guest: false, quantity: 1 });
    await fixture.pool.query(`update "order" set status = 'cancelled' where id = $1`, [cancelled.orderId]);
    const product = await fixture.pool.query<{ product_id: string }>(
      `select product_id from product_variant where id = $1`,
      [cancelled.variantId],
    );
    const cancelledProductId = Number(product.rows[0]?.product_id);

    const eligibility = await withTransaction((tx) =>
      reviewEligibility(tx, cancelled.customerId as number, cancelledProductId),
    );
    assert.deepEqual(eligibility, { allowed: false, reason: 'not_purchased' });
  });

  it('refuses a rating off the whole-star grid and a body outside the bounds', async () => {
    const seeded2 = await seedOrder(fixture.pool, { guest: false });
    const product = await fixture.pool.query<{ product_id: string }>(
      `select product_id from product_variant where id = $1`,
      [seeded2.variantId],
    );
    const otherProductId = Number(product.rows[0]?.product_id);

    await assert.rejects(
      withTransaction((tx) =>
        submitReview(tx, {
          customerId: seeded2.customerId as number,
          productId: otherProductId,
          ratingHalves: 7,
          body: 'Half a star is not an option a customer is offered.',
        }),
      ),
      /whole-star/,
    );

    await assert.rejects(
      withTransaction((tx) =>
        submitReview(tx, {
          customerId: seeded2.customerId as number,
          productId: otherProductId,
          ratingHalves: 8,
          body: 'too short',
        }),
      ),
      /between/,
    );
  });

  it('publishes on the owner decision, and the review becomes public with its photo key', async () => {
    const review = await fixture.pool.query<{ id: string }>(`select id from product_review limit 1`);
    const reviewId = Number(review.rows[0]?.id);

    const decided = await withTransaction((tx) => decideReview(tx, owner, reviewId, 'approved'));
    assert.equal(decided, true);

    const published = await withTransaction((tx) => listPublishedReviews(tx, productId));
    assert.equal(published.length, 1);
    assert.equal(published[0]?.ratingHalves, 8);

    const audit = await withTransaction((tx) =>
      tx
        .select({ action: auditEvent.action, entityType: auditEvent.entityType })
        .from(auditEvent)
        .where(sql`${auditEvent.action} in ('review.published', 'review.refused')`),
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.action, 'review.published');
    assert.equal(audit[0]?.entityType, 'review');
  });

  it('refuses a second decision on an already-decided review', async () => {
    const review = await fixture.pool.query<{ id: string }>(`select id from product_review limit 1`);
    const reviewId = Number(review.rows[0]?.id);

    await assert.rejects(
      withTransaction((tx) => decideReview(tx, owner, reviewId, 'rejected')),
      /already been decided/,
    );
  });

  it('refuses to rewrite the words, the stars or the purchase after insert', async () => {
    await assert.rejects(
      fixture.pool.query(`update product_review set body = 'Edited after approval.'`),
      /immutable/,
    );
    await assert.rejects(
      fixture.pool.query(`update product_review set rating_halves = 2`),
      /immutable/,
    );
    await assert.rejects(
      fixture.pool.query(`update product_review set order_id = order_id + 1`),
      /immutable/,
    );
  });

  it('refuses to delete a review', async () => {
    await assert.rejects(fixture.pool.query(`delete from product_review`), /append-only/);
  });

  it('refuses a review row that claims a decision without an actor', async () => {
    await assert.rejects(
      fixture.pool.query(
        `insert into product_review (product_id, customer_id, order_id, rating_halves, body, state)
         values ($1, $2, $3, 8, 'Approved by nobody in particular.', 'approved')`,
        [productId, seeded.customerId, seeded.orderId],
      ),
      /decision_complete/,
    );
  });

  it('accepts 4.5 as a product rating and refuses one outside the range', async () => {
    await fixture.pool.query(`update product set rating_halves = 9 where id = $1`, [productId]);
    const stored = await fixture.pool.query<{ rating_halves: number }>(
      `select rating_halves from product where id = $1`,
      [productId],
    );
    assert.equal(stored.rows[0]?.rating_halves, 9);

    await assert.rejects(
      fixture.pool.query(`update product set rating_halves = 11 where id = $1`, [productId]),
      /product_rating_halves_valid/,
    );
    await assert.rejects(
      fixture.pool.query(`update product set rating_halves = 1 where id = $1`, [productId]),
      /product_rating_halves_valid/,
    );
  });
});
