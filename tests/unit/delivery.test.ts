import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  quoteDelivery,
  quoteOrderDelivery,
  repeatDiscountMinor,
  type DeliveryRates,
} from '../../src/lib/delivery';
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

/**
 * The pricing hierarchy and the repeat discount (ADR 0029).
 *
 * These are the rules a customer's delivery charge and automatic discount depend on, tested without a
 * database: the priority between repeat, conditional and default pricing, the guest exclusion, and the
 * integer discount arithmetic.
 */
const BASE_RATES: DeliveryRates = {
  defaultMinor: 12000,
  overrides: new Map([['dhaka', 10000], ['chattogram', 8000]]),
  conditional: {
    enabled: true,
    minSubtotalMinor: 100000,
    dhakaMinor: 10000,
    chattogramMinor: 6000,
    othersMinor: 12000,
  },
  repeat: { enabled: true, chattogramMinor: 4000, othersMinor: 8000 },
  repeatDiscount: { enabled: true, percent: 5, minSubtotalMinor: 200000 },
};

const guest = { subtotalMinor: 150000, authenticated: false, repeatCustomer: false };
const newCustomer = { subtotalMinor: 150000, authenticated: true, repeatCustomer: false };
const repeatCustomer = { subtotalMinor: 80000, authenticated: true, repeatCustomer: true };

describe('delivery pricing priority', () => {
  it('gives a guest the default charges at any subtotal', () => {
    const quote = quoteOrderDelivery(BASE_RATES, 'others', { ...guest, subtotalMinor: 250000 });
    assert.deepEqual(quote, {
      ok: true,
      quote: { areaCode: 'others', chargeMinor: 12000, source: 'default' },
    });
  });

  it('gives a new customer the conditional rate above the minimum', () => {
    assert.deepEqual(quoteOrderDelivery(BASE_RATES, 'dhaka', newCustomer), {
      ok: true,
      quote: { areaCode: 'dhaka', chargeMinor: 10000, source: 'conditional' },
    });
    assert.deepEqual(quoteOrderDelivery(BASE_RATES, 'chattogram', newCustomer), {
      ok: true,
      quote: { areaCode: 'chattogram', chargeMinor: 6000, source: 'conditional' },
    });
  });

  it('keeps a new customer below the minimum on the default charges', () => {
    assert.deepEqual(
      quoteOrderDelivery(BASE_RATES, 'others', { ...newCustomer, subtotalMinor: 99999 }),
      { ok: true, quote: { areaCode: 'others', chargeMinor: 12000, source: 'default' } },
    );
  });

  it('gives a repeat customer the repeat rate, even below the conditional minimum', () => {
    assert.deepEqual(quoteOrderDelivery(BASE_RATES, 'chattogram', repeatCustomer), {
      ok: true,
      quote: { areaCode: 'chattogram', chargeMinor: 4000, source: 'repeat' },
    });
  });

  it('prices Dhaka and other districts at the single repeat "rest" rate', () => {
    for (const area of ['dhaka', 'others']) {
      assert.deepEqual(quoteOrderDelivery(BASE_RATES, area, repeatCustomer), {
        ok: true,
        quote: { areaCode: area, chargeMinor: 8000, source: 'repeat' },
      });
    }
  });

  it('takes the repeat rate over the conditional rate when both apply', () => {
    assert.deepEqual(
      quoteOrderDelivery(BASE_RATES, 'dhaka', { ...repeatCustomer, subtotalMinor: 250000 }),
      { ok: true, quote: { areaCode: 'dhaka', chargeMinor: 8000, source: 'repeat' } },
    );
  });

  it('falls back to the default when a rule is switched off', () => {
    const off: DeliveryRates = {
      ...BASE_RATES,
      conditional: { ...BASE_RATES.conditional!, enabled: false },
      repeat: { ...BASE_RATES.repeat!, enabled: false },
    };
    assert.equal(
      (quoteOrderDelivery(off, 'chattogram', repeatCustomer) as { quote: { source: string } }).quote.source,
      'district',
    );
  });

  it('falls through a rule that has no rate for the area rather than guessing one', () => {
    const partial: DeliveryRates = {
      ...BASE_RATES,
      repeat: { enabled: true, chattogramMinor: 4000, othersMinor: null },
    };
    assert.deepEqual(quoteOrderDelivery(partial, 'dhaka', repeatCustomer), {
      ok: true,
      quote: { areaCode: 'dhaka', chargeMinor: 10000, source: 'district' },
    });
  });

  it('still refuses an unknown area and an unconfigured default', () => {
    assert.deepEqual(quoteOrderDelivery(BASE_RATES, 'khulna', newCustomer), {
      ok: false,
      reason: 'invalid_district',
    });
    assert.deepEqual(
      quoteOrderDelivery({ defaultMinor: null, overrides: new Map() }, 'others', guest),
      { ok: false, reason: 'unconfigured' },
    );
  });
});

describe('repeat-customer discount', () => {
  it('takes the configured percentage off a repeat customer above the minimum', () => {
    assert.equal(
      repeatDiscountMinor(BASE_RATES, { ...repeatCustomer, subtotalMinor: 250000 }),
      12500,
    );
  });

  it('applies nothing to a guest, a new customer or a subtotal below the minimum', () => {
    assert.equal(repeatDiscountMinor(BASE_RATES, { ...guest, subtotalMinor: 250000 }), 0);
    assert.equal(repeatDiscountMinor(BASE_RATES, { ...newCustomer, subtotalMinor: 250000 }), 0);
    assert.equal(repeatDiscountMinor(BASE_RATES, { ...repeatCustomer, subtotalMinor: 199999 }), 0);
  });

  it('floors the percentage, and never exceeds the goods subtotal', () => {
    const odd: DeliveryRates = {
      ...BASE_RATES,
      repeatDiscount: { enabled: true, percent: 7, minSubtotalMinor: 0 },
    };
    // 7% of 999 poisha is 69.93 -> 69, never 70.
    assert.equal(repeatDiscountMinor(odd, { ...repeatCustomer, subtotalMinor: 999 }), 69);

    const everything: DeliveryRates = {
      ...BASE_RATES,
      repeatDiscount: { enabled: true, percent: 100, minSubtotalMinor: 0 },
    };
    assert.equal(repeatDiscountMinor(everything, { ...repeatCustomer, subtotalMinor: 12000 }), 12000);
  });

  it('ignores a rule that is off, unconfigured or out of range', () => {
    const off: DeliveryRates = {
      ...BASE_RATES,
      repeatDiscount: { ...BASE_RATES.repeatDiscount!, enabled: false },
    };
    assert.equal(repeatDiscountMinor(off, { ...repeatCustomer, subtotalMinor: 250000 }), 0);

    for (const percent of [0, 101, 12.5]) {
      const invalid: DeliveryRates = {
        ...BASE_RATES,
        repeatDiscount: { enabled: true, percent, minSubtotalMinor: 0 },
      };
      assert.equal(repeatDiscountMinor(invalid, { ...repeatCustomer, subtotalMinor: 250000 }), 0);
    }
  });
});
