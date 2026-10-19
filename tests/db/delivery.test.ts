import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuthorizationError, ValidationError } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import {
  deactivateDistrictDeliveryCharge,
  loadDeliveryOverview,
  loadDeliveryRates,
  quoteDelivery,
  setDefaultDeliveryCharge,
  setDistrictDeliveryCharge,
} from '../../src/server/delivery/service';
import {
  SKIP_REASON,
  UNIQUE_VIOLATION,
  expectSqlState,
  startMigratedDatabase,
  toolingAvailable,
  type DbFixture,
} from './helpers';

/**
 * Delivery configuration against real PostgreSQL (Phase 19).
 *
 * The important properties are configuration facts, not UI facts: a single default row, at most one row
 * per district, inactive overrides excluded from pricing, audited writes, and a refusal that leaves no
 * change behind.
 */

describe('delivery configuration', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let staffId: number;
  const actor = () => ({
    staffUserId: staffId,
    permissions: new Set([PERMISSIONS.settingsWrite]),
    roleCodes: ['owner'],
  });

  before(async () => {
    fixture = await startMigratedDatabase();
    const staff = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ('delivery-config@example.test', 'Delivery Config') returning id`,
    );
    staffId = Number(staff.rows[0]?.id);
  });

  after(async () => {
    await fixture.close();
  });

  it('saves a default, resolves overrides, and falls back to the default', async () => {
    await fixture.db.transaction((tx) => setDefaultDeliveryCharge(tx, actor(), '80'));
    await fixture.db.transaction((tx) => setDistrictDeliveryCharge(tx, actor(), { districtCode: 'dhaka', amount: '120' }));
    await fixture.db.transaction((tx) =>
      setDistrictDeliveryCharge(tx, actor(), { districtCode: 'chattogram', amount: '150' }),
    );

    const rates = await fixture.db.transaction((tx) => loadDeliveryRates(tx));
    assert.equal(rates.defaultMinor, 8000);
    assert.equal(rates.overrides.get('dhaka'), 12000);
    assert.equal(rates.overrides.get('chattogram'), 15000);

    assert.deepEqual(quoteDelivery(rates, 'dhaka'), {
      ok: true,
      quote: { areaCode: 'dhaka', chargeMinor: 12000, source: 'district' },
    });
    assert.deepEqual(quoteDelivery(rates, 'others'), {
      ok: true,
      quote: { areaCode: 'others', chargeMinor: 8000, source: 'default' },
    });
  });

  it('keeps at most one row per district and reactivates an inactive override', async () => {
    await fixture.db.transaction((tx) =>
      setDistrictDeliveryCharge(tx, actor(), { districtCode: 'dhaka', amount: '130' }),
    );
    let rows = await fixture.pool.query<{ id: string; amount_minor: number; is_active: boolean }>(
      `select id, amount_minor, is_active from delivery_district_charge where district_code = 'dhaka'`,
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0]?.amount_minor, 13000);

    await fixture.db.transaction((tx) => deactivateDistrictDeliveryCharge(tx, actor(), 'dhaka'));
    let rates = await fixture.db.transaction((tx) => loadDeliveryRates(tx));
    assert.equal(rates.overrides.has('dhaka'), false);
    assert.deepEqual(quoteDelivery(rates, 'dhaka'), {
      ok: true,
      quote: { areaCode: 'dhaka', chargeMinor: 8000, source: 'default' },
    });

    await fixture.db.transaction((tx) =>
      setDistrictDeliveryCharge(tx, actor(), { districtCode: 'dhaka', amount: '140' }),
    );
    rows = await fixture.pool.query(`select id from delivery_district_charge where district_code = 'dhaka'`);
    assert.equal(rows.rowCount, 1);
    rates = await fixture.db.transaction((tx) => loadDeliveryRates(tx));
    assert.equal(rates.overrides.get('dhaka'), 14000);
  });

  it('enforces one override per area in the database, not only in the service', async () => {
    await expectSqlState(
      fixture.pool,
      `insert into delivery_district_charge (district_code, amount_minor, updated_by_staff_id)
       values ('dhaka', 9900, $1)`,
      [staffId],
      UNIQUE_VIOLATION,
    );
  });

  it('refuses malformed, negative, formatted and non-string amounts', async () => {
    for (const amount of ['-1', '1,000', '80.999', 'Tk 80', 80, '', '1e3']) {
      await assert.rejects(
        fixture.db.transaction((tx) => setDefaultDeliveryCharge(tx, actor(), amount)),
        ValidationError,
      );
    }
  });

  it('accepts zero, refuses an unknown area and refuses an Other-districts override', async () => {
    await fixture.db.transaction((tx) => setDefaultDeliveryCharge(tx, actor(), '0'));
    const rates = await fixture.db.transaction((tx) => loadDeliveryRates(tx));
    assert.equal(rates.defaultMinor, 0);
    assert.deepEqual(quoteDelivery(rates, 'others'), {
      ok: true,
      quote: { areaCode: 'others', chargeMinor: 0, source: 'default' },
    });
    assert.deepEqual(quoteDelivery(rates, 'not-a-district'), { ok: false, reason: 'invalid_district' });
    assert.deepEqual(quoteDelivery(rates, 'khulna'), { ok: false, reason: 'invalid_district' });

    await assert.rejects(
      fixture.db.transaction((tx) =>
        setDistrictDeliveryCharge(tx, actor(), { districtCode: 'not-a-district', amount: '50' }),
      ),
      ValidationError,
    );
    await assert.rejects(
      fixture.db.transaction((tx) => deactivateDistrictDeliveryCharge(tx, actor(), 'not-a-district')),
      ValidationError,
    );
    await assert.rejects(
      fixture.db.transaction((tx) =>
        setDistrictDeliveryCharge(tx, actor(), { districtCode: 'others', amount: '50' }),
      ),
      ValidationError,
      'Other districts is priced by the default, not an override',
    );
  });

  it('refuses a write without settings.write and audits successful writes', async () => {
    const bystander = {
      staffUserId: staffId,
      permissions: new Set<string>(),
      roleCodes: ['owner'],
    };
    await assert.rejects(
      fixture.db.transaction((tx) => setDefaultDeliveryCharge(tx, bystander, '90')),
      AuthorizationError,
    );

    const before = await fixture.pool.query<{ default_minor: number }>(
      `select default_minor from delivery_setting where id = 1`,
    );
    assert.equal(before.rows[0]?.default_minor, 0, 'a refused write must leave the row unchanged');

    const audit = await fixture.pool.query<{ action: string; entity_type: string; actor_staff_id: string }>(
      `select action, entity_type, actor_staff_id from audit_event
        where entity_type in ('delivery_setting', 'delivery_district_charge')
        order by id`,
    );
    const actions = audit.rows.map((row) => row.action);
    assert.ok(actions.includes('delivery.default_updated'));
    assert.ok(actions.includes('delivery.district_saved'));
    assert.ok(actions.includes('delivery.district_deactivated'));
    assert.ok(audit.rows.every((row) => Number(row.actor_staff_id) === staffId));

    const overview = await fixture.db.transaction((tx) => loadDeliveryOverview(tx));
    assert.equal(overview.overrides.filter((row) => row.isActive).length, 2);
  });
});
