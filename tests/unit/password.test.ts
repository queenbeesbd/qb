import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  hashPassword,
  needsRehash,
  passwordPolicyError,
  verifyPassword,
} from '../../src/server/auth/password';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../src/lib/password-policy';

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
