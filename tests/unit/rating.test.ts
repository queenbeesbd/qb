/**
 * Rating arithmetic (ADR 0035).
 *
 * The value that reaches the database is an integer count of half stars, and the value a reader sees
 * is a word ("4.5"). Both directions are pure functions, so they are tested directly: a rounded input
 * would make a product card claim a rating the owner never chose, and a wrong star row would draw a
 * different number than the figure beside it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_PRODUCT_RATING_HALVES,
  MAX_RATING_HALVES,
  MIN_RATING_HALVES,
  RATING_CHOICES,
  formatRating,
  parseRatingHalves,
  starFills,
} from '../../src/lib/rating';

describe('parseRatingHalves', () => {
  it('accepts every half step from one star to five', () => {
    assert.equal(parseRatingHalves('1'), 2);
    assert.equal(parseRatingHalves('1.5'), 3);
    assert.equal(parseRatingHalves('4.5'), 9);
    assert.equal(parseRatingHalves('5'), 10);
    assert.equal(parseRatingHalves(4.5), 9);
    assert.equal(parseRatingHalves(5), 10);
  });

  it('normalises surrounding whitespace and a trailing zero', () => {
    assert.equal(parseRatingHalves(' 4.5 '), 9);
    assert.equal(parseRatingHalves('4.0'), 8);
  });

  it('refuses a value off the half-step grid rather than rounding it', () => {
    assert.equal(parseRatingHalves('4.3'), null);
    assert.equal(parseRatingHalves('4.25'), null);
    assert.equal(parseRatingHalves(4.1), null);
  });

  it('refuses out-of-range, formatted and non-numeric input', () => {
    assert.equal(parseRatingHalves('0'), null);
    assert.equal(parseRatingHalves('0.5'), null);
    assert.equal(parseRatingHalves('5.5'), null);
    assert.equal(parseRatingHalves('4,5'), null);
    assert.equal(parseRatingHalves('★★★★'), null);
    assert.equal(parseRatingHalves(''), null);
    assert.equal(parseRatingHalves(null), null);
    assert.equal(parseRatingHalves(undefined), null);
    assert.equal(parseRatingHalves(Number.NaN), null);
    assert.equal(parseRatingHalves(Number.POSITIVE_INFINITY), null);
  });
});

describe('formatRating', () => {
  it('prints a whole star without a decimal tail', () => {
    assert.equal(formatRating(2), '1');
    assert.equal(formatRating(8), '4');
    assert.equal(formatRating(10), '5');
  });

  it('prints a half star with one decimal', () => {
    assert.equal(formatRating(3), '1.5');
    assert.equal(formatRating(9), '4.5');
  });
});

describe('starFills', () => {
  it('always returns five slots', () => {
    for (const halves of RATING_CHOICES) assert.equal(starFills(halves).length, 5);
  });

  it('draws full, half and empty in order', () => {
    assert.deepEqual(starFills(2), ['full', 'empty', 'empty', 'empty', 'empty']);
    assert.deepEqual(starFills(8), ['full', 'full', 'full', 'full', 'empty']);
    assert.deepEqual(starFills(9), ['full', 'full', 'full', 'full', 'half']);
    assert.deepEqual(starFills(10), ['full', 'full', 'full', 'full', 'full']);
  });

  it('never draws more than one half star', () => {
    for (const halves of RATING_CHOICES) {
      assert.ok(starFills(halves).filter((fill) => fill === 'half').length <= 1);
    }
  });
});

describe('the default', () => {
  it('is four out of five, and is one of the choices the editor offers', () => {
    assert.equal(DEFAULT_PRODUCT_RATING_HALVES, 8);
    assert.equal(formatRating(DEFAULT_PRODUCT_RATING_HALVES), '4');
    assert.ok(RATING_CHOICES.includes(DEFAULT_PRODUCT_RATING_HALVES));
  });
});

describe('the choice list', () => {
  it('covers every half step the parser accepts, and nothing else', () => {
    assert.equal(RATING_CHOICES.length, MAX_RATING_HALVES - MIN_RATING_HALVES + 1);
    assert.deepEqual([...RATING_CHOICES], [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
