import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { addOrderLine } from '../../src/server/orders/amend';
import { ConflictError, ValidationError } from '../../src/server/authz/authorize';

/** ADR 0046: one guarded append to an order before dispatch, never an edit of an older line. */
const OWNER = {
  staffUserId: 0,
  permissions: new Set(['order.read', 'order.amend']),
  roleCodes: ['owner'],
};

describe('order line additions (ADR 0046)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
  });

  after(async () => {
    await fixture.close();
  });

  async function seedAmendableOrder() {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    const product = await fixture.pool.query<{ product_id: string }>(
      `select product_id from product_variant where id = $1`,
      [seeded.variantId],
    );
    const productId = Number(product.rows[0]?.product_id);
    await fixture.pool.query(`update product set availability = 'in_stock' where id = $1`, [productId]);
    return { ...seeded, productId };
  }

  it('appends a frozen line and moves both money columns by the same amount, once', async () => {
    const seeded = await seedAmendableOrder();
    const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const result = await withTransaction((tx) =>
      addOrderLine(tx, OWNER, {
        orderId: seeded.orderId,
        productId: seeded.productId,
        variantId: seeded.variantId,
        quantity: 2,
        reason: 'the customer called and asked for two more',
        idempotencyKey: key,
      }),
    );
    assert.equal(result.lineTotalMinor, 20000, 'the price comes from the variant, not the form');
    assert.equal(result.subtotalMinor, 30000);
    assert.equal(result.totalMinor, 30000);
    assert.equal(result.replay, false);

    const replay = await withTransaction((tx) =>
      addOrderLine(tx, OWNER, {
        orderId: seeded.orderId,
        productId: seeded.productId,
        variantId: seeded.variantId,
        quantity: 2,
        reason: 'the customer called and asked for two more',
        idempotencyKey: key,
      }),
    );
    assert.equal(replay.replay, true, 'the same request is recorded once');

    const lines = await fixture.pool.query<{ count: string }>(
      `select count(*)::text as count from order_item where order_id = $1`,
      [seeded.orderId],
    );
    assert.equal(Number(lines.rows[0]?.count), 2, 'one original line and one added line');

    const events = await fixture.pool.query<{ count: string }>(
      `select count(*)::text as count from order_event where order_id = $1 and event_type = 'order_line_added'`,
      [seeded.orderId],
    );
    assert.equal(Number(events.rows[0]?.count), 1);

    const audit = await fixture.pool.query<{ count: string }>(
      `select count(*)::text as count from audit_event where entity_type = 'order' and entity_id = $1 and action = 'order.line_added'`,
      [seeded.orderId],
    );
    assert.equal(Number(audit.rows[0]?.count), 1);
  });

  it('refuses an out-of-stock product and a completed order without writing anything', async () => {
    const seeded = await seedAmendableOrder();
    await fixture.pool.query(`update product set availability = 'out_of_stock' where id = $1`, [seeded.productId]);

    await assert.rejects(
      withTransaction((tx) =>
        addOrderLine(tx, OWNER, {
          orderId: seeded.orderId,
          productId: seeded.productId,
          variantId: seeded.variantId,
          quantity: 1,
          reason: 'the customer asked for one more',
          idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        }),
      ),
      ValidationError,
    );

    await fixture.pool.query(`update product set availability = 'in_stock' where id = $1`, [seeded.productId]);
    await fixture.pool.query(
      `update "order" set status = 'completed', cod_state = 'cod_collected' where id = $1`,
      [seeded.orderId],
    );
    await assert.rejects(
      withTransaction((tx) =>
        addOrderLine(tx, OWNER, {
          orderId: seeded.orderId,
          productId: seeded.productId,
          variantId: seeded.variantId,
          quantity: 1,
          reason: 'the customer asked for one more',
          idempotencyKey: 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
        }),
      ),
      ConflictError,
    );
  });

  it('a generic update still refuses to change the charged amount, even with the flag set on a different change', async () => {
    const seeded = await seedAmendableOrder();
    await assert.rejects(
      fixture.pool.query(`update "order" set total_minor = total_minor + 100 where id = $1`, [seeded.orderId]),
      /immutable except through a guarded line addition/,
    );
  });
});
