/**
 * The cart's id mirror (Phase 45b).
 *
 * `/cart` and `/checkout` are drawn from the ids in this cookie instead of from the whole catalog, so
 * the parser is the only thing standing between an untrusted cookie and a page. These tests pin the
 * rules that make it safe: only id-shaped values survive, duplicates collapse, the cart's own line cap
 * bounds the payload, and a truncated or tampered value degrades to a shorter cart - never to an error.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_CART_COOKIE_IDS,
  cartIdsToCookieValue,
  parseCartIds,
} from '@/features/cart/cart-cookie';

const a = '3f2b8c1e-0d4a-4b6f-9a51-2c7e5d1f8b90';
const b = 'a1c4e7f2-6b3d-4f80-8e29-5d0b7a2c9e14';
const c = '0b9d5a3c-7e21-4c68-b3f7-91a6e4d2c805';

describe('cart id mirror', () => {
  it('round-trips ids without quantities or prices', () => {
    const value = cartIdsToCookieValue([
      { productId: a, quantity: 3 },
      { productId: b, quantity: 1 },
    ]);
    assert.equal(value, `${a}.${b}`);
    assert.deepEqual(parseCartIds(value), [a, b]);
    // One value per product, with no second field: a quantity has nowhere to live here.
    assert.equal(value.split('.').length, 2);
  });

  it('reports an empty cart as an empty value, so the cookie can be removed', () => {
    assert.equal(cartIdsToCookieValue([]), '');
    assert.deepEqual(parseCartIds(''), []);
    assert.deepEqual(parseCartIds(undefined), []);
    assert.deepEqual(parseCartIds(null), []);
  });

  it('drops anything that is not id-shaped', () => {
    const value = [a, 'DROP TABLE product', '../../etc/passwd', ' ', '{"productId":"x"}', b].join('.');
    assert.deepEqual(parseCartIds(value), [a, b]);
  });

  it('collapses duplicates, because a product has one line', () => {
    assert.deepEqual(parseCartIds([a, b, a, a, c].join('.')), [a, b, c]);
  });

  it('bounds the payload at the cart\'s own line cap', () => {
    const many = Array.from({ length: MAX_CART_COOKIE_IDS + 20 }, (_, index) =>
      `p${String(index).padStart(5, '0')}`,
    );
    const ids = parseCartIds(many.join('.'));
    assert.equal(ids.length, MAX_CART_COOKIE_IDS);
    assert.equal(ids[0], many[0]);
  });

  it('survives a truncated value rather than throwing', () => {
    const truncated = `${a}.${b.slice(0, 12)}`;
    assert.deepEqual(parseCartIds(truncated), [a, b.slice(0, 12)]);
    // A dangling separator is simply an empty segment.
    assert.deepEqual(parseCartIds(`${a}.`), [a]);
  });
});
