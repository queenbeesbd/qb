import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createOpaqueToken,
  deriveCsrfToken,
  looksLikeToken,
  normalizeEmail,
  safeEqual,
  sha256Hex,
} from '../../src/server/auth/tokens';

describe('token primitives', () => {
  it('creates 256 bits of base64url entropy, and never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createOpaqueToken()));
    assert.equal(tokens.size, 200);
    for (const token of tokens) {
      assert.equal(token.length, 43);
      assert.match(token, /^[A-Za-z0-9_-]+$/);
      assert.equal(looksLikeToken(token), true);
    }
  });

  it('rejects values that are not token-shaped before any lookup', () => {
    for (const value of ['', 'short', 'a'.repeat(44), 'a'.repeat(42), 'x'.repeat(43).replace('x', '+')]) {
      assert.equal(looksLikeToken(value), false, `value: ${value}`);
    }
  });

  it('hashes deterministically, so a stored digest is the only lookup path', () => {
    const token = createOpaqueToken();
    assert.equal(sha256Hex(token), sha256Hex(token));
    assert.match(sha256Hex(token), /^[0-9a-f]{64}$/);
    assert.notEqual(sha256Hex(token), sha256Hex(`${token}x`));
  });

  it('derives a CSRF token that is stable per session and different across sessions', () => {
    const a = createOpaqueToken();
    const b = createOpaqueToken();
    assert.equal(deriveCsrfToken(a), deriveCsrfToken(a));
    assert.notEqual(deriveCsrfToken(a), deriveCsrfToken(b));
    assert.match(deriveCsrfToken(a), /^[0-9a-f]{64}$/);
  });

  it('does not leak the session token into the derived CSRF token', () => {
    const raw = createOpaqueToken();
    assert.ok(!deriveCsrfToken(raw).includes(raw));
  });

  it('compares secrets without throwing on a length mismatch, and fails closed', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
    assert.equal(safeEqual('', ''), false);
    assert.equal(safeEqual('abc', ''), false);
  });

  it('normalises an email for lookup without losing the original form', () => {
    assert.equal(normalizeEmail('  Staff@Example.COM '), 'staff@example.com');
  });
});
