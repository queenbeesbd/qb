import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { claimGuestOrder } from '../../src/server/orders/claim';
import { getGuestOrderDetail } from '../../src/server/orders/read';
import { isRepeatCustomer } from '../../src/server/delivery/service';
import { SKIP_REASON, seedOrder, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Claiming a guest order into an account (ADR 0032), against real PostgreSQL.
 *
 * The properties under test are the ones that make the feature safe rather than the ones that make it
 * convenient: the link happens once, cannot be moved or cleared afterwards, is recorded as the
 * customer's own event, and changes nothing about what was charged. The repeat-customer consequence is
 * asserted too, because it is a money rule: a claimed *completed* order is what makes the next delivery
 * quote treat this account as returning.
 */

let fixture: DbFixture;

/** A customer row, without going through registration (this suite is about the link, not the sign-up). */
async function createCustomer(email: string): Promise<number> {
  const rows = await fixture.pool.query<{ id: string }>(
    `insert into customer (email, display_name) values ($1, 'Claim Customer') returning id`,
    [email],
  );
  return Number(rows.rows[0]?.id);
}

async function orderRow(orderId: number): Promise<{
  customerId: string | null;
  totalMinor: number;
  itemsSubtotalMinor: number;
  shippingMinor: number;
  status: string;
}> {
  const rows = await fixture.pool.query<{
    customer_id: string | null;
    total_minor: number;
    items_subtotal_minor: number;
    shipping_minor: number;
    status: string;
  }>(`select customer_id, total_minor, items_subtotal_minor, shipping_minor, status from "order" where id = $1`, [
    orderId,
  ]);
  const row = rows.rows[0];
  if (row === undefined) throw new Error('order row missing');
  return {
    customerId: row.customer_id,
    totalMinor: Number(row.total_minor),
    itemsSubtotalMinor: Number(row.items_subtotal_minor),
    shippingMinor: Number(row.shipping_minor),
    status: row.status,
  };
}

async function claimEventCount(orderId: number): Promise<number> {
  const rows = await fixture.pool.query<{ total: string }>(
    `select count(*)::text as total from order_event where order_id = $1 and event_type = 'order_claimed'`,
    [orderId],
  );
  return Number(rows.rows[0]?.total ?? 0);
}

describe('claiming a guest order into an account', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  before(async () => {
    fixture = await startMigratedDatabase();
  });

  after(async () => {
    await fixture.close();
  });

  it('links a guest order to the customer once, and writes the customer event', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const customerId = await createCustomer('claim-once@example.test');
    const before = await orderRow(seeded.orderId);
    assert.equal(before.customerId, null);

    const result = await withTransaction((tx) => claimGuestOrder(tx, { customerId, orderNumber: seeded.orderNumber }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.changed, true);

    const claimed = await orderRow(seeded.orderId);
    assert.equal(Number(claimed.customerId), customerId);
    // The claim is about the owner, never the money.
    assert.equal(claimed.totalMinor, before.totalMinor);
    assert.equal(claimed.itemsSubtotalMinor, before.itemsSubtotalMinor);
    assert.equal(claimed.shippingMinor, before.shippingMinor);
    assert.equal(claimed.status, before.status);
    assert.equal(await claimEventCount(seeded.orderId), 1);

    const event = await fixture.pool.query<{ actor_type: string; actor_customer_id: string | null }>(
      `select actor_type, actor_customer_id from order_event where order_id = $1 and event_type = 'order_claimed'`,
      [seeded.orderId],
    );
    assert.equal(event.rows[0]?.actor_type, 'customer');
    assert.equal(Number(event.rows[0]?.actor_customer_id), customerId);
  });

  it('answers an already-owned order without changing anything or writing a second event', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const customerId = await createCustomer('claim-idempotent@example.test');

    const first = await withTransaction((tx) => claimGuestOrder(tx, { customerId, orderNumber: seeded.orderNumber }));
    const second = await withTransaction((tx) => claimGuestOrder(tx, { customerId, orderNumber: seeded.orderNumber }));
    assert.equal(first.ok && first.changed, true);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.changed, false);
    assert.equal(await claimEventCount(seeded.orderId), 1);
  });

  it('refuses a second account, and refuses an unknown or malformed number', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const first = await createCustomer('claim-first@example.test');
    const second = await createCustomer('claim-second@example.test');

    await withTransaction((tx) => claimGuestOrder(tx, { customerId: first, orderNumber: seeded.orderNumber }));

    const rejected = await withTransaction((tx) =>
      claimGuestOrder(tx, { customerId: second, orderNumber: seeded.orderNumber }),
    );
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.failure, 'already_claimed');

    // The row still points at the first customer.
    assert.equal(Number((await orderRow(seeded.orderId)).customerId), first);

    const unknown = await withTransaction((tx) => claimGuestOrder(tx, { customerId: second, orderNumber: 'QBDOESNOTEXIST' }));
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.failure, 'not_found');

    // A value that is not an order reference never reaches the query.
    const malformed = await withTransaction((tx) => claimGuestOrder(tx, { customerId: second, orderNumber: "' or 1=1" }));
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.failure, 'not_found');
  });

  it('the database refuses to move or clear an owner afterwards', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const first = await createCustomer('claim-locked-first@example.test');
    const second = await createCustomer('claim-locked-second@example.test');

    await withTransaction((tx) => claimGuestOrder(tx, { customerId: first, orderNumber: seeded.orderNumber }));

    await assert.rejects(
      fixture.pool.query(`update "order" set customer_id = $1 where id = $2`, [second, seeded.orderId]),
      // 23514 is the check-violation SQLSTATE the guard raises.
      (error: { code?: string }) => error.code === '23514',
    );
    await assert.rejects(
      fixture.pool.query(`update "order" set customer_id = null where id = $1`, [seeded.orderId]),
      (error: { code?: string }) => error.code === '23514',
    );

    assert.equal(Number((await orderRow(seeded.orderId)).customerId), first);
  });

  it('a claimed completed order makes the account a returning customer for the next delivery quote', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const customerId = await createCustomer('claim-repeat@example.test');

    await fixture.pool.query(`update "order" set status = 'completed' where id = $1`, [seeded.orderId]);

    // A guest order is not a repeat fact for anyone.
    assert.equal(await withTransaction((tx) => isRepeatCustomer(tx, customerId)), false);
    assert.equal(await withTransaction((tx) => isRepeatCustomer(tx, null)), false);

    await withTransaction((tx) => claimGuestOrder(tx, { customerId, orderNumber: seeded.orderNumber }));

    assert.equal(await withTransaction((tx) => isRepeatCustomer(tx, customerId)), true);
  });

  it('a claimed order is no longer readable by number alone', async () => {
    const seeded = await seedOrder(fixture.pool, { guest: true });
    const customerId = await createCustomer('claim-read@example.test');

    assert.notEqual(await withTransaction((tx) => getGuestOrderDetail(tx, seeded.orderNumber)), null);

    await withTransaction((tx) => claimGuestOrder(tx, { customerId, orderNumber: seeded.orderNumber }));

    assert.equal(await withTransaction((tx) => getGuestOrderDetail(tx, seeded.orderNumber)), null);
  });
});
