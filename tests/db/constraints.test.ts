import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';

import { applyMigrations, migrationStatus } from '../../src/db/migrate';
import { validateSchema } from '../../src/db/validate';
import {
  CHECK_VIOLATION,
  SKIP_REASON,
  UNIQUE_VIOLATION,
  expectSqlState,
  seedOrder,
  startMigratedDatabase,
  toolingAvailable,
  type DbFixture,
  type Seeded,
} from './helpers';

describe('schema constraints against real PostgreSQL', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let pool: Pool;
  let seeded: Seeded;

  before(async () => {
    fixture = await startMigratedDatabase();
    pool = fixture.pool;
  });

  after(async () => {
    await fixture.close();
  });

  it('applies every migration from an empty database', async () => {
    const report = await migrationStatus(fixture.cluster.url);
    assert.equal(report.pending.length, 0, 'no migration should remain pending');
    assert.equal(report.unknownApplied.length, 0, 'no applied migration should be unrecognised');
    assert.ok(report.entries.length >= 2, 'baseline plus guards should both be recorded');
  });

  it('is idempotent: applying migrations again changes nothing', async () => {
    const before = await migrationStatus(fixture.cluster.url);
    await applyMigrations(fixture.cluster.url);
    const after = await migrationStatus(fixture.cluster.url);
    assert.equal(after.applied, before.applied);
    assert.equal(after.pending.length, 0);
  });

  it('validates the live catalog against the migration files', async () => {
    const report = await validateSchema(fixture.cluster.url);
    const failures = report.checks.filter((check) => !check.ok);
    assert.deepEqual(failures, [], `schema validation failed: ${JSON.stringify(failures)}`);
    assert.equal(report.counts.tables, 40);
  });

  it('seeds a complete order graph', async () => {
    seeded = await seedOrder(pool, { onHand: 1, quantity: 1 });
    assert.ok(seeded.orderId > 0);
    assert.ok(seeded.reservationId > 0);
  });

  describe('inventory', () => {
    it('refuses to reserve more than is on hand (the oversell backstop)', async () => {
      const message = await expectSqlState(
        pool,
        'update inventory_balance set reserved = on_hand + 1 where variant_id = $1',
        [seeded.variantId],
        CHECK_VIOLATION,
      );
      assert.match(message, /reserved_within_on_hand/);
    });

    it('refuses a negative on_hand', async () => {
      await expectSqlState(
        pool,
        'update inventory_balance set on_hand = -1 where variant_id = $1',
        [seeded.variantId],
        CHECK_VIOLATION,
      );
    });

    it('refuses a movement that changes nothing', async () => {
      await expectSqlState(
        pool,
        `insert into inventory_movement (movement_key, variant_id, delta_on_hand, delta_reserved, reason, on_hand_after, reserved_after)
         values ('noop:1', $1, 0, 0, 'order_reserved', 1, 0)`,
        [seeded.variantId],
        CHECK_VIOLATION,
      );
    });

    it('requires a person and a note for a manual stock adjustment', async () => {
      await expectSqlState(
        pool,
        `insert into inventory_movement (movement_key, variant_id, delta_on_hand, reason, on_hand_after, reserved_after)
         values ('adjust:1', $1, 5, 'stock_adjustment', 6, 1)`,
        [seeded.variantId],
        CHECK_VIOLATION,
      );
    });

    it('makes the movement key unique, so a release cannot be posted twice', async () => {
      await pool.query(
        `insert into inventory_movement (movement_key, variant_id, delta_reserved, reason, on_hand_after, reserved_after)
         values ('release:test', $1, -1, 'reservation_released', 1, 0)`,
        [seeded.variantId],
      );
      await expectSqlState(
        pool,
        `insert into inventory_movement (movement_key, variant_id, delta_reserved, reason, on_hand_after, reserved_after)
         values ('release:test', $1, -1, 'reservation_released', 1, 0)`,
        [seeded.variantId],
        UNIQUE_VIOLATION,
      );
    });
  });

  describe('order integrity', () => {
    it('refuses a total that is not the sum of its parts', async () => {
      await expectSqlState(
        pool,
        `update "order" set total_minor = total_minor + 1 where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('refuses an expiry that is not exactly 24 hours after placement', async () => {
      await expectSqlState(
        pool,
        `update "order" set expires_at = placed_at + interval '48 hours' where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('freezes the charged amount after insert', async () => {
      // Both the immutability trigger and the total-sum CHECK apply; either refusal is correct.
      const message = await expectSqlState(
        pool,
        `update "order" set items_subtotal_minor = 1, total_minor = 1 where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
      assert.match(message, /immutable/);
    });

    it('freezes the order number and the payment method', async () => {
      await expectSqlState(
        pool,
        `update "order" set payment_method = 'nagad' where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('requires COD state to be not_applicable for a prepaid order', async () => {
      await expectSqlState(
        pool,
        `update "order" set cod_state = 'cod_pending_approval' where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('rejects a COD order carrying an MFS payment state', async () => {
      await expectSqlState(
        pool,
        `insert into "order" (order_number, customer_id, payment_method, payment_state, cod_state, items_subtotal_minor, shipping_minor, total_minor)
         values ('QBBADCOD1', $1, 'cod', 'awaiting_payment', 'cod_pending_approval', 1, 0, 1)`,
        [seeded.customerId],
        CHECK_VIOLATION,
      );
    });

    it('keeps COD states out of the payment state column', async () => {
      await expectSqlState(
        pool,
        `update "order" set payment_state = 'cod_collected' where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('refuses a currency other than BDT', async () => {
      await expectSqlState(
        pool,
        `update "order" set currency = 'USD' where id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });

    it('freezes order lines after insert', async () => {
      const message = await expectSqlState(
        pool,
        'update order_item set quantity = 99 where id = $1',
        [seeded.orderItemId],
        CHECK_VIOLATION,
      );
      assert.match(message, /append-only/);
    });

    it('refuses a line total that disagrees with price times quantity', async () => {
      await expectSqlState(
        pool,
        `insert into order_item (order_id, variant_id, product_name_bn, product_name_en, sku, unit_price_minor, quantity, line_total_minor)
         values ($1, $2, 'পণ্য', 'Product', 'SKU-X', 100, 2, 999)`,
        [seeded.orderId, seeded.variantId],
        CHECK_VIOLATION,
      );
    });
  });

  describe('reservations', () => {
    it('allows only three reservation states', async () => {
      await expectSqlState(
        pool,
        `update stock_reservation set state = 'pending_inspection' where id = $1`,
        [seeded.reservationId],
        CHECK_VIOLATION,
      );
    });

    it('refuses to revive a released reservation', async () => {
      // Self-contained: a transition is only illegal if there is a transition to make, so this
      // releases its own reservation first rather than depending on test ordering.
      const fresh = await seedOrder(pool, { onHand: 1 });
      await pool.query(
        `update stock_reservation set state = 'released', resolved_at = now(),
                release_reason = 'expired_unpaid', expires_at = null
          where id = $1`,
        [fresh.reservationId],
      );

      const message = await expectSqlState(
        pool,
        `update stock_reservation set state = 'held', resolved_at = null, release_reason = null where id = $1`,
        [fresh.reservationId],
        CHECK_VIOLATION,
      );
      assert.match(message, /illegal stock_reservation transition/);
    });

    it('requires a reason when a reservation is released', async () => {
      const fresh = await seedOrder(pool, { onHand: 1 });
      const message = await expectSqlState(
        pool,
        // `expires_at` is cleared exactly as the real release statement does, so the constraint
        // that fires is the missing reason rather than the leftover live expiry.
        `update stock_reservation set state = 'released', resolved_at = now(), expires_at = null where id = $1`,
        [fresh.reservationId],
        CHECK_VIOLATION,
      );
      assert.match(message, /released_has_reason/);
    });

    it('releases exactly once through the guarded transition', async () => {
      const first = await pool.query(
        `update stock_reservation
            set state = 'released', resolved_at = now(), release_reason = 'expired_unpaid', expires_at = null
          where id = $1 and state = 'held'
          returning id`,
        [seeded.reservationId],
      );
      assert.equal(first.rowCount, 1, 'the guarded release should affect exactly one row');

      const second = await pool.query(
        `update stock_reservation
            set state = 'released', resolved_at = now(), release_reason = 'expired_unpaid', expires_at = null
          where id = $1 and state = 'held'
          returning id`,
        [seeded.reservationId],
      );
      assert.equal(second.rowCount, 0, 'a repeated release must be a no-op, not a second effect');
    });

    it('permits only one live hold per order line', async () => {
      const fresh = await seedOrder(pool, { onHand: 2, quantity: 1 });
      await expectSqlState(
        pool,
        `insert into stock_reservation (order_id, order_item_id, variant_id, quantity)
         values ($1, $2, $3, 1)`,
        [fresh.orderId, fresh.orderItemId, fresh.variantId],
        UNIQUE_VIOLATION,
      );
    });
  });

  describe('payment claims', () => {
    it('permits only one active submitted claim per order', async () => {
      const fresh = await seedOrder(pool);
      const insert = `insert into payment_claim
          (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
        values ($1, $2, '01733333333', $3, 10000, $4)`;

      await pool.query(insert, [fresh.orderId, fresh.recipientId, 'REF0000001', fresh.customerId]);
      await expectSqlState(
        pool,
        insert,
        [fresh.orderId, fresh.recipientId, 'REF0000002', fresh.customerId],
        UNIQUE_VIOLATION,
      );
    });

    it('refuses to record a payment as verified without an actor and a confirmed amount', async () => {
      const fresh = await seedOrder(pool);
      const claim = await pool.query<{ id: string }>(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01744444444', 'REF1000001', 10000, $3) returning id`,
        [fresh.orderId, fresh.recipientId, fresh.customerId],
      );
      await expectSqlState(
        pool,
        `update payment_claim set state = 'verified', resolved_at = now() where id = $1`,
        [Number(claim.rows[0]?.id)],
        CHECK_VIOLATION,
      );
    });

    it('requires an actor and a substantive reason to reject a claim', async () => {
      const fresh = await seedOrder(pool);
      const claim = await pool.query<{ id: string }>(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01755555555', 'REF1000002', 10000, $3) returning id`,
        [fresh.orderId, fresh.recipientId, fresh.customerId],
      );
      const claimId = Number(claim.rows[0]?.id);

      // No reason at all.
      await expectSqlState(
        pool,
        `update payment_claim set state = 'rejected', resolved_at = now(), resolved_by_staff_id = $2 where id = $1`,
        [claimId, fresh.staffId],
        CHECK_VIOLATION,
      );

      // A reason that is too short to be auditable.
      await expectSqlState(
        pool,
        `update payment_claim set state = 'rejected', resolved_at = now(), resolved_by_staff_id = $2, resolution_reason = 'nope' where id = $1`,
        [claimId, fresh.staffId],
        CHECK_VIOLATION,
      );

      // A substantive reason and a named actor are accepted.
      await pool.query(
        `update payment_claim set state = 'rejected', resolved_at = now(), resolved_by_staff_id = $2,
                resolution_reason = 'Receipt could not be confirmed in the merchant account'
          where id = $1`,
        [claimId, fresh.staffId],
      );
    });

    it('makes a resolved claim terminal', async () => {
      const fresh = await seedOrder(pool);
      const claim = await pool.query<{ id: string }>(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01766666666', 'REF1000003', 10000, $3) returning id`,
        [fresh.orderId, fresh.recipientId, fresh.customerId],
      );
      const claimId = Number(claim.rows[0]?.id);

      await pool.query(
        `update payment_claim set state = 'rejected', resolved_at = now(), resolved_by_staff_id = $2,
                resolution_reason = 'Receipt could not be confirmed in the merchant account'
          where id = $1`,
        [claimId, fresh.staffId],
      );

      const message = await expectSqlState(
        pool,
        `update payment_claim set state = 'verified', verified_amount_minor = 10000 where id = $1`,
        [claimId],
        CHECK_VIOLATION,
      );
      assert.match(message, /illegal payment_claim transition/);
    });

    it('requires a claim to have a human origin', async () => {
      const fresh = await seedOrder(pool);
      await expectSqlState(
        pool,
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor)
         values ($1, $2, '01777777777', 'REF1000004', 10000)`,
        [fresh.orderId, fresh.recipientId],
        CHECK_VIOLATION,
      );
    });

    it('records but does not trust a claimed amount', async () => {
      // The schema stores what the customer claimed; the order total stays authoritative elsewhere.
      const fresh = await seedOrder(pool);
      await pool.query(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01788888888', 'REF1000005', 1, $3)`,
        [fresh.orderId, fresh.recipientId, fresh.customerId],
      );
      const order = await pool.query<{ total_minor: number }>(
        'select total_minor from "order" where id = $1',
        [fresh.orderId],
      );
      assert.equal(order.rows[0]?.total_minor, 10000, 'the order total is unchanged by the claim');
    });

    it('requires an explicit acknowledgement for a verified amount mismatch', async () => {
      const fresh = await seedOrder(pool);
      const claim = await pool.query<{ id: string }>(
        `insert into payment_claim (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor, submitted_by_customer_id)
         values ($1, $2, '01799999999', 'REF1000006', 10000, $3) returning id`,
        [fresh.orderId, fresh.recipientId, fresh.customerId],
      );
      await expectSqlState(
        pool,
        'update payment_claim set mismatch_acknowledged = true where id = $1',
        [Number(claim.rows[0]?.id)],
        CHECK_VIOLATION,
      );
    });
  });

  describe('refunds', () => {
    it('refuses completion without confirmed evidence and an actor', async () => {
      const refundRow = await pool.query<{ id: string }>(
        `insert into refund (order_id, amount_minor, method, reason, requested_by_customer_id)
         values ($1, 5000, 'bkash', 'Item unavailable', $2) returning id`,
        [seeded.orderId, seeded.customerId],
      );
      const refundId = Number(refundRow.rows[0]?.id);

      await expectSqlState(
        pool,
        `update refund set state = 'completed', completed_at = now(), completed_by_staff_id = $2 where id = $1`,
        [refundId, seeded.staffId],
        CHECK_VIOLATION,
      );

      await expectSqlState(
        pool,
        `update refund set state = 'completed', completed_at = now(), completed_by_staff_id = $2, evidence_note = 'ok' where id = $1`,
        [refundId, seeded.staffId],
        CHECK_VIOLATION,
      );

      await pool.query(
        `update refund set state = 'completed', completed_at = now(), completed_by_staff_id = $2,
                evidence_note = 'bKash transfer confirmed in the merchant statement'
          where id = $1`,
        [refundId, seeded.staffId],
      );
      const row = await pool.query<{ state: string }>('select state from refund where id = $1', [refundId]);
      assert.equal(row.rows[0]?.state, 'completed');
    });

    it('has no structural path from a refund to sellable stock', async () => {
      const columns = await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'refund'`,
      );
      const names = columns.rows.map((row) => row.column_name);
      for (const forbidden of ['reservation_id', 'movement_id', 'inventory_movement_id']) {
        assert.ok(!names.includes(forbidden), `refund must not reference ${forbidden}`);
      }
    });
  });

  describe('returns', () => {
    it('refuses to restore stock before a return is received and accepted', async () => {
      const fresh = await seedOrder(pool);
      const returnRow = await pool.query<{ id: string }>(
        `insert into customer_return (order_id, order_item_id, quantity, reason)
         values ($1, $2, 1, 'refused_on_delivery') returning id`,
        [fresh.orderId, fresh.orderItemId],
      );
      const returnId = Number(returnRow.rows[0]?.id);

      const movement = await pool.query<{ id: string }>(
        `insert into inventory_movement (movement_key, variant_id, delta_on_hand, delta_reserved, reason, customer_return_id, on_hand_after, reserved_after)
         values ('restock:test', $1, 1, -1, 'return_restocked', $2, 2, 0) returning id`,
        [fresh.variantId, returnId],
      );

      await expectSqlState(
        pool,
        'update customer_return set restock_movement_id = $2 where id = $1',
        [returnId, Number(movement.rows[0]?.id)],
        CHECK_VIOLATION,
      );
    });

    it('requires an inspector and a note to reject a return', async () => {
      const fresh = await seedOrder(pool);
      const returnRow = await pool.query<{ id: string }>(
        `insert into customer_return (order_id, order_item_id, quantity, reason)
         values ($1, $2, 1, 'customer_return') returning id`,
        [fresh.orderId, fresh.orderItemId],
      );
      const returnId = Number(returnRow.rows[0]?.id);

      await expectSqlState(
        pool,
        `update customer_return set state = 'inspected_rejected', inspected_at = now(), inspected_by_staff_id = $2 where id = $1`,
        [returnId, fresh.staffId],
        CHECK_VIOLATION,
      );

      await pool.query(
        `update customer_return set state = 'inspected_rejected', inspected_at = now(),
                inspected_by_staff_id = $2, inspection_note = 'Packaging opened and product unusable'
          where id = $1`,
        [returnId, fresh.staffId],
      );
    });
  });

  describe('catalog and imagery', () => {
    it('refuses a comparison price that is not strictly greater than the price', async () => {
      const fresh = await seedOrder(pool);
      await expectSqlState(
        pool,
        `insert into product_variant (product_id, sku, price_minor, compare_at_price_minor)
         values ((select product_id from product_variant where id = $1), 'SKU-CMP-1', 1000, 1000)`,
        [fresh.variantId],
        CHECK_VIOLATION,
      );
    });

    it('refuses to mark an image cleared without a recorded basis', async () => {
      const fresh = await seedOrder(pool);
      await expectSqlState(
        pool,
        `insert into product_image (product_id, base_key, content_type, width, height, byte_size, rights_status)
         values ((select product_id from product_variant where id = $1), 'key/one', 'image/webp', 10, 10, 100, 'cleared')`,
        [fresh.variantId],
        CHECK_VIOLATION,
      );
    });

    it('permits exactly one active payment recipient per method', async () => {
      await expectSqlState(
        pool,
        `insert into payment_recipient (method, account_number, account_label, created_by_staff_id)
         values ('bkash', '01811111111', 'Second', $1)`,
        [seeded.staffId],
        UNIQUE_VIOLATION,
      );
    });
  });

  describe('append-only history', () => {
    it('refuses an update to an order event', async () => {
      await pool.query(
        `insert into order_event (order_id, event_type, actor_type) values ($1, 'order_placed', 'system')`,
        [seeded.orderId],
      );
      const message = await expectSqlState(
        pool,
        `update order_event set event_type = 'order_cancelled' where order_id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
      assert.match(message, /append-only/);
    });

    it('refuses a delete from the stock ledger', async () => {
      const message = await expectSqlState(
        pool,
        'delete from inventory_movement where movement_key = $1',
        ['release:test'],
        CHECK_VIOLATION,
      );
      assert.match(message, /append-only/);
    });

    it('refuses an update to an audit record', async () => {
      await pool.query(
        `insert into audit_event (actor_type, actor_role_codes, action, entity_type, entity_id)
         values ('system', '{}', 'test.action', 'order', $1)`,
        [seeded.orderId],
      );
      const message = await expectSqlState(
        pool,
        `update audit_event set action = 'tampered' where entity_type = 'order' and entity_id = $1`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
      assert.match(message, /append-only/);
    });

    it('has no customer actor type on the audit trail', async () => {
      await expectSqlState(
        pool,
        `insert into audit_event (actor_type, actor_role_codes, action, entity_type, entity_id)
         values ('customer', '{}', 'forged.action', 'order', $1)`,
        [seeded.orderId],
        CHECK_VIOLATION,
      );
    });
  });

  describe('authorization data', () => {
    it('refuses to grant a privileged permission to a non-owner role', async () => {
      const roleRow = await pool.query<{ id: string }>(
        `insert into role (code, name, is_owner_level) values ('support_test', 'Support', false) returning id`,
      );
      const permissionRow = await pool.query<{ id: string }>(
        `insert into permission (code, description, is_privileged) values ('payment.verify_test', 'Verify', true) returning id`,
      );
      await expectSqlState(
        pool,
        'insert into role_permission (role_id, permission_id) values ($1, $2)',
        [Number(roleRow.rows[0]?.id), Number(permissionRow.rows[0]?.id)],
        CHECK_VIOLATION,
      );
    });

    it('permits a privileged permission on an owner-level role', async () => {
      const roleRow = await pool.query<{ id: string }>(
        `insert into role (code, name, is_owner_level) values ('owner_test', 'Owner', true) returning id`,
      );
      const permissionRow = await pool.query<{ id: string }>(
        `insert into permission (code, description, is_privileged) values ('payment.verify_test2', 'Verify', true) returning id`,
      );
      await pool.query('insert into role_permission (role_id, permission_id) values ($1, $2)', [
        Number(roleRow.rows[0]?.id),
        Number(permissionRow.rows[0]?.id),
      ]);
    });

    it('permits at most one live customer flag', async () => {
      const fresh = await seedOrder(pool);
      const insert = `insert into customer_flag (customer_id, order_id, reason, raised_by_staff_id)
        values ($1, $2, 'Payment claim confirmed false by the owner', $3)`;
      await pool.query(insert, [fresh.customerId, fresh.orderId, fresh.staffId]);
      await expectSqlState(pool, insert, [fresh.customerId, fresh.orderId, fresh.staffId], UNIQUE_VIOLATION);
    });

    it('requires a substantive reason to raise a flag', async () => {
      const fresh = await seedOrder(pool);
      await expectSqlState(
        pool,
        `insert into customer_flag (customer_id, order_id, reason, raised_by_staff_id)
         values ($1, $2, 'bad', $3)`,
        [fresh.customerId, fresh.orderId, fresh.staffId],
        CHECK_VIOLATION,
      );
    });

    it('makes a customer flag reversible with an audited reason', async () => {
      const fresh = await seedOrder(pool);
      const flag = await pool.query<{ id: string }>(
        `insert into customer_flag (customer_id, order_id, reason, raised_by_staff_id)
         values ($1, $2, 'Claim confirmed false after review', $3) returning id`,
        [fresh.customerId, fresh.orderId, fresh.staffId],
      );
      const flagId = Number(flag.rows[0]?.id);

      await expectSqlState(
        pool,
        `update customer_flag set state = 'cleared', cleared_at = now(), cleared_by_staff_id = $2 where id = $1`,
        [flagId, fresh.staffId],
        CHECK_VIOLATION,
      );

      await pool.query(
        `update customer_flag set state = 'cleared', cleared_at = now(), cleared_by_staff_id = $2,
                clear_reason = 'Reviewed and resolved in the customer''s favour'
          where id = $1`,
        [flagId, fresh.staffId],
      );
    });
  });
});
