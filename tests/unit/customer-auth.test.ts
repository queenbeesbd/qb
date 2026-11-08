import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { customerLoginUrl, safeCustomerNext } from '../../src/server/customer-auth/paths';
import { parseDisplayName, parseEmail, parsePassword } from '../../src/server/customer-auth/validation';

/**
 * Customer authentication input rules (ADR 0012).
 *
 * These are pure functions, so the tests are about the rules themselves: what counts as an email, what
 * "absent" means for an optional name, and which return paths a post-authentication redirect may use.
 * The security-critical behaviours that need a database (hashing at rest, token digests, throttling,
 * ban enforcement) are in `tests/db/customer-auth.test.ts`.
 */

describe('customer email parsing', () => {
  it('trims and lower-cases a valid address', () => {
    assert.equal(parseEmail('  Owner@Example.COM '), 'owner@example.com');
  });

  it('rejects anything that is not a plausible address', () => {
    for (const value of ['', '   ', 'no-at-sign', 'a@b', 'a b@example.com', 'a@example', '@example.com', 'a@@b.com']) {
      assert.equal(parseEmail(value), null, value);
    }
  });

  it('rejects a non-string and an over-long address', () => {
    assert.equal(parseEmail(undefined), null);
    assert.equal(parseEmail(42), null);
    assert.equal(parseEmail(`${'a'.repeat(250)}@example.com`), null);
  });
});

describe('customer display name parsing', () => {
  it('treats a blank or missing name as absent, not as an empty string', () => {
    assert.deepEqual(parseDisplayName(undefined), { ok: true, value: null });
    assert.deepEqual(parseDisplayName(''), { ok: true, value: null });
    assert.deepEqual(parseDisplayName('   '), { ok: true, value: null });
  });

  it('collapses whitespace and keeps a real name', () => {
    assert.deepEqual(parseDisplayName('  Rahim   Uddin '), { ok: true, value: 'Rahim Uddin' });
  });

  it('refuses a name over the schema bound instead of truncating it', () => {
    assert.deepEqual(parseDisplayName('x'.repeat(81)), { ok: false });
    assert.deepEqual(parseDisplayName('x'.repeat(80)), { ok: true, value: 'x'.repeat(80) });
  });
});

describe('customer password parsing', () => {
  it('accepts only a non-empty string', () => {
    assert.equal(parsePassword('a-password-value'), 'a-password-value');
    assert.equal(parsePassword(''), null);
    assert.equal(parsePassword(undefined), null);
    assert.equal(parsePassword(123456789), null);
  });
});

describe('customer return paths', () => {
  it('accepts the checkout page and the account tree', () => {
    assert.equal(safeCustomerNext('/checkout'), '/checkout');
    assert.equal(safeCustomerNext('/account'), '/account');
    assert.equal(safeCustomerNext('/account/orders'), '/account/orders');
    assert.equal(safeCustomerNext('/account/orders/QB1234'), '/account/orders/QB1234');
  });

  it('refuses an absolute, protocol-relative or off-tree target', () => {
    for (const value of [
      'https://evil.example/checkout',
      '//evil.example/checkout',
      '/products',
      '/qbpanel',
      'checkout',
      '/checkout/../qbpanel',
      '/account/../qbpanel',
      '',
    ]) {
      assert.equal(safeCustomerNext(value), '/account', value);
    }
  });

  it('refuses backslash and encoded-separator tricks', () => {
    for (const value of ['/account\\admin', '/account%2fadmin', '/checkout%5c..']) {
      assert.equal(safeCustomerNext(value), '/account', value);
    }
  });

  it('drops query and fragment and builds an encoded sign-in URL', () => {
    assert.equal(safeCustomerNext('/checkout?ref=x#y'), '/checkout');
    assert.equal(customerLoginUrl('/checkout'), '/account/login?next=%2Fcheckout');
    assert.equal(customerLoginUrl('/etc/passwd'), '/account/login?next=%2Faccount');
  });
});
