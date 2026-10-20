import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { decideCod } from '../../src/server/orders/manage';
import {
  dispatchOrder,
  markPaymentReceived,
  recordDelivered,
} from '../../src/server/orders/fulfilment';
import {
  listAdditionalCosts,
  orderMoney,
  parseCostAmount,
  recordAdditionalCost,
  voidAdditionalCost,
} from '../../src/server/orders/costs';
import { AuthorizationError, ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { adminOrderDetail } from '../../src/server/orders/admin-order';
import { revenueSummary } from '../../src/server/orders/admin-read';

/**
 * Additional courier costs and the money figures derived from them (Phase 22).
 *
 * Every test asserts a stored fact: the cost rows, the order's unchanged charged amounts, the audit
 * trail, and the sums the dashboard would show. The three properties that must never break are
 * re-asserted throughout:
 *
 * 1. **A cost never reaches the customer.** `order.total_minor` is compared before and after.
 * 2. **A voided cost stops counting but keeps its row.** The history is never rewritten.
 * 3. **The standard delivery fee is subtracted exactly once** - it is inside the customer payment, so
 *    netting it is not a second deduction.
 */

const OWNER = {
  staffUserId: 0,
  permissions: new Set([
    'order.read',
    'order.dispatch',
    'order.cancel',
    'cod.approve',
    'cod.confirm_collection',
    'return.inspect',
    'order.cost_record',
    'audit.read',
  ]),
  roleCodes: ['owner'],
};

/** Confirms payment but holds no cost permission: recording a cost is a separate ability. */
const RECEIPT_ONLY = {
  staffUserId: 0,
  permissions: new Set(['order.read', 'cod.confirm_collection']),
  roleCodes: ['owner'],
};

const NOBODY = { staffUserId: 0, permissions: new Set<string>(), roleCodes: ['owner'] };

let fixture: DbFixture;

type OrderStateRow = {
  status: string;
  cod_state: string;
  items_subtotal_minor: number;
  shipping_minor: number;
  total_minor: number;
};

async function seedCod(options: { quantity?: number; shippingMinor?: number; districtCode?: string | null } = {}) {
  return seedOrder(fixture.pool, {
    paymentMethod: 'cod',
    quantity: options.quantity ?? 1,
    shippingMinor: options.shippingMinor ?? 0,
    districtCode: options.districtCode === undefined ? 'dhaka' : options.districtCode,
    withReservation: false,
  });
}

async function approve(orderId: number): Promise<void> {
  await withTransaction((tx) =>
    decideCod(tx, OWNER, { orderId, decision: 'approve', reason: 'Called the customer and confirmed' }),
  );
}

/** An order that has been dispatched and delivered: the only state payment receipt accepts. */
async function delivered(options: { quantity?: number; shippingMinor?: number; districtCode?: string | null } = {}) {
  const seeded = await seedCod(options);
  await approve(seeded.orderId);
  await withTransaction((tx) => dispatchOrder(tx, OWNER, { orderId: seeded.orderId }));
  await withTransaction((tx) => recordDelivered(tx, OWNER, { orderId: seeded.orderId }));
  return seeded;
}

async function state(orderId: number): Promise<OrderStateRow> {
  const rows = await fixture.pool.query<OrderStateRow>(
    'select status, cod_state, items_subtotal_minor, shipping_minor, total_minor from "order" where id = $1',
    [orderId],
  );
  return rows.rows[0]!;
}

async function costRows(orderId: number) {
  const rows = await fixture.pool.query<{
    id: number;
    amount_minor: number;
    description: string;
    voided_at: Date | null;
    void_reason: string | null;
    recorded_by_staff_id: string;
  }>(
    'select id, amount_minor, description, voided_at, void_reason, recorded_by_staff_id from order_additional_cost where order_id = $1 order by id',
    [orderId],
  );
  return rows.rows;
}

async function auditCount(orderId: number, action: string): Promise<number> {
  const rows = await fixture.pool.query<{ total: string }>(
    'select count(*)::text as total from audit_event where entity_type = \'order\' and entity_id = $1 and action = $2',
    [orderId, action],
  );
  return Number(rows.rows[0]?.total ?? '0');
}

describe('additional courier costs and net proceeds', { skip: !toolingAvailable && SKIP_REASON }, () => {
  before(async () => {
    fixture = await startMigratedDatabase();
    // Every service writes its audit and event rows against a real staff id, so the actor must exist.
    const seed = await seedOrder(fixture.pool);
    OWNER.staffUserId = seed.staffId;
    RECEIPT_ONLY.staffUserId = seed.staffId;
    NOBODY.staffUserId = seed.staffId;
  });

  after(async () => {
    await fixture.close();
  });

  it('parses only a positive BDT amount and refuses a bare number, zero and junk', () => {
    assert.equal(parseCostAmount('60'), 6000);
    assert.equal(parseCostAmount('60.50'), 6050);
    assert.equal(parseCostAmount(' 12 '), 1200);

    // A number has no unit, so guessing wrong would be a 100x money error.
    assert.equal(parseCostAmount(60), null);
    assert.equal(parseCostAmount('0'), null);
    assert.equal(parseCostAmount('-5'), null);
    assert.equal(parseCostAmount('1,000'), null);
    assert.equal(parseCostAmount('1e3'), null);
    assert.equal(parseCostAmount('৳60'), null);
    assert.equal(parseCostAmount(''), null);
    assert.equal(parseCostAmount(undefined), null);
  });

  it('records payment received with no additional costs, and the cost total stays zero', async () => {
    const seeded = await delivered({ shippingMinor: 8000 });
    const before = await state(seeded.orderId);

    await withTransaction((tx) => markPaymentReceived(tx, OWNER, { orderId: seeded.orderId }));

    const after_ = await state(seeded.orderId);
    assert.equal(after_.cod_state, 'cod_collected');
    assert.equal(after_.status, 'completed');
    assert.equal((await costRows(seeded.orderId)).length, 0);
    // The customer was charged exactly what was placed.
    assert.equal(after_.total_minor, before.total_minor);
    assert.equal(after_.shipping_minor, before.shipping_minor);

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.notEqual(detail, null);
    assert.equal(detail?.money.additionalCostsMinor, 0);
    assert.equal(detail?.money.activeCostCount, 0);
    assert.equal(detail?.money.customerPaymentMinor, after_.total_minor);
    assert.equal(detail?.money.standardDeliveryFeeMinor, after_.shipping_minor);
  });

  it('records one and several costs atomically with the receipt, never charging the customer', async () => {
    const seeded = await delivered({ quantity: 2, shippingMinor: 8000 });
    const before = await state(seeded.orderId);

    await withTransaction((tx) =>
      markPaymentReceived(tx, OWNER, {
        orderId: seeded.orderId,
        note: 'Verified in the courier dashboard',
        costs: [
          { amount: '60', description: 'Extra weight charge from the courier' },
          { amount: '25.50', description: 'Repackaging after the box was damaged' },
        ],
      }),
    );

    const after_ = await state(seeded.orderId);
    assert.equal(after_.status, 'completed');
    assert.equal(after_.cod_state, 'cod_collected');
    // The three guarantees at once: costs exist, the order total did not move, and the rows are owned.
    assert.equal(after_.total_minor, before.total_minor);
    assert.equal(after_.items_subtotal_minor, before.items_subtotal_minor);
    assert.equal(after_.shipping_minor, before.shipping_minor);

    const rows = await costRows(seeded.orderId);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.amount_minor), [6000, 2550]);
    assert.equal(rows[0]?.description, 'Extra weight charge from the courier');
    assert.equal(rows[0]?.voided_at, null);
    assert.equal(await auditCount(seeded.orderId, 'order.cost_recorded'), 2);
  });

  it('refuses the whole action when any cost is invalid, leaving the order untouched', async () => {
    const seeded = await delivered({ shippingMinor: 8000 });
    const before = await state(seeded.orderId);

    for (const bad of [
      { amount: '60', description: 'ok' },
      { amount: '0', description: 'Zero is not a cost' },
      { amount: 'abc', description: 'Not a number' },
      { amount: '-5', description: 'Negative' },
      { amount: '', description: 'No amount' },
    ]) {
      await assert.rejects(
        withTransaction((tx) =>
          markPaymentReceived(tx, OWNER, { orderId: seeded.orderId, costs: [bad] }),
        ),
        ValidationError,
        `expected ${JSON.stringify(bad)} to be refused`,
      );
    }

    // Nothing was recorded: not the receipt, not the completion, not a partial cost.
    const after_ = await state(seeded.orderId);
    assert.equal(after_.status, before.status);
    assert.equal(after_.cod_state, before.cod_state);
    assert.equal((await costRows(seeded.orderId)).length, 0);
  });

  it('does not save costs when the receipt itself is refused', async () => {
    // Approved but never dispatched: there is nothing to receive, so the submitted costs must not
    // survive the refused action.
    const seeded = await seedCod({ shippingMinor: 8000 });
    await approve(seeded.orderId);

    await assert.rejects(
      withTransaction((tx) =>
        markPaymentReceived(tx, OWNER, {
          orderId: seeded.orderId,
          costs: [{ amount: '60', description: 'Should not be saved' }],
        }),
      ),
      ConflictError,
    );

    assert.equal((await costRows(seeded.orderId)).length, 0);
    assert.equal((await state(seeded.orderId)).status, 'confirmed');

    // The same costs on a duplicate completion attempt after the order is already complete: refused,
    // and no second copy of the row is written.
    const done = await delivered({ shippingMinor: 8000 });
    await withTransaction((tx) =>
      markPaymentReceived(tx, OWNER, {
        orderId: done.orderId,
        costs: [{ amount: '60', description: 'First and only cost' }],
      }),
    );
    await assert.rejects(
      withTransaction((tx) =>
        markPaymentReceived(tx, OWNER, {
          orderId: done.orderId,
          costs: [{ amount: '90', description: 'Second attempt' }],
        }),
      ),
      ConflictError,
    );
    assert.equal((await costRows(done.orderId)).length, 1);
    assert.equal((await costRows(done.orderId))[0]?.description, 'First and only cost');
  });

  it('refuses a cost to a principal without the cost permission, even if it may confirm payment', async () => {
    const seeded = await delivered({ shippingMinor: 8000 });

    await assert.rejects(
      withTransaction((tx) =>
        markPaymentReceived(tx, RECEIPT_ONLY, {
          orderId: seeded.orderId,
          costs: [{ amount: '60', description: 'Extra charge' }],
        }),
      ),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) =>
        recordAdditionalCost(tx, NOBODY, { orderId: seeded.orderId, amount: '60', description: 'Extra charge' }),
      ),
      AuthorizationError,
    );
    assert.equal((await costRows(seeded.orderId)).length, 0);
    // Refusals are recorded durably, in their own transaction.
    const denied = await fixture.pool.query<{ total: string }>(
      "select count(*)::text as total from audit_event where action = 'admin.action_denied' and entity_id = $1",
      [seeded.orderId],
    );
    assert.ok(Number(denied.rows[0]?.total) >= 2);
  });

  it('voids a cost with a reason, keeps the row, and removes it from the active total', async () => {
    const seeded = await delivered({ shippingMinor: 8000 });
    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: seeded.orderId, amount: '60', description: 'Extra weight' }),
    );
    const [cost] = await costRows(seeded.orderId);
    assert.ok(cost);

    await assert.rejects(
      withTransaction((tx) => voidAdditionalCost(tx, NOBODY, { costId: cost.id, reason: 'wrong entry' })),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) => voidAdditionalCost(tx, OWNER, { costId: cost.id, reason: '' })),
      ValidationError,
    );

    await withTransaction((tx) =>
      voidAdditionalCost(tx, OWNER, { costId: cost.id, reason: 'Entered twice by mistake' }),
    );

    const rows = await costRows(seeded.orderId);
    assert.equal(rows.length, 1, 'the row is kept, never deleted');
    assert.notEqual(rows[0]?.voided_at, null);
    assert.equal(rows[0]?.void_reason, 'Entered twice by mistake');
    assert.equal(rows[0]?.amount_minor, 6000, 'the recorded amount is not rewritten');
    assert.equal(await auditCount(seeded.orderId, 'order.cost_voided'), 1);

    // Voiding twice is a conflict, not a second effect.
    await assert.rejects(
      withTransaction((tx) => voidAdditionalCost(tx, OWNER, { costId: cost.id, reason: 'Again' })),
      ConflictError,
    );

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.equal(detail?.costs.length, 1);
    assert.equal(detail?.money.additionalCostsMinor, 0);
    assert.equal(detail?.money.activeCostCount, 0);
  });

  it('freezes what a cost was: the amount and description cannot be edited', async () => {
    const seeded = await delivered({ shippingMinor: 8000 });
    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: seeded.orderId, amount: '60', description: 'Extra weight' }),
    );
    const [cost] = await costRows(seeded.orderId);

    await assert.rejects(
      fixture.pool.query('update order_additional_cost set amount_minor = 1 where id = $1', [cost!.id]),
      /immutable/,
    );
    await assert.rejects(
      fixture.pool.query("update order_additional_cost set description = 'something else' where id = $1", [cost!.id]),
      /immutable/,
    );
    await assert.rejects(fixture.pool.query('delete from order_additional_cost where id = $1', [cost!.id]), /append|forbid|not allowed|permission/i);

    assert.equal((await costRows(seeded.orderId))[0]?.amount_minor, 6000);
  });

  it('counts each completed order and each active cost once, and subtracts the fee once', async () => {
    const before = await withTransaction((tx) => revenueSummary(tx));

    const seeded = await delivered({ quantity: 1, shippingMinor: 8000 });
    const placed = await state(seeded.orderId);
    await withTransaction((tx) =>
      markPaymentReceived(tx, OWNER, {
        orderId: seeded.orderId,
        costs: [{ amount: '60', description: 'Extra weight charge' }],
      }),
    );

    const after_ = await withTransaction((tx) => revenueSummary(tx));
    const payment = after_.customerPaymentMinor - before.customerPaymentMinor;
    const fee = after_.standardDeliveryFeeMinor - before.standardDeliveryFeeMinor;
    const costs = after_.additionalCostsMinor - before.additionalCostsMinor;

    // Gross is the order's own total: goods + the delivery fee the customer paid.
    assert.equal(payment, placed.total_minor);
    assert.equal(fee, 8000);
    assert.equal(costs, 6000);
    assert.equal(after_.orderCount, before.orderCount + 1);

    // Net subtracts the fee once (it was inside the payment) and then the cost.
    const netDelta =
      (after_.estimatedNetProceedsMinor ?? 0) - (before.estimatedNetProceedsMinor ?? 0);
    assert.equal(netDelta, payment - fee - costs);
    // Which is exactly the goods subtotal minus the extra cost - the fee is not taken twice.
    assert.equal(netDelta, placed.items_subtotal_minor - 6000);
  });

  it('excludes voided costs from the dashboard, and never counts the fee twice', async () => {
    const before = await withTransaction((tx) => revenueSummary(tx));

    const seeded = await delivered({ shippingMinor: 8000 });
    const placed = await state(seeded.orderId);
    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: seeded.orderId, amount: '60', description: 'Extra weight' }),
    );
    const [cost] = await costRows(seeded.orderId);
    await withTransaction((tx) =>
      markPaymentReceived(tx, OWNER, { orderId: seeded.orderId }),
    );

    const withCost = await withTransaction((tx) => revenueSummary(tx));
    await withTransaction((tx) =>
      voidAdditionalCost(tx, OWNER, { costId: cost!.id, reason: 'Courier refunded the extra' }),
    );
    const withoutCost = await withTransaction((tx) => revenueSummary(tx));

    assert.equal(withCost.additionalCostsMinor - before.additionalCostsMinor, 6000);
    assert.equal(withoutCost.additionalCostsMinor, before.additionalCostsMinor);
    // The void restores exactly the amount it removed - nothing else moves.
    assert.equal(
      (withoutCost.estimatedNetProceedsMinor ?? 0) - (withCost.estimatedNetProceedsMinor ?? 0),
      6000,
    );
    // Gross is untouched by a cost or its void: the customer paid what they paid.
    assert.equal(withoutCost.customerPaymentMinor, withCost.customerPaymentMinor);
    assert.equal(withoutCost.customerPaymentMinor - before.customerPaymentMinor, placed.total_minor);
  });

  it('leaves the net figure unavailable when an order cannot separate its delivery fee', async () => {
    const before = await withTransaction((tx) => revenueSummary(tx));

    // An order from before the three-area model: delivery 0, no district snapshot.
    const seeded = await delivered({ shippingMinor: 0, districtCode: null });
    await withTransaction((tx) => markPaymentReceived(tx, OWNER, { orderId: seeded.orderId }));

    const after_ = await withTransaction((tx) => revenueSummary(tx));
    assert.equal(after_.unsubstantiatedOrderCount, before.unsubstantiatedOrderCount + 1);
    // Its gross payment still counts - the customer did pay - but no net figure is invented.
    assert.equal(after_.customerPaymentMinor, before.customerPaymentMinor + (await state(seeded.orderId)).total_minor);

    const detail = await withTransaction((tx) => adminOrderDetail(tx, seeded.orderNumber));
    assert.equal(detail?.money.estimatedNetProceedsMinor, null);
    assert.equal(detail?.money.customerPaymentMinor, (await state(seeded.orderId)).total_minor);
  });

  it('computes the four amounts from the order and cost rows, never from a counter', () => {
    const money = orderMoney({
      itemsSubtotalMinor: 22000,
      shippingMinor: 8000,
      additionalCostsMinor: 6000,
      activeCostCount: 1,
      deliveryFeeSubstantiated: true,
    });
    assert.equal(money.customerPaymentMinor, 30000);
    assert.equal(money.standardDeliveryFeeMinor, 8000);
    assert.equal(money.additionalCostsMinor, 6000);
    // 30000 - 8000 - 6000, not 30000 - 8000 - 8000 - 6000.
    assert.equal(money.estimatedNetProceedsMinor, 16000);

    const unsubstantiated = orderMoney({
      itemsSubtotalMinor: 22000,
      shippingMinor: 0,
      additionalCostsMinor: 0,
      activeCostCount: 0,
      deliveryFeeSubstantiated: false,
    });
    assert.equal(unsubstantiated.estimatedNetProceedsMinor, null);
  });

  it('lists costs newest first, voided ones included, and counts them per order only', async () => {
    const first = await delivered({ shippingMinor: 8000 });
    const second = await delivered({ shippingMinor: 8000 });

    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: first.orderId, amount: '10', description: 'Tape and bubble wrap' }),
    );
    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: first.orderId, amount: '20', description: 'Second extra charge' }),
    );
    await withTransaction((tx) =>
      recordAdditionalCost(tx, OWNER, { orderId: second.orderId, amount: '30', description: 'Other order only' }),
    );

    const listed = await withTransaction((tx) => listAdditionalCosts(tx, first.orderId));
    assert.equal(listed.length, 2);
    assert.deepEqual(listed.map((cost) => cost.description), ['Second extra charge', 'Tape and bubble wrap']);

    const secondList = await withTransaction((tx) => listAdditionalCosts(tx, second.orderId));
    assert.equal(secondList.length, 1);
  });
});
