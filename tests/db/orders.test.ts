import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { OrderRefusalError, createOrder } from '../../src/server/orders/create';
import { getCustomerOrderDetail, listCustomerOrders } from '../../src/server/orders/read';
import { ORDER_LIMITS, type ContactInput, type PaymentMethodInput } from '../../src/server/orders/validation';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Order creation against real PostgreSQL (Phase 15, ADR 0013).
 *
 * These tests are the evidence for the phase's correctness claims, and they are deliberately narrow
 * about what that means: an order is priced from **database state**, refuses an unorderable product and
 * a banned account *inside the transaction*, is idempotent per submission key, and leaves nothing behind
 * when it refuses. There is **no oversell test to write**: under ADR 0013 availability is the only gate,
 * no reservation or deduction is written, and two valid submissions for the same product are both
 * allowed - that is the accepted behaviour, not a gap this suite can close.
 */

const CONTACT: ContactInput = {
  recipientName: 'Rahim Uddin',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 5',
  area: 'Dhanmondi',
  city: 'Dhaka',
  postcode: null,
  deliveryNote: null,
};

let sequence = 0;
/** A submission key of a valid stored shape and a unique value per call. */
function submissionKey(seed: string): string {
  sequence += 1;
  return (seed + '-' + String(sequence).padStart(6, '0') + '-abcdefghij').slice(0, 64);
}

describe('order creation', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  async function createCustomer(email: string, status = 'active'): Promise<number> {
    const rows = await fixture.pool.query<{ id: string }>(
      `insert into customer (email, display_name, status) values ($1, 'Buyer', $2) returning id`,
      [email, status],
    );
    return Number(rows.rows[0]?.id);
  }

  async function createProduct(options: {
    suffix: string;
    availability?: 'in_stock' | 'out_of_stock';
    published?: boolean;
    priceMinor?: number;
  }): Promise<{ productId: number; variantId: number; sku: string; nameEn: string }> {
    const suffix = options.suffix;
    const availability = options.availability ?? 'in_stock';
    const published = options.published ?? true;
    const priceMinor = options.priceMinor ?? 12000;
    const nameEn = 'Order Product ' + suffix;

    const brand = await fixture.pool.query<{ id: string }>(
      `insert into brand (slug, name_bn, name_en) values ($1, 'ব্র্যান্ড', 'Brand') returning id`,
      ['brand-' + suffix],
    );
    const category = await fixture.pool.query<{ id: string }>(
      `insert into category (slug, name_bn, name_en) values ($1, 'শ্রেণি', 'Category') returning id`,
      ['category-' + suffix],
    );
    const product = await fixture.pool.query<{ id: string }>(
      `insert into product (slug, brand_id, category_id, name_bn, name_en, availability, is_published, published_at)
       values ($1, $2, $3, 'পণ্য', $4, $5, $6, case when $6 then now() else null end) returning id`,
      ['product-' + suffix, brand.rows[0]?.id, category.rows[0]?.id, nameEn, availability, published],
    );
    const productId = Number(product.rows[0]?.id);
    const sku = 'SKU-' + suffix;
    const variant = await fixture.pool.query<{ id: string }>(
      `insert into product_variant (product_id, sku, is_default, price_minor) values ($1, $2, true, $3) returning id`,
      [productId, sku, priceMinor],
    );
    return { productId, variantId: Number(variant.rows[0]?.id), sku, nameEn };
  }

  async function place(
    customerId: number,
    lines: { productId: number; quantity: number }[],
    options: {
      key?: string;
      fingerprint?: string;
      paymentMethod?: PaymentMethodInput;
      contact?: ContactInput;
    } = {},
  ) {
    const key = options.key ?? submissionKey('key');
    return fixture.db.transaction((tx) =>
      createOrder(tx, {
        customerId,
        idempotencyKey: key,
        fingerprint: options.fingerprint ?? 'fp-' + key,
        lines: lines.map((line) => ({ productId: String(line.productId), quantity: line.quantity })),
        contact: options.contact ?? CONTACT,
        paymentMethod: options.paymentMethod ?? 'bkash',
      }),
    );
  }

  async function expectRefusal(promise: Promise<unknown>, reason: string): Promise<void> {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof OrderRefusalError, 'expected OrderRefusalError, got ' + String(error));
      assert.equal(error.reason, reason);
      return true;
    });
  }

  before(async () => {
    fixture = await startMigratedDatabase();
  });

  after(async () => {
    await fixture.close();
  });

  it('creates one order from database prices, with the 24-hour expiry and a placed event', async () => {
    const customerId = await createCustomer('orders-happy@example.test');
    const product = await createProduct({ suffix: 'happy', priceMinor: 12000 });

    const created = await place(customerId, [{ productId: product.productId, quantity: 2 }]);
    assert.equal(created.totalMinor, 24000);
    assert.equal(created.status, 'pending');
    assert.equal(created.paymentState, 'awaiting_payment');
    assert.equal(created.codState, 'not_applicable');
    assert.match(created.orderNumber, /^QB[0-9A-F]{16}$/);

    const orderRow = await fixture.pool.query<{
      items_subtotal_minor: number;
      shipping_minor: number;
      total_minor: number;
      seconds_to_expiry: number;
    }>(
      `select items_subtotal_minor, shipping_minor, total_minor,
              extract(epoch from (expires_at - placed_at))::int as seconds_to_expiry
         from "order" where id = $1`,
      [created.orderId],
    );
    assert.deepEqual(orderRow.rows[0], {
      items_subtotal_minor: 24000,
      shipping_minor: 0,
      total_minor: 24000,
      seconds_to_expiry: 86400,
    });

    const item = await fixture.pool.query<{
      product_name_en: string;
      sku: string;
      unit_price_minor: number;
      quantity: number;
      line_total_minor: number;
    }>(
      `select product_name_en, sku, unit_price_minor, quantity, line_total_minor
         from order_item where order_id = $1`,
      [created.orderId],
    );
    assert.deepEqual(item.rows[0], {
      product_name_en: product.nameEn,
      sku: product.sku,
      unit_price_minor: 12000,
      quantity: 2,
      line_total_minor: 24000,
    });

    const events = await fixture.pool.query<{ event_type: string; actor_type: string; actor_customer_id: string }>(
      `select event_type, actor_type, actor_customer_id from order_event where order_id = $1`,
      [created.orderId],
    );
    assert.deepEqual(events.rows, [
      { event_type: 'order_placed', actor_type: 'customer', actor_customer_id: String(customerId) },
    ]);

    const stored = await fixture.pool.query<{ result_ref: string }>(
      `select result_ref from idempotency_key
        where scope = 'order_create' and result_ref is not null and principal_id = $1`,
      [customerId],
    );
    assert.equal(stored.rows[0]?.result_ref, created.orderNumber);
  });

  it('prices from the database and freezes the line, so a later price change cannot rewrite history', async () => {
    const customerId = await createCustomer('orders-price@example.test');
    const product = await createProduct({ suffix: 'price', priceMinor: 25000 });

    const created = await place(customerId, [{ productId: product.productId, quantity: 1 }]);
    assert.equal(created.totalMinor, 25000);

    await fixture.pool.query(`update product_variant set price_minor = 99900 where id = $1`, [
      product.variantId,
    ]);

    const item = await fixture.pool.query<{ unit_price_minor: number; line_total_minor: number }>(
      `select unit_price_minor, line_total_minor from order_item where order_id = $1`,
      [created.orderId],
    );
    assert.equal(item.rows[0]?.unit_price_minor, 25000);
    assert.equal(item.rows[0]?.line_total_minor, 25000);

    const total = await fixture.pool.query<{ total_minor: number }>(
      `select total_minor from "order" where id = $1`,
      [created.orderId],
    );
    assert.equal(total.rows[0]?.total_minor, 25000);
  });

  it('clamps an over-large quantity to the cap instead of trusting the browser', async () => {
    const customerId = await createCustomer('orders-clamp@example.test');
    const product = await createProduct({ suffix: 'clamp', priceMinor: 1000 });

    const created = await place(customerId, [{ productId: product.productId, quantity: 999 }]);
    const item = await fixture.pool.query<{ quantity: number }>(
      `select quantity from order_item where order_id = $1`,
      [created.orderId],
    );
    assert.equal(item.rows[0]?.quantity, ORDER_LIMITS.maxQuantityPerLine);
    assert.equal(created.totalMinor, 1000 * ORDER_LIMITS.maxQuantityPerLine);
  });

  it('refuses an out-of-stock or unpublished product from database state and writes nothing', async () => {
    const customerId = await createCustomer('orders-unavailable@example.test');
    const outOfStock = await createProduct({ suffix: 'oos', availability: 'out_of_stock' });
    const unpublished = await createProduct({ suffix: 'draft', published: false });

    const key = submissionKey('oos');
    await expectRefusal(
      place(customerId, [{ productId: outOfStock.productId, quantity: 1 }], { key }),
      'unavailable',
    );
    await expectRefusal(place(customerId, [{ productId: unpublished.productId, quantity: 1 }]), 'unavailable');

    const orders = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from "order" where customer_id = $1`,
      [customerId],
    );
    assert.equal(orders.rows[0]?.total, '0');

    // The refusal rolled the transaction back, so the submission key is free for a real retry.
    const claimed = await fixture.pool.query(
      `select 1 from idempotency_key where scope = 'order_create' and key = $1`,
      [key],
    );
    assert.equal(claimed.rowCount, 0);

    await fixture.pool.query(`update product set availability = 'in_stock' where id = $1`, [
      outOfStock.productId,
    ]);
    const created = await place(customerId, [{ productId: outOfStock.productId, quantity: 1 }], { key });
    assert.equal(created.totalMinor, 12000);
  });

  it('refuses a banned (suspended) account inside the transaction', async () => {
    const customerId = await createCustomer('orders-banned@example.test', 'suspended');
    const product = await createProduct({ suffix: 'banned' });

    await expectRefusal(place(customerId, [{ productId: product.productId, quantity: 1 }]), 'banned');

    const orders = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from "order" where customer_id = $1`,
      [customerId],
    );
    assert.equal(orders.rows[0]?.total, '0');
  });

  it('is idempotent: the same key and body returns the original order, once', async () => {
    const customerId = await createCustomer('orders-idem@example.test');
    const product = await createProduct({ suffix: 'idem' });
    const key = submissionKey('idem');

    const first = await place(customerId, [{ productId: product.productId, quantity: 1 }], { key });
    const second = await place(customerId, [{ productId: product.productId, quantity: 1 }], { key });

    assert.equal(second.orderNumber, first.orderNumber);
    const orders = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from "order" where customer_id = $1`,
      [customerId],
    );
    assert.equal(orders.rows[0]?.total, '1');
    const items = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from order_item where order_id = $1`,
      [first.orderId],
    );
    assert.equal(items.rows[0]?.total, '1');
  });

  it('treats a reused key with a different body as a conflict, not a second order', async () => {
    const customerId = await createCustomer('orders-conflict@example.test');
    const product = await createProduct({ suffix: 'conflict' });
    const key = submissionKey('conflict');

    await place(customerId, [{ productId: product.productId, quantity: 1 }], { key });
    await expectRefusal(
      place(customerId, [{ productId: product.productId, quantity: 2 }], { key, fingerprint: 'different-body' }),
      'idempotency_conflict',
    );

    const orders = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from "order" where customer_id = $1`,
      [customerId],
    );
    assert.equal(orders.rows[0]?.total, '1');
  });

  it('refuses another customer reusing the same submission key', async () => {
    const firstCustomer = await createCustomer('orders-key-a@example.test');
    const secondCustomer = await createCustomer('orders-key-b@example.test');
    const product = await createProduct({ suffix: 'keyowner' });
    const key = submissionKey('keyowner');

    await place(firstCustomer, [{ productId: product.productId, quantity: 1 }], { key });
    await expectRefusal(
      place(secondCustomer, [{ productId: product.productId, quantity: 1 }], { key, fingerprint: 'fp-' + key }),
      'idempotency_conflict',
    );
  });

  it('records a COD order with its own state and no expiry timestamp', async () => {
    const customerId = await createCustomer('orders-cod@example.test');
    const product = await createProduct({ suffix: 'cod' });

    const created = await place(customerId, [{ productId: product.productId, quantity: 1 }], {
      paymentMethod: 'cod',
    });
    assert.equal(created.paymentState, 'not_applicable');
    assert.equal(created.codState, 'cod_pending_approval');

    const row = await fixture.pool.query<{ expires_at: string | null; payment_state: string; cod_state: string }>(
      `select expires_at, payment_state, cod_state from "order" where id = $1`,
      [created.orderId],
    );
    assert.equal(row.rows[0]?.expires_at, null);
    assert.equal(row.rows[0]?.payment_state, 'not_applicable');
    assert.equal(row.rows[0]?.cod_state, 'cod_pending_approval');
  });

  it('is atomic: a refusal on the second line leaves no order, item, event or claimed key', async () => {
    const customerId = await createCustomer('orders-atomic@example.test');
    const good = await createProduct({ suffix: 'atomic-good' });
    const bad = await createProduct({ suffix: 'atomic-bad', availability: 'out_of_stock' });
    const key = submissionKey('atomic');
    const eventsBefore = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from order_event`,
    );
    const itemsBefore = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from order_item`,
    );

    await expectRefusal(
      place(
        customerId,
        [
          { productId: good.productId, quantity: 1 },
          { productId: bad.productId, quantity: 1 },
        ],
        { key },
      ),
      'unavailable',
    );

    const orderCount = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from "order" where customer_id = $1`,
      [customerId],
    );
    assert.equal(orderCount.rows[0]?.total, '0');
    const eventCount = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from order_event`,
    );
    assert.equal(eventCount.rows[0]?.total, eventsBefore.rows[0]?.total);
    const itemCount = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from order_item`,
    );
    assert.equal(itemCount.rows[0]?.total, itemsBefore.rows[0]?.total);
    const claimed = await fixture.pool.query(
      `select 1 from idempotency_key where scope = 'order_create' and key = $1`,
      [key],
    );
    assert.equal(claimed.rowCount, 0);

    await fixture.pool.query(`update product set availability = 'in_stock' where id = $1`, [
      bad.productId,
    ]);
    const created = await place(
      customerId,
      [
        { productId: good.productId, quantity: 1 },
        { productId: bad.productId, quantity: 1 },
      ],
      { key },
    );
    assert.equal(created.totalMinor, 24000);
  });

  it('scopes order reads to the owning customer', async () => {
    const owner = await createCustomer('orders-owner@example.test');
    const other = await createCustomer('orders-other@example.test');
    const product = await createProduct({ suffix: 'scope' });
    const created = await place(owner, [{ productId: product.productId, quantity: 3 }]);

    const detail = await fixture.db.transaction((tx) =>
      getCustomerOrderDetail(tx, owner, created.orderNumber),
    );
    assert.equal(detail?.orderNumber, created.orderNumber);
    assert.equal(detail?.itemCount, 3);
    assert.equal(detail?.items.length, 1);

    assert.equal(
      await fixture.db.transaction((tx) => getCustomerOrderDetail(tx, other, created.orderNumber)),
      null,
    );

    const ownerList = await fixture.db.transaction((tx) => listCustomerOrders(tx, owner));
    assert.equal(ownerList.length, 1);
    assert.equal(ownerList[0]?.orderNumber, created.orderNumber);
    assert.equal((await fixture.db.transaction((tx) => listCustomerOrders(tx, other))).length, 0);
  });
});
