import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluatePromo,
  normalizePromoCode,
  promoDiscountMinor,
  type PromoRule,
} from '../../src/lib/promo';

/**
 * The promotion evaluator, in isolation.
 *
 * These are the rules a customer's money depends on, so they are tested without a database, a request
 * or a clock: percentage math floors, a cap caps, a code never reduces more than the goods are worth,
 * and every refusal has its own name.
 */

const BASE: PromoRule = {
  code: 'FLAT10',
  kind: 'percent',
  percentOff: 10,
  amountOffMinor: null,
  minOrderMinor: 0,
  maxDiscountMinor: null,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  isActive: true,
};

const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('normalizePromoCode', () => {
  it('forgives case and surrounding whitespace', () => {
    assert.equal(normalizePromoCode('  flat10 '), 'FLAT10');
    assert.equal(normalizePromoCode('BHORI-25'), 'BHORI-25');
  });

  it('refuses anything that is not a code rather than repairing it', () => {
    assert.equal(normalizePromoCode('FL'), null);
    assert.equal(normalizePromoCode('BAD CODE'), null);
    assert.equal(normalizePromoCode('10%OFF'), null);
    assert.equal(normalizePromoCode(''), null);
    assert.equal(normalizePromoCode(null), null);
    assert.equal(normalizePromoCode(42), null);
  });
});

describe('promoDiscountMinor', () => {
  it('floors a percentage so it never overstates the discount', () => {
    // 9.99 taka at 10% is 0.999 taka = 99 poisha, not 100.
    assert.equal(promoDiscountMinor(BASE, 999), 99);
    assert.equal(promoDiscountMinor(BASE, 100000), 10000);
  });

  it('never exceeds the cap', () => {
    const capped: PromoRule = { ...BASE, maxDiscountMinor: 5000 };
    assert.equal(promoDiscountMinor(capped, 100000), 5000);
    // A cart below the cap is discounted on its own value.
    assert.equal(promoDiscountMinor(capped, 20000), 2000);
  });

  it('never reduces more than the goods are worth', () => {
    const fixed: PromoRule = {
      ...BASE,
      kind: 'fixed',
      percentOff: null,
      amountOffMinor: 50000,
    };
    assert.equal(promoDiscountMinor(fixed, 12000), 12000);
  });

  it('takes a full 100% off the goods but is still bounded by the subtotal', () => {
    const free: PromoRule = { ...BASE, percentOff: 100 };
    assert.equal(promoDiscountMinor(free, 4500), 4500);
  });

  it('is zero for a non-positive subtotal', () => {
    assert.equal(promoDiscountMinor(BASE, 0), 0);
    assert.equal(promoDiscountMinor(BASE, -100), 0);
  });
});

describe('evaluatePromo', () => {
  it('applies a live code', () => {
    const result = evaluatePromo(BASE, { subtotalMinor: 50000, now: NOW, redemptions: 0 });
    assert.deepEqual(result, { ok: true, code: 'FLAT10', discountMinor: 5000 });
  });

  it('refuses a paused code', () => {
    const result = evaluatePromo({ ...BASE, isActive: false }, { subtotalMinor: 50000, now: NOW, redemptions: 0 });
    assert.deepEqual(result, { ok: false, reason: 'inactive' });
  });

  it('refuses a code that has not started, and one that has ended', () => {
    const future = evaluatePromo(
      { ...BASE, startsAt: new Date('2026-03-16T00:00:00.000Z') },
      { subtotalMinor: 50000, now: NOW, redemptions: 0 },
    );
    assert.deepEqual(future, { ok: false, reason: 'not_started' });

    const ended = evaluatePromo(
      { ...BASE, endsAt: new Date('2026-03-14T00:00:00.000Z') },
      { subtotalMinor: 50000, now: NOW, redemptions: 0 },
    );
    assert.deepEqual(ended, { ok: false, reason: 'expired' });

    // The bound is exclusive: a code that ends exactly now has ended.
    const boundary = evaluatePromo(
      { ...BASE, endsAt: NOW },
      { subtotalMinor: 50000, now: NOW, redemptions: 0 },
    );
    assert.deepEqual(boundary, { ok: false, reason: 'expired' });
  });

  it('refuses a cart under the minimum', () => {
    const result = evaluatePromo(
      { ...BASE, minOrderMinor: 150100 },
      { subtotalMinor: 150000, now: NOW, redemptions: 0 },
    );
    assert.deepEqual(result, { ok: false, reason: 'below_minimum' });

    const met = evaluatePromo(
      { ...BASE, minOrderMinor: 150100 },
      { subtotalMinor: 150100, now: NOW, redemptions: 0 },
    );
    assert.equal(met.ok, true);
  });

  it('refuses a code that has used all of its redemptions', () => {
    const limited: PromoRule = { ...BASE, maxRedemptions: 3 };
    const result = evaluatePromo(limited, { subtotalMinor: 50000, now: NOW, redemptions: 3 });
    assert.deepEqual(result, { ok: false, reason: 'exhausted' });
  });

  it('refuses a live code that would reduce nothing, so it cannot spend a use for free', () => {
    const empty: PromoRule = { ...BASE, kind: 'fixed', percentOff: null, amountOffMinor: 0 };
    const result = evaluatePromo(empty, { subtotalMinor: 50000, now: NOW, redemptions: 0 });
    assert.deepEqual(result, { ok: false, reason: 'no_benefit' });
  });
});
