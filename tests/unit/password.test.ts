import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  customerPasswordPolicyError,
  hashPassword,
  needsRehash,
  passwordPolicyError,
  verifyPassword,
} from '../../src/server/auth/password';
import {
  CUSTOMER_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../src/lib/password-policy';

describe('staff password hashing', () => {
  it('accepts the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('correct horse battery stapl', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  it('produces a different hash for the same password each time (per-row salt)', async () => {
    const first = await hashPassword('a-long-enough-password');
    const second = await hashPassword('a-long-enough-password');
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('a-long-enough-password', first), true);
    assert.equal(await verifyPassword('a-long-enough-password', second), true);
  });

  it('stores the algorithm and parameters, so a cost change does not invalidate credentials', async () => {
    const hash = await hashPassword('a-long-enough-password');
    assert.match(hash, /^scrypt\$N=\d+,r=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('never stores the password in the hash', async () => {
    const password = 'unique-marker-3f9c1d2b';
    const hash = await hashPassword(password);
    assert.ok(!hash.includes(password));
    assert.ok(!Buffer.from(hash.split('$')[3] ?? '', 'base64url').toString('utf8').includes(password));
  });

  it('fails closed on a malformed or unrecognised stored hash', async () => {
    for (const stored of [
      '',
      'not-a-hash',
      'scrypt$N=16384,r=8,p=1$onlythreeparts',
      'bcrypt$N=16384,r=8,p=1$c2FsdA$a2V5',
      'scrypt$N=3,r=8,p=1$c2FsdA$a2V5',
      'scrypt$N=0,r=8,p=1$c2FsdA$a2V5',
    ]) {
      assert.equal(await verifyPassword('a-long-enough-password', stored), false, `stored: ${stored}`);
    }
  });

  it('reports a weaker stored cost as needing a rehash, and the current cost as not', async () => {
    assert.equal(needsRehash(await hashPassword('a-long-enough-password')), false);
    assert.equal(needsRehash('scrypt$N=16384,r=8,p=1$c2FsdA$a2V5'), false);
    assert.equal(needsRehash('scrypt$N=1024,r=8,p=1$c2FsdA$a2V5'), true);
    assert.equal(needsRehash('scrypt$N=16384,r=4,p=1$c2FsdA$a2V5'), true);
    assert.equal(needsRehash('garbage'), true);
  });

  it('enforces a length-only policy, with a bound that keeps hashing cost finite', () => {
    assert.equal(passwordPolicyError('a'.repeat(PASSWORD_MIN_LENGTH)), null);
    assert.equal(passwordPolicyError('a'.repeat(PASSWORD_MAX_LENGTH)), null);
    assert.equal(passwordPolicyError('a'.repeat(PASSWORD_MIN_LENGTH - 1)), 'too_short');
    assert.equal(passwordPolicyError('a'.repeat(PASSWORD_MAX_LENGTH + 1)), 'too_long');
  });
});

describe('stored-hash parser hardening (F10)', () => {
  const SALT = Buffer.alloc(16, 1).toString('base64url');
  const KEY = Buffer.alloc(32, 2).toString('base64url');
  const password = 'a-long-enough-password';
  const hashWith = (parameters: string, salt = SALT, key = KEY) => `scrypt$${parameters}$${salt}$${key}`;

  /** A corrupt row must fail closed - `false`, never an exception the route would turn into a 500. */
  const expectRefusal = async (stored: string) => {
    assert.equal(await verifyPassword(password, stored), false, `stored: ${stored.slice(0, 90)}`);
  };

  it('refuses a derived key that decodes to zero bytes instead of reaching scrypt with keylen 0', async () => {
    // Before the fix this threw inside scrypt: an unhandled error rather than a failed sign-in.
    await expectRefusal(hashWith('N=16384,r=8,p=1', SALT, ''));
  });

  it('refuses an oversized N, and reports it as needing a rehash rather than accepting it', async () => {
    await expectRefusal(hashWith('N=1073741824,r=8,p=1'));
    await expectRefusal(hashWith(`N=${1 << 19},r=8,p=1`));
    assert.equal(needsRehash(hashWith('N=1073741824,r=8,p=1')), true);
  });

  it('refuses a working set above the ceiling, and out-of-range r or p', async () => {
    // Each of these is inside the individual ceilings on its own, so the product bound is what refuses
    // it: 128 * 131072 * 32 is 512 MiB.
    await expectRefusal(hashWith('N=131072,r=32,p=1'));
    await expectRefusal(hashWith('N=16384,r=64,p=1'));
    await expectRefusal(hashWith('N=16384,r=8,p=1000'));
  });

  it('refuses a cost below the minimum scrypt accepts, and non-positive parameters', async () => {
    await expectRefusal(hashWith('N=1,r=8,p=1'));
    await expectRefusal(hashWith('N=2,r=0,p=1'));
    await expectRefusal(hashWith('N=16384,r=8,p=0'));
  });

  it('refuses a derived key or salt of the wrong length', async () => {
    await expectRefusal(hashWith('N=16384,r=8,p=1', SALT, Buffer.alloc(16, 3).toString('base64url')));
    await expectRefusal(hashWith('N=16384,r=8,p=1', Buffer.alloc(8, 4).toString('base64url'), KEY));
    await expectRefusal(hashWith('N=16384,r=8,p=1', SALT, 'A'.repeat(21)));
  });

  it('refuses a field that is not canonical base64url, which a lenient decoder would accept', async () => {
    await expectRefusal(hashWith('N=16384,r=8,p=1', SALT, 'a+b/c='));
    await expectRefusal(hashWith('N=16384,r=8,p=1', `${SALT}=`, KEY));
    await expectRefusal(hashWith('N=16384,r=8,p=1', SALT, 'not base64!'));
  });

  it('refuses an oversized stored value without decoding it', async () => {
    await expectRefusal(`scrypt$N=16384,r=8,p=1$${'A'.repeat(600)}`);
  });

  it('still parses a cost raised above the current parameters, so a future increase needs no parser change', () => {
    // 128 * 131072 * 8 is 128 MiB: at the ceiling, and accepted. `needsRehash` is false because it is
    // stronger than the current cost, which is what an upgrade path depends on.
    assert.equal(needsRehash(hashWith('N=131072,r=8,p=1')), false);
  });

  it('still verifies a real hash produced by this module', async () => {
    assert.equal(await verifyPassword(password, await hashPassword(password)), true);
  });
});

/**
 * The customer rule (2026-11-08): eight characters, and at least one letter or special character.
 *
 * The staff rule above is deliberately untouched - an administrative credential still needs twelve -
 * so both policies are asserted here side by side, which is also the guard against one drifting into
 * the other by accident.
 */
describe('customer password policy', () => {
  it('accepts eight characters when they include a letter', () => {
    assert.equal(CUSTOMER_PASSWORD_MIN_LENGTH, 8);
    assert.equal(customerPasswordPolicyError('abcdefgh'), null);
    assert.equal(customerPasswordPolicyError('abc12345'), null);
    assert.equal(customerPasswordPolicyError('a1!2#4%6'), null);
  });

  it('accepts eight characters when the non-digit is a symbol', () => {
    assert.equal(customerPasswordPolicyError('1234!678'), null);
    assert.equal(customerPasswordPolicyError('1111!222'), null);
    assert.equal(customerPasswordPolicyError('1111 222'), 'needs_letter_or_symbol', 'whitespace is not a symbol');
  });

  it('refuses anything shorter than eight', () => {
    assert.equal(customerPasswordPolicyError('abcdefg'), 'too_short');
    assert.equal(customerPasswordPolicyError('1234567'), 'too_short');
    assert.equal(customerPasswordPolicyError(''), 'too_short');
  });

  it('refuses a digits-only password of any length', () => {
    assert.equal(customerPasswordPolicyError('12345678'), 'needs_letter_or_symbol');
    assert.equal(customerPasswordPolicyError('01712345678'), 'needs_letter_or_symbol');
  });

  it('counts a Bengali letter as a letter', () => {
    assert.equal(customerPasswordPolicyError('পাসওয়ার্ড'), null);
    assert.equal(customerPasswordPolicyError('১২৩৪৫৬৭৮'), 'needs_letter_or_symbol');
  });

  it('keeps the upper bound that makes hashing cost finite', () => {
    assert.equal(customerPasswordPolicyError('a'.repeat(PASSWORD_MAX_LENGTH)), null);
    assert.equal(customerPasswordPolicyError('a'.repeat(PASSWORD_MAX_LENGTH + 1)), 'too_long');
  });

  it('is a different rule from the staff policy', () => {
    // Eight letters pass for a customer and remain too short for an owner or staff account.
    assert.equal(customerPasswordPolicyError('abcdefgh'), null);
    assert.equal(passwordPolicyError('abcdefgh'), 'too_short');
  });
});
