import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';

import {
  SKIP_REASON,
  seedOrder,
  startMigratedDatabase,
  toolingAvailable,
  type DbFixture,
} from './helpers';

/**
 * Concurrency invariants.
 *
 * Phase 10 recorded the D11 guarantees as reasoned but **unexecuted** (its acceptance criterion A14).
 * These tests exercise them against real PostgreSQL, which is the only way a claim about locking,
 * atomicity and idempotency stops being a design assertion.
 *
 * They cover the schema and the guarded statements the design specifies - not the full order and
 * payment workflow, which belongs to a later phase.
 */

/** Runs `count` callbacks as close to simultaneously as the event loop allows. */
async function concurrently<T>(count: number, fn: (index: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: count }, (_unused, index) => fn(index)));
}

describe('concurrency invariants', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let pool: Pool;

  before(async () => {
    fixture = await startMigratedDatabase();
    pool = fixture.pool;
  });

  after(async () => {
    await fixture.close();
  });

  describe('the oversell backstop under concurrency', () => {
    it('never lets reserved exceed on_hand, however many reservers race', async () => {
      const seeded = await seedOrder(pool, { onHand: 5, withReservation: false });

      // 12 concurrent attempts to reserve 1 unit each against 5 units on hand.
      const results = await concurrently(12, () =>
        pool.query(
          `update inventory_balance
              set reserved = reserved + 1, updated_at = now()
            where variant_id = $1 and on_hand - reserved >= 1
            returning reserved`,
          [seeded.variantId],
        ),
      );

      const succeeded = results.filter(
        (result) => result.status === 'fulfilled' && (result.value.rowCount ?? 0) === 1,
      ).length;
      const failed = results.filter(
        (result) =>
          result.status === 'fulfilled' &&
          (result.value.rowCount ?? 0) === 0,
      ).length;

      assert.equal(succeeded, 5, 'exactly five reservations should succeed against five units');
      assert.equal(failed, 7, 'the remaining seven must fail cleanly, not silently succeed');

      const balance = await pool.query<{ on_hand: number; reserved: number }>(
        'select on_hand, reserved from inventory_balance where variant_id = $1',
        [seeded.variantId],
      );
      assert.equal(balance.rows[0]?.reserved, 5);
      assert.ok(
        (balance.rows[0]?.reserved ?? 0) <= (balance.rows[0]?.on_hand ?? 0),
        'reserved must never exceed on_hand',
      );
    });

    it('cannot be defeated by a plain concurrent increment', async () => {
      // Even bypassing the availability guard, the CHECK holds: this is the backstop, not the guard.
      const seeded = await seedOrder(pool, { onHand: 1, withReservation: false });
      const results = await concurrently(6, () =>
        pool.query('update inventory_balance set reserved = reserved + 1 where variant_id = $1', [
          seeded.variantId,
        ]),
      );

      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      assert.equal(succeeded, 1, 'only one increment can satisfy reserved <= on_hand');
      for (const result of results.filter((entry) => entry.status === 'rejected')) {
        const error = (result as PromiseRejectedResult).reason as { code?: string };
        assert.equal(error.code, '23514', 'the rejection must be the check constraint');
      }
    });
  });

  describe('at most one active submitted claim per order', () => {
    it('accepts exactly one claim when several are submitted at once', async () => {
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });

      const results = await concurrently(8, (index) =>
        pool.query(
          `insert into payment_claim
             (order_id, payment_recipient_id, sender_msisdn, transaction_reference,
              claimed_amount_minor, submitted_by_customer_id)
           values ($1, $2, '01711111111', $3, 10000, $4)`,
          [seeded.orderId, seeded.recipientId, `RACEREF${index}`, seeded.customerId],
        ),
      );

      const accepted = results.filter((result) => result.status === 'fulfilled').length;
      assert.equal(accepted, 1, 'exactly one concurrent claim may be accepted');

      for (const result of results.filter((entry) => entry.status === 'rejected')) {
        const error = (result as PromiseRejectedResult).reason as { code?: string };
        assert.equal(error.code, '23505', 'losers must be refused by the unique index');
      }

      const live = await pool.query<{ count: string }>(
        `select count(*) from payment_claim where order_id = $1 and state = 'submitted'`,
        [seeded.orderId],
      );
      assert.equal(Number(live.rows[0]?.count), 1);
    });

    it('keeps the bound under an explicit row lock, as the allocation transaction does', async () => {
      // Mirrors the design's step order: lock the balance row, then decide.
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });

      const attempt = async (reference: string): Promise<'accepted' | 'refused'> => {
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query('select variant_id from inventory_balance where variant_id = $1 for update', [
            seeded.variantId,
          ]);
          const competing = await client.query<{ count: string }>(
            `select count(*) from payment_claim c
               join order_item oi on oi.order_id = c.order_id
              where oi.variant_id = $1 and c.state = 'submitted' and c.order_id <> $2`,
            [seeded.variantId, seeded.orderId],
          );
          const already = await client.query<{ count: string }>(
            `select count(*) from payment_claim where order_id = $1 and state = 'submitted'`,
            [seeded.orderId],
          );
          if (Number(competing.rows[0]?.count) > 0 || Number(already.rows[0]?.count) > 0) {
            await client.query('commit');
            return 'refused';
          }
          await client.query(
            `insert into payment_claim
               (order_id, payment_recipient_id, sender_msisdn, transaction_reference,
                claimed_amount_minor, submitted_by_customer_id)
             values ($1, $2, '01711111111', $3, 10000, $4)`,
            [seeded.orderId, seeded.recipientId, reference, seeded.customerId],
          );
          await client.query('commit');
          return 'accepted';
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      };

      const outcomes = await concurrently(6, (index) => attempt(`LOCKREF${index}`));
      const accepted = outcomes.filter(
        (result) => result.status === 'fulfilled' && result.value === 'accepted',
      ).length;
      const refused = outcomes.filter(
        (result) => result.status === 'fulfilled' && result.value === 'refused',
      ).length;
      const errors = outcomes
        .filter((result) => result.status === 'rejected')
        .map((result) => String((result as PromiseRejectedResult).reason))
        .join(' | ');
      assert.equal(
        accepted,
        1,
        `the row lock plus the bound must yield exactly one winner (refused=${refused}, errors=${errors})`,
      );
    });

    it('accepts a new claim once the previous one is resolved', async () => {
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });
      const first = await pool.query<{ id: string }>(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01711111111', 'SEQREF0001', 10000, $3) returning id`,
        [seeded.orderId, seeded.recipientId, seeded.customerId],
      );

      // A second submission while one is live is refused.
      await assert.rejects(() =>
        pool.query(
          `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
           values ($1, $2, '01711111111', 'SEQREF0002', 10000, $3)`,
          [seeded.orderId, seeded.recipientId, seeded.customerId],
        ),
      );

      // After an explicit resolution, the customer may submit a corrected claim as a NEW row.
      await pool.query(
        `update payment_claim set state = 'rejected', resolved_at = now(), resolved_by_staff_id = $2,
                resolution_reason = 'Receipt could not be confirmed in the merchant account'
          where id = $1`,
        [Number(first.rows[0]?.id), seeded.staffId],
      );

      await pool.query(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01711111111', 'SEQREF0003', 10000, $3)`,
        [seeded.orderId, seeded.recipientId, seeded.customerId],
      );

      const history = await pool.query<{ count: string }>(
        'select count(*) from payment_claim where order_id = $1',
        [seeded.orderId],
      );
      assert.equal(Number(history.rows[0]?.count), 2, 'history is preserved, never overwritten');
    });
  });

  describe('guarded release is idempotent', () => {
    it('produces exactly one release effect when raced', async () => {
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });

      const results = await concurrently(8, () =>
        pool.query(
          `update stock_reservation
              set state = 'released', resolved_at = now(), release_reason = 'expired_unpaid', expires_at = null
            where id = $1 and state = 'held'
            returning id`,
          [seeded.reservationId],
        ),
      );

      const released = results.filter(
        (result) => result.status === 'fulfilled' && (result.value.rowCount ?? 0) === 1,
      ).length;
      assert.equal(released, 1, 'exactly one racer may release the reservation');

      const state = await pool.query<{ state: string }>(
        'select state from stock_reservation where id = $1',
        [seeded.reservationId],
      );
      assert.equal(state.rows[0]?.state, 'released');
    });

    it('cannot post the same release movement twice', async () => {
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });
      await pool.query(
        `update stock_reservation set state = 'released', resolved_at = now(),
                release_reason = 'expired_unpaid', expires_at = null
          where id = $1`,
        [seeded.reservationId],
      );

      const key = `release:${seeded.reservationId}`;
      const insert = `insert into inventory_movement
          (movement_key, variant_id, delta_reserved, reason, reservation_id, on_hand_after, reserved_after)
        values ($1, $2, -1, 'reservation_released', $3, 1, 0)`;

      const results = await concurrently(6, () =>
        pool.query(insert, [key, seeded.variantId, seeded.reservationId]),
      );

      const inserted = results.filter((result) => result.status === 'fulfilled').length;
      assert.equal(inserted, 1, 'the movement key permits exactly one ledger row');

      const movements = await pool.query<{ count: string }>(
        'select count(*) from inventory_movement where movement_key = $1',
        [key],
      );
      assert.equal(Number(movements.rows[0]?.count), 1);
    });

    it('refuses to release a reservation whose claim is submitted, except on a confirmed false claim', async () => {
      const seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });
      await pool.query(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01711111111', 'HELDREF0001', 10000, $3)`,
        [seeded.orderId, seeded.recipientId, seeded.customerId],
      );
      // Submitting a claim clears the reservation expiry: a submitted claim is never timed out.
      await pool.query('update stock_reservation set expires_at = null where id = $1', [seeded.reservationId]);

      const reservation = await pool.query<{ state: string; expires_at: Date | null }>(
        'select state, expires_at from stock_reservation where id = $1',
        [seeded.reservationId],
      );
      assert.equal(reservation.rows[0]?.state, 'held');
      assert.equal(
        reservation.rows[0]?.expires_at,
        null,
        'a submitted claim must clear the expiry, so no timer can release it',
      );

      // The expiry sweep's predicate cannot select it.
      const sweep = await pool.query<{ id: string }>(
        `select o.id from "order" o
          where o.payment_state = 'awaiting_payment'
            and o.expires_at is not null
            and o.expires_at <= now()
            and not exists (select 1 from payment_claim c where c.order_id = o.id and c.state = 'submitted')`,
      );
      assert.equal(sweep.rowCount, 0, 'an order with a submitted claim must never match the sweep');
    });

    it('selects only orders with no submitted claim for expiry', async () => {
      // Both are placed 25 hours ago, so both are past their 24-hour window. `placed_at` is frozen
      // after insert, so the orders are seeded already backdated rather than updated into the past.
      const abandoned = await seedOrder(pool, { onHand: 1, placedHoursAgo: 25 });
      const claimed = await seedOrder(pool, { onHand: 1, placedHoursAgo: 25 });

      // One of them then has a payment claim submitted, which clears its expiry.
      await pool.query(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01711111111', 'SWEEPREF001', 10000, $3)`,
        [claimed.orderId, claimed.recipientId, claimed.customerId],
      );
      await pool.query(
        `update "order" set payment_state = 'awaiting_verification', expires_at = null where id = $1`,
        [claimed.orderId],
      );
      await pool.query('update stock_reservation set expires_at = null where order_id = $1', [
        claimed.orderId,
      ]);

      const sweep = await pool.query<{ id: string }>(
        `select o.id from "order" o
          where o.payment_state = 'awaiting_payment'
            and o.expires_at is not null
            and o.expires_at <= now()
            and not exists (select 1 from payment_claim c where c.order_id = o.id and c.state = 'submitted')`,
      );

      const ids = sweep.rows.map((row) => Number(row.id));
      assert.ok(ids.includes(abandoned.orderId), 'the unpaid order must be expirable');
      assert.ok(!ids.includes(claimed.orderId), 'the claimed order must never be expirable');
    });
  });

  describe('multi-row locking', () => {
    it('does not deadlock when two transactions lock two balances in the same order', async () => {
      const first = await seedOrder(pool, { onHand: 2, withReservation: false });
      const second = await seedOrder(pool, { onHand: 2, withReservation: false });
      const ordered = [first.variantId, second.variantId].sort((a, b) => a - b);

      const lockBoth = async (): Promise<void> => {
        const client = await pool.connect();
        try {
          await client.query('begin');
          // Ascending variant_id is the documented lock order (data-model 12.6).
          for (const variantId of ordered) {
            await client.query('select variant_id from inventory_balance where variant_id = $1 for update', [
              variantId,
            ]);
          }
          await client.query('commit');
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      };

      const results = await concurrently(4, lockBoth);
      for (const result of results) {
        assert.equal(result.status, 'fulfilled', 'consistent lock ordering must not deadlock');
      }
    });
  });
});
