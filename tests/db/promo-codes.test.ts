import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import { OrderRefusalError, createOrder } from '../../src/server/orders/create';
import type { ContactInput } from '../../src/server/orders/validation';
import {
  createPromoCode,
  getPromoCode,
  listPromoCodes,
  promoPeriodTotals,
  resolvePromo,
  setPromoCodeActive,
  updatePromoCode,
  type PromoInput,
} from '../../src/server/promotions/service';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Promotion codes against real PostgreSQL.
 *
 * What matters is that the discount a customer receives and the row that accounts for it are one fact:
 * the order's frozen `discount_minor`, the total the schema checks, and the redemption that makes the
 * code's use count. The tests also pin the refusals - a paused, ended, exhausted or too-small cart is
 * refused by name, not silently charged full price.
 */

const CONTACT: ContactInput = {
  recipientName: 'Rahim Uddin',
  districtCode: 'dhaka',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 5',
  area: 'Dhanmondi',
  city: 'Dhaka',
  postcode: null,
  deliveryNote: null,
};

let sequence = 0;
function submissionKey(): string {
  sequence += 1;
  return ('promo-' + String(sequence).padStart(6, '0') + '-abcdefghijkl').slice(0, 64);
}

function baseInput(overrides: Partial<PromoInput> = {}): PromoInput {
  return {
    code: 'FLAT10',
    description: 'Launch offer',
    kind: 'percent',
    percentOff: '10',
    amountOff: '',
    minOrder: '',
    maxDiscount: '',
    startsAt: '',
    endsAt: '',
    maxRedemptions: '',
    ...overrides,
  };
}

describe('promo codes', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let staffId: number;

  const actor = () => ({
    staffUserId: staffId,
    permissions: new Set([PERMISSIONS.settingsWrite]),
    roleCodes: ['owner'],
  });

  async function createCustomer(email: string): Promise<number> {
    const rows = await fixture.pool.query<{ id: string }>(
      `insert into customer (email, display_name) values ($1, 'Buyer') returning id`,
      [email],
    );
    return Number(rows.rows[0]?.id);
  }

  async function createProduct(suffix: string, priceMinor: number): Promise<number> {
    const brand = await fixture.pool.query<{ id: string }>(
      `insert into brand (slug, name_bn, name_en) values ($1, 'ব্র্যান্ড', 'Brand') returning id`,
      ['promo-brand-' + suffix],
    );
    const category = await fixture.pool.query<{ id: string }>(
      `insert into category (slug, name_bn, name_en) values ($1, 'শ্রেণি', 'Category') returning id`,
      ['promo-category-' + suffix],
    );
    const product = await fixture.pool.query<{ id: string }>(
      `insert into product (slug, brand_id, category_id, name_bn, name_en, availability, is_published, published_at)
       values ($1, $2, $3, 'পণ্য', 'Promo Product', 'in_stock', true, now()) returning id`,
      ['promo-product-' + suffix, brand.rows[0]?.id, category.rows[0]?.id],
    );
    const productId = Number(product.rows[0]?.id);
    await fixture.pool.query(
      `insert into product_variant (product_id, sku, is_default, price_minor) values ($1, $2, true, $3)`,
      [productId, 'PROMO-SKU-' + suffix, priceMinor],
    );
    return productId;
  }

  function place(customerId: number, productId: number, promoCode: string | null) {
    return fixture.db.transaction((tx) =>
      createOrder(tx, {
        customerId,
        idempotencyKey: submissionKey(),
        fingerprint: 'fp-' + submissionKey(),
        lines: [{ productId: String(productId), quantity: 1 }],
        contact: CONTACT,
        promoCode,
      }),
    );
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    const staff = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ('promo-test@example.test', 'Promo Test') returning id`,
    );
    staffId = Number(staff.rows[0]?.id);
    // Free delivery keeps the totals about the discount rather than the courier.
    await fixture.pool.query(
      `insert into delivery_setting (id, default_minor, updated_by_staff_id) values (1, 0, $1)`,
      [staffId],
    );
  });

  after(async () => {
    await fixture.close();
  });

  it('creates a code, derives its use count, and refuses a duplicate string', async () => {
    const id = await fixture.db.transaction((tx) => createPromoCode(tx, actor(), baseInput({ code: 'launch10' })));

    const row = await fixture.db.transaction((tx) => getPromoCode(tx, id));
    assert.ok(row !== null);
    assert.equal(row.code, 'LAUNCH10');
    assert.equal(row.percentOff, 10);
    assert.equal(row.redemptions, 0);
    assert.equal(row.isActive, true);

    await assert.rejects(
      fixture.db.transaction((tx) => createPromoCode(tx, actor(), baseInput({ code: 'LAUNCH10' }))),
      ConflictError,
    );

    const all = await fixture.db.transaction((tx) => listPromoCodes(tx));
    assert.ok(all.some((code) => code.code === 'LAUNCH10'));
  });

  it('refuses a malformed rule before anything is written', async () => {
    for (const bad of [
      baseInput({ code: 'AB' }),
      baseInput({ code: 'OKCODE', percentOff: '0' }),
      baseInput({ code: 'OKCODE2', percentOff: '101' }),
      baseInput({ code: 'OKCODE3', kind: 'fixed', amountOff: '' }),
      baseInput({ code: 'OKCODE4', startsAt: '2026-05-01', endsAt: '2026-04-01' }),
    ]) {
      await assert.rejects(fixture.db.transaction((tx) => createPromoCode(tx, actor(), bad)), ValidationError);
    }
  });

  it('applies a percentage with its cap, and refuses a cart below the minimum', async () => {
    const id = await fixture.db.transaction((tx) =>
      createPromoCode(
        tx,
        actor(),
        baseInput({ code: 'CAP10', percentOff: '10', minOrder: '100', maxDiscount: '50' }),
      ),
    );
    assert.ok(id > 0);

    const capped = await fixture.db.transaction((tx) =>
      resolvePromo(tx, 'cap10', 100000, { lock: false }),
    );
    assert.deepEqual(capped, { ok: true, promoCodeId: id, code: 'CAP10', discountMinor: 5000 });

    const small = await fixture.db.transaction((tx) =>
      resolvePromo(tx, 'CAP10', 5000, { lock: false }),
    );
    assert.deepEqual(small, { ok: false, reason: 'below_minimum' });

    const unknown = await fixture.db.transaction((tx) =>
      resolvePromo(tx, 'NOSUCHCODE', 100000, { lock: false }),
    );
    assert.deepEqual(unknown, { ok: false, reason: 'unknown' });
  });

  it('writes the discount on the order and the redemption that accounts for it', async () => {
    const customerId = await createCustomer('promo-order@example.test');
    const productId = await createProduct('order', 120000);
    await fixture.db.transaction((tx) =>
      createPromoCode(tx, actor(), baseInput({ code: 'ORDER10', percentOff: '10' })),
    );

    const placed = await place(customerId, productId, 'order10');
    // 1,200 taka of goods, 10% off, free delivery.
    assert.equal(placed.totalMinor, 108000);

    const orderRow = await fixture.pool.query<{ discount_minor: number; total_minor: number }>(
      `select discount_minor, total_minor from "order" where order_number = $1`,
      [placed.orderNumber],
    );
    assert.equal(orderRow.rows[0]?.discount_minor, 12000);
    assert.equal(orderRow.rows[0]?.total_minor, 108000);

    const redemption = await fixture.pool.query<{ discount_minor: number; code: string }>(
      `select r.discount_minor, c.code
         from promo_code_redemption r
         join promo_code c on c.id = r.promo_code_id
        where r.order_id = (select id from "order" where order_number = $1)`,
      [placed.orderNumber],
    );
    assert.equal(redemption.rows[0]?.code, 'ORDER10');
    assert.equal(redemption.rows[0]?.discount_minor, 12000);

    const totals = await fixture.db.transaction((tx) => promoPeriodTotals(tx, 30));
    assert.ok(totals.redemptions >= 1);
    assert.ok(totals.discountGivenMinor >= 12000);
  });

  it('refuses a bounded code once its uses are spent, and an invalid code at order time', async () => {
    const customerId = await createCustomer('promo-limit@example.test');
    const productId = await createProduct('limit', 100000);
    await fixture.db.transaction((tx) =>
      createPromoCode(tx, actor(), baseInput({ code: 'ONCE', percentOff: '5', maxRedemptions: '1' })),
    );

    await place(customerId, productId, 'ONCE');

    await assert.rejects(place(customerId, productId, 'ONCE'), (error: unknown) => {
      assert.ok(error instanceof OrderRefusalError);
      assert.equal(error.reason, 'promo_invalid');
      return true;
    });

    // A code the customer typed but that cannot apply also refuses the order rather than charging more.
    await assert.rejects(place(customerId, productId, 'NOTACODE'), (error: unknown) => {
      assert.ok(error instanceof OrderRefusalError);
      assert.equal(error.reason, 'promo_invalid');
      return true;
    });
  });

  it('refuses a paused code and honours an end date', async () => {
    const id = await fixture.db.transaction((tx) =>
      createPromoCode(tx, actor(), baseInput({ code: 'PAUSEME', percentOff: '20' })),
    );
    await fixture.db.transaction((tx) => setPromoCodeActive(tx, actor(), id, false));

    const paused = await fixture.db.transaction((tx) => resolvePromo(tx, 'PAUSEME', 100000, { lock: false }));
    assert.deepEqual(paused, { ok: false, reason: 'inactive' });

    await fixture.db.transaction((tx) => setPromoCodeActive(tx, actor(), id, true));
    await fixture.db.transaction((tx) =>
      updatePromoCode(tx, actor(), id, baseInput({ code: 'PAUSEME', percentOff: '20', endsAt: '2020-01-01' })),
    );
    const ended = await fixture.db.transaction((tx) => resolvePromo(tx, 'PAUSEME', 100000, { lock: false }));
    assert.deepEqual(ended, { ok: false, reason: 'expired' });
  });

  it('keeps a redemption immutable and records every change in the audit trail', async () => {
    const redemption = await fixture.pool.query<{ id: string }>(
      `select id from promo_code_redemption limit 1`,
    );
    const redemptionId = redemption.rows[0]?.id;
    assert.ok(redemptionId !== undefined);

    await assert.rejects(
      fixture.pool.query(`update promo_code_redemption set discount_minor = 1 where id = $1`, [redemptionId]),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
    await assert.rejects(
      fixture.pool.query(`delete from promo_code_redemption where id = $1`, [redemptionId]),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );

    const audit = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where entity_type = 'promo_code' order by id`,
    );
    const actions = audit.rows.map((row) => row.action);
    assert.ok(actions.includes('promo.created'));
    assert.ok(actions.includes('promo.updated'));
    assert.ok(actions.includes('promo.deactivated'));
    assert.ok(actions.includes('promo.activated'));
  });

  it('refuses an update that would move the code onto another code string', async () => {
    await fixture.db.transaction((tx) => createPromoCode(tx, actor(), baseInput({ code: 'TAKEN', percentOff: '5' })));
    const id = await fixture.db.transaction((tx) => createPromoCode(tx, actor(), baseInput({ code: 'MOVER', percentOff: '5' })));

    await assert.rejects(
      fixture.db.transaction((tx) => updatePromoCode(tx, actor(), id, baseInput({ code: 'TAKEN' }))),
      ConflictError,
    );
  });
});
