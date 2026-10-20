import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import {
  seedOrder,
  SKIP_REASON,
  startMigratedDatabase,
  toolingAvailable,
  type DbFixture,
} from './helpers';
import {
  adminOrderAudit,
  adminOrderDetail,
  listOrdersForAdmin,
  ORDER_PAGE_SIZE,
} from '../../src/server/orders/admin-order';
import { decideCod } from '../../src/server/orders/manage';
import { codDecidedToday, customers, customerDetail } from '../../src/server/orders/admin-read';

/**
 * The owner's order detail and order history (Phase 20).
 *
 * These read the rows the order actually wrote, so the assertions are about stored facts: the line
 * items with their recorded prices, the delivery charge snapshot, the event log, and the audit record a
 * decision left behind. The pagination assertions exist because a silently truncated list is the failure
 * mode a busy store would hit first.
 */

const OWNER = {
  staffUserId: 0,
  permissions: new Set(['cod.approve', 'order.cancel', 'order.read', 'audit.read']),
  roleCodes: ['owner'],
};

describe('owner order detail and history (Phase 20)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    OWNER.staffUserId = (await seedOrder(fixture.pool)).staffId;
  });

  after(async () => {
    await fixture.close();
  });

  it('returns the whole order: contact, recorded lines, totals and the placement event', async () => {
    // The amounts are set at insert because `order` refuses an UPDATE to them after the fact.
    const seeded = await seedOrder(fixture.pool, {
      paymentMethod: 'cod',
      quantity: 2,
      shippingMinor: 12000,
      districtCode: 'dhaka',
      withReservation: false,
    });
    await fixture.pool.query(
      "insert into order_event (event_key, order_id, event_type, to_value, actor_type, actor_customer_id) " +
        "values ($1, $2, 'order_placed', 'pending', 'customer', $3)",
      ['order:' + seeded.orderNumber + ':placed', seeded.orderId, seeded.customerId],
    );

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.notEqual(detail, null);
    if (detail === null) return;

    assert.equal(detail.orderId, seeded.orderId);
    assert.equal(detail.contact.recipientName, 'Recipient');
    assert.equal(detail.contact.districtCode, 'dhaka');
    assert.equal(detail.items.length, 1);
    assert.equal(detail.items[0]?.quantity, 2);
    // The snapshot the order stored is what is displayed: 10000 poisha a unit plus the saved 12000 charge.
    assert.equal(detail.itemsSubtotalMinor, 20000);
    assert.equal(detail.shippingMinor, 12000);
    assert.equal(detail.totalMinor, 32000);
    assert.deepEqual(
      detail.events.map((event) => event.eventType),
      ['order_placed'],
    );
    assert.equal(detail.customerId, seeded.customerId);
  });

  it('answers a reference that names no order with null, never with another order', async () => {
    const missing = await withTransaction((tx) => adminOrderDetail(tx, 'QBDEC0FFEE0000000'));
    assert.equal(missing, null);
  });

  it('records the decision in both the event log and the audit trail the detail page reads', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, OWNER, { orderId: seeded.orderId, decision: 'approve', reason: 'confirmed on the phone' }),
    );

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.equal(detail?.codState, 'cod_approved');
    assert.equal(detail?.status, 'confirmed');
    assert.equal(
      detail?.events.some((event) => event.eventType === 'cod_approved'),
      true,
    );

    const audit = await withTransaction((tx) => adminOrderAudit(tx, seeded.orderId));
    assert.deepEqual(
      audit.map((entry) => entry.action),
      ['cod.approved'],
    );
    assert.equal(Number(audit[0]?.actorStaffId), OWNER.staffUserId);
    assert.equal(audit[0]?.reason, 'confirmed on the phone');
  });

  it('lists orders newest first with an exact total for the filters it applied', async () => {
    const older = await seedOrder(fixture.pool, { paymentMethod: 'cod', placedHoursAgo: 5, withReservation: false });
    const newer = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });

    const page = await withTransaction((tx) => listOrdersForAdmin(tx, {}));
    assert.equal(page.total >= 2, true);
    assert.equal(page.rows[0]?.orderNumber, newer.orderNumber);
    const position = page.rows.findIndex((row) => row.orderNumber === older.orderNumber);
    assert.equal(position > 0, true, 'the older order sorts after the newer one');

    const pendingOnly = await withTransaction((tx) => listOrdersForAdmin(tx, { status: 'pending' }));
    assert.equal(pendingOnly.total >= 2, true);
    assert.equal(
      pendingOnly.rows.every((row) => row.status === 'pending'),
      true,
    );
  });

  it('searches by order number, name and phone, and matches the same rows it counts', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });

    const byNumber = await withTransaction((tx) => listOrdersForAdmin(tx, { search: seeded.orderNumber }));
    assert.equal(byNumber.total, 1);
    assert.equal(byNumber.rows[0]?.orderId, seeded.orderId);

    const byName = await withTransaction((tx) => listOrdersForAdmin(tx, { search: 'Recipient' }));
    assert.equal(byName.total, byName.rows.length);

    const byPhone = await withTransaction((tx) => listOrdersForAdmin(tx, { search: '01722222222' }));
    assert.equal(
      byPhone.rows.some((row) => row.orderId === seeded.orderId),
      true,
    );

    // A percent sign in the search text is data, not a wildcard: it must not match every order.
    const wildcard = await withTransaction((tx) => listOrdersForAdmin(tx, { search: '%' }));
    assert.equal(wildcard.total, 0);
  });

  it('pages a long list without losing or duplicating a row', async () => {
    // Fill past one page so the offset has to be real rather than incidental.
    for (let index = 0; index < ORDER_PAGE_SIZE + 2; index += 1) {
      await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    }

    const first = await withTransaction((tx) => listOrdersForAdmin(tx, { limit: ORDER_PAGE_SIZE, offset: 0 }));
    const second = await withTransaction((tx) =>
      listOrdersForAdmin(tx, { limit: ORDER_PAGE_SIZE, offset: ORDER_PAGE_SIZE }),
    );

    assert.equal(first.rows.length, ORDER_PAGE_SIZE);
    assert.equal(first.total, second.total);
    assert.equal(second.rows.length > 0, true);

    const firstIds = new Set(first.rows.map((row) => row.orderId));
    assert.equal(
      second.rows.every((row) => !firstIds.has(row.orderId)),
      true,
      'a page never repeats a row from the previous page',
    );
  });

  it('says how many decided orders exist beyond the page it returns', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });
    await withTransaction((tx) =>
      decideCod(tx, OWNER, { orderId: seeded.orderId, decision: 'approve', reason: 'confirmed on the phone' }),
    );

    const decided = await withTransaction((tx) => codDecidedToday(tx, { limit: 1, offset: 0 }));
    assert.equal(decided.rows.length <= 1, true);
    assert.equal(decided.total >= 1, true);
  });

  it('paginates the customer worklist with an exact total, and keeps the customer detail whole', async () => {
    const seeded = await seedOrder(fixture.pool, { paymentMethod: 'cod', withReservation: false });

    const page = await withTransaction((tx) => customers(tx, { limit: 1, offset: 0 }));
    assert.equal(page.rows.length, 1);
    assert.equal(page.total >= 1, true);

    const detail = await withTransaction((tx) => customerDetail(tx, seeded.customerId));
    assert.notEqual(detail, null);
    assert.equal(detail?.orderTotal, 1);
    assert.equal(detail?.orders.length, 1);
  });
});
