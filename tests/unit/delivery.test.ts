import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { quoteDelivery } from '../../src/lib/delivery';
import {
  DELIVERY_AREAS,
  deliveryAreaByCode,
  deliveryAreaName,
  isDeliveryAreaCode,
  overrideAreas,
} from '../../src/lib/delivery-areas';
import { parsePoisha } from '../../src/server/catalog/validation';

describe('canonical delivery areas', () => {
  it('offers exactly Dhaka, Chattogram and Other districts', () => {
    assert.deepEqual(
      DELIVERY_AREAS.map((area) => area.code),
      ['dhaka', 'chattogram', 'others'],
    );
    assert.deepEqual(
      overrideAreas().map((area) => area.code),
      ['dhaka', 'chattogram'],
    );
    assert.equal(DELIVERY_AREAS.length, 3);
  });

  it('exposes both names and matches only by code', () => {
    assert.deepEqual(deliveryAreaByCode('dhaka'), {
      code: 'dhaka',
      name: 'Dhaka',
      usesDefault: false,
    });
    assert.equal(deliveryAreaName('chattogram'), 'Chattogram');
    assert.equal(deliveryAreaName('others'), 'Other districts');
    assert.equal(deliveryAreaName('unknown'), 'unknown');
    assert.equal(isDeliveryAreaCode('Dhaka'), false, 'a display name is not a code');
    assert.equal(isDeliveryAreaCode('dhaka '), false, 'no trimming or fuzzy matching');
    assert.equal(isDeliveryAreaCode('khulna'), false, 'the list has exactly three areas');
  });
});

describe('delivery pricing rule', () => {
  const rates = {
    defaultMinor: 8000,
    overrides: new Map([['dhaka', 12000]]),
  };

  it('uses an active area override, otherwise the default', () => {
    assert.deepEqual(quoteDelivery(rates, 'dhaka'), {
      ok: true,
      quote: { areaCode: 'dhaka', chargeMinor: 12000, source: 'district' },
    });
    assert.deepEqual(quoteDelivery(rates, 'chattogram'), {
      ok: true,
      quote: { areaCode: 'chattogram', chargeMinor: 8000, source: 'default' },
    });
    assert.deepEqual(quoteDelivery(rates, 'others'), {
      ok: true,
      quote: { areaCode: 'others', chargeMinor: 8000, source: 'default' },
    });
  });

  it('ignores any stored override for the Other districts area', () => {
    assert.deepEqual(
      quoteDelivery(
        { defaultMinor: 8000, overrides: new Map([['others', 9900]]) },
        'others',
      ),
      { ok: true, quote: { areaCode: 'others', chargeMinor: 8000, source: 'default' } },
    );
  });

  it('refuses an unconfigured default rather than charging zero', () => {
    assert.deepEqual(quoteDelivery({ defaultMinor: null, overrides: new Map() }, 'others'), {
      ok: false,
      reason: 'unconfigured',
    });
  });

  it('still applies an override when the default is missing', () => {
    assert.deepEqual(
      quoteDelivery({ defaultMinor: null, overrides: new Map([['dhaka', 12000]]) }, 'dhaka'),
      { ok: true, quote: { areaCode: 'dhaka', chargeMinor: 12000, source: 'district' } },
    );
  });

  it('refuses an invalid or absent area instead of guessing', () => {
    for (const value of ['', 'Dhaka', 'dhaka ', 'khulna', 'not-a-district', null, undefined, 3]) {
      assert.deepEqual(quoteDelivery(rates, value), { ok: false, reason: 'invalid_district' });
    }
  });

  it('treats zero as a configured free charge', () => {
    assert.deepEqual(quoteDelivery({ defaultMinor: 0, overrides: new Map() }, 'others'), {
      ok: true,
      quote: { areaCode: 'others', chargeMinor: 0, source: 'default' },
    });
  });
});

describe('taka to poisha conversion for delivery', () => {
  it('parses whole and fractional taka by integer arithmetic', () => {
    assert.equal(parsePoisha('80', { allowZero: true }), 8000);
    assert.equal(parsePoisha('80.5', { allowZero: true }), 8050);
    assert.equal(parsePoisha('80.05', { allowZero: true }), 8005);
    assert.equal(parsePoisha('0', { allowZero: true }), 0);
    assert.equal(parsePoisha(' 80 ', { allowZero: true }), 8000);
  });

  it('refuses negative, malformed, formatted and unsafe input', () => {
    for (const value of ['-1', '1,000', '80.999', 'Tk 80', '1e3', '', '  ']) {
      assert.equal(parsePoisha(value, { allowZero: true }), null);
    }
    assert.equal(parsePoisha(80, { allowZero: true }), null, 'a bare number has no unit');
    assert.equal(parsePoisha('0'), null, 'zero is only allowed where explicitly requested');
  });
});
