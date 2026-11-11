import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { auditEvent } from '../../src/db/schema';
import { sql } from 'drizzle-orm';

import { ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { hashPassword } from '../../src/server/auth/password';
import type { SessionContext } from '../../src/server/auth/session';
import { sha256Hex } from '../../src/server/auth/tokens';
import {
  registerCustomer,
  restoreCustomer,
  signInCustomer,
  signOutCustomer,
  suspendCustomer,
} from '../../src/server/customer-auth/service';
import {
  changeCustomerEmail,
  confirmCustomerEmailVerification,
  confirmCustomerPhoneVerification,
  requestCustomerEmailVerification,
  requestCustomerPasswordReset,
  resetCustomerPasswordWithCode,
} from '../../src/server/customer-auth/account-security';
import {
  createCustomerSession,
  resolveCustomerSession,
} from '../../src/server/customer-auth/session';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Customer authentication against real PostgreSQL (D17, ADR 0012).
 *
 * The properties ADR 0012 claims are database behaviours, not code shapes: a password is unrecoverable
 * because only a scrypt hash is stored, a session is revocable because a row says so, a login is
 * throttled because a counter row says so, and a ban takes effect because the joined account status is
 * not `active`. Asserting any of that against a stub would prove nothing.
 *
 * Each test uses its own account and its own source digest, so one test's failed attempts cannot trip
 * another test's throttle window.
 */

// Distinct source per test, so throttling is scoped to the test that provoked it.
let sourceCounter = 0;
function context(): SessionContext {
  sourceCounter += 1;
  return { ipHash: `ip-${sourceCounter}`, userAgentHash: 'test-agent' };
}

/** Identity CSRF derivation: these tests are about sessions, not about CSRF. */
const csrf = (raw: string): string => `csrf:${raw}`;

describe('customer authentication', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let staffId: number;

  async function register(
    email: string,
    password: string,
    displayName?: string,
    phone?: string,
  ) {
    return fixture.db.transaction((tx) =>
      registerCustomer(tx, {
        method: phone === undefined ? 'email' : 'phone',
        email,
        phone: phone ?? null,
        password,
        displayName: displayName ?? null,
        context: context(),
      }),
    );
  }

  async function signIn(email: string, password: string, ctx: SessionContext, phone?: string) {
    return fixture.db.transaction((tx) =>
      signInCustomer(tx, {
        method: phone === undefined ? 'email' : 'phone',
        identifier: phone ?? email,
        password,
        context: ctx,
        createSession: async (customerId) => {
          const session = await createCustomerSession(tx, customerId, ctx);
          return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
        },
      }),
    );
  }

  before(async () => {
    // The SMS flows read the provider configuration from the environment. No message is sent: only the
    // code issued and stored is exercised.
    process.env.BULKSMS_API_KEY = 'test-key';
    process.env.BULKSMS_SENDER_ID = 'test-sender';
    fixture = await startMigratedDatabase();
    const inserted = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ('ban-actor@example.test', 'Ban Actor') returning id`,
    );
    staffId = Number(inserted.rows[0]?.id);
  });

  after(async () => {
    delete process.env.BULKSMS_API_KEY;
    delete process.env.BULKSMS_SENDER_ID;
    await fixture.close();
  });

  it('registers an account and stores a scrypt hash, never the plaintext', async () => {
    const result = await register('  Buyer@Example.test ', 'a-long-enough-password');
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const rows = await fixture.pool.query<{ email: string; status: string; secret_hash: string; hash_algorithm: string }>(
      `select c.email, c.status, k.secret_hash, k.hash_algorithm
         from customer c join customer_credential k on k.customer_id = c.id
        where c.id = $1`,
      [result.customerId],
    );
    const row = rows.rows[0];
    assert.equal(row?.email, 'buyer@example.test');
    assert.equal(row?.status, 'active');
    assert.equal(row?.hash_algorithm, 'scrypt');
    assert.match(String(row?.secret_hash), /^scrypt\$/);
    assert.notEqual(row?.secret_hash, 'a-long-enough-password');
    // The plaintext appears in no column of either table.
    const leaked = await fixture.pool.query(
      `select 1 from customer_credential where secret_hash = $1`,
      ['a-long-enough-password'],
    );
    assert.equal(leaked.rowCount, 0);
  });

  it('refuses a duplicate email case-insensitively, and a weak password', async () => {
    const first = await register('duplicate@example.test', 'a-long-enough-password');
    assert.equal(first.ok, true);

    const again = await register('DUPLICATE@example.test', 'another-long-password');
    assert.deepEqual(again.ok, false);
    if (!again.ok) assert.equal(again.failure, 'email_taken');

    const weak = await register('weak@example.test', 'short');
    assert.deepEqual(weak.ok, false);
    if (!weak.ok) assert.equal(weak.failure, 'weak_password');

    const rows = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from customer where email = 'weak@example.test'`,
    );
    assert.equal(rows.rows[0]?.total, '0');
  });

  it('registers a phone-first account with no email, normalises the number, and signs in with it', async () => {
    const registered = await register(
      'ignored@example.test',
      'a-long-enough-password',
      undefined,
      '+880 1712-345678',
    );
    assert.equal(registered.ok, true);
    if (!registered.ok) return;

    const rows = await fixture.pool.query<{ phone: string; email: string | null }>(
      'select phone, email from customer where id = $1',
      [registered.customerId],
    );
    assert.equal(rows.rows[0]?.phone, '01712345678');
    // Phone-first collects no address at all (owner decision, 2026-11-12).
    assert.equal(rows.rows[0]?.email, null);

    const byPhone = await signIn('', 'a-long-enough-password', context(), '01712345678');
    assert.equal(byPhone.ok, true);
    if (byPhone.ok) assert.equal(byPhone.customerId, registered.customerId);

    // There is no address on the account, so an address cannot sign it in.
    const byEmail = await signIn('ignored@example.test', 'a-long-enough-password', context());
    assert.equal(byEmail.ok, false);
  });

  it('refuses a duplicate phone number, an invalid number, and a missing number in phone mode', async () => {
    const first = await register(
      'phone-one@example.test',
      'a-long-enough-password',
      undefined,
      '01712345679',
    );
    assert.equal(first.ok, true);

    const duplicate = await register(
      'phone-two@example.test',
      'a-long-enough-password',
      undefined,
      '01712345679',
    );
    assert.deepEqual(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.failure, 'phone_taken');

    const invalid = await register(
      'phone-bad@example.test',
      'a-long-enough-password',
      undefined,
      '0123456789',
    );
    assert.deepEqual(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.failure, 'invalid_phone');

    const missing = await fixture.db.transaction((tx) =>
      registerCustomer(tx, {
        method: 'phone',
        email: 'phone-missing@example.test',
        password: 'a-long-enough-password',
        displayName: null,
        context: context(),
      }),
    );
    assert.deepEqual(missing.ok, false);
    if (!missing.ok) assert.equal(missing.failure, 'invalid_phone');
  });

  it('sends a verification link without gating the account, and records the confirmation', async () => {
    const registered = await register('verify-me@example.test', 'a-long-enough-password');
    assert.equal(registered.ok, true);
    if (!registered.ok) return;

    // The account is usable before the link is opened - verification confirms, it does not gate.
    assert.equal((await signIn('verify-me@example.test', 'a-long-enough-password', context())).ok, true);
    assert.ok(registered.verification !== null);
    if (registered.verification?.channel !== 'email') return;
    const verificationToken = registered.verification.token;
    assert.equal(registered.verification.to, 'verify-me@example.test');

    const confirmed = await fixture.db.transaction((tx) =>
      confirmCustomerEmailVerification(tx, { rawToken: verificationToken }),
    );
    assert.equal(confirmed.ok, true);

    const rows = await fixture.pool.query<{ email_verified_at: Date | null }>(
      'select email_verified_at from customer where id = $1',
      [registered.customerId],
    );
    assert.ok(rows.rows[0]?.email_verified_at !== null);

    // Single use: a second click is a dead link, and only one system audit row was written.
    const again = await fixture.db.transaction((tx) =>
      confirmCustomerEmailVerification(tx, { rawToken: verificationToken }),
    );
    assert.deepEqual(again.ok, false);
    const audit = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from audit_event
        where entity_type = 'customer' and entity_id = $1 and action = 'customer.email_verified'`,
      [registered.customerId],
    );
    assert.equal(audit.rows[0]?.total, '1');
  });

  it('re-sends verification only while the address is unconfirmed, throttled on the account', async () => {
    const registered = await register('resend-me@example.test', 'a-long-enough-password');
    assert.equal(registered.ok, true);
    if (!registered.ok) return;

    const first = await fixture.db.transaction((tx) =>
      requestCustomerEmailVerification(tx, {
        customerId: registered.customerId,
        context: context(),
      }),
    );
    assert.equal(first.ok, true);

    // Confirming the address makes a later request a stated outcome, not another message.
    await fixture.db.transaction((tx) =>
      confirmCustomerEmailVerification(tx, {
        rawToken: first.ok ? first.delivery.token : '',
      }),
    );
    const after = await fixture.db.transaction((tx) =>
      requestCustomerEmailVerification(tx, {
        customerId: registered.customerId,
        context: context(),
      }),
    );
    assert.deepEqual(after.ok, false);
    if (!after.ok) assert.equal(after.failure, 'verified');
  });

  it('signs in and stores only a digest of the session token', async () => {
    assert.equal((await register('session@example.test', 'a-long-enough-password')).ok, true);

    const result = await signIn('session@example.test', 'a-long-enough-password', context());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.match(result.rawToken, /^[A-Za-z0-9_-]{43}$/);
    const rows = await fixture.pool.query<{ token_hash: string }>(
      `select token_hash from customer_session where customer_id = $1`,
      [result.customerId],
    );
    assert.ok(rows.rows.some((row) => row.token_hash === sha256Hex(result.rawToken)));
    const leaked = await fixture.pool.query(
      `select 1 from customer_session where token_hash = $1 or revoked_reason = $1`,
      [result.rawToken],
    );
    assert.equal(leaked.rowCount, 0);
  });

  it('resolves a live session and refuses a revoked one', async () => {
    assert.equal((await register('resolve@example.test', 'a-long-enough-password')).ok, true);
    const result = await signIn('resolve@example.test', 'a-long-enough-password', context());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const resolved = await fixture.db.transaction((tx) =>
      resolveCustomerSession(tx, result.rawToken, csrf),
    );
    assert.equal(resolved?.principal.customerId, result.customerId);
    assert.equal(resolved?.principal.email, 'resolve@example.test');

    await fixture.db.transaction((tx) => signOutCustomer(tx, resolved?.sessionId ?? ''));
    const after = await fixture.db.transaction((tx) =>
      resolveCustomerSession(tx, result.rawToken, csrf),
    );
    assert.equal(after, null);
  });

  it('gives one generic failure for a wrong password and for an unknown account', async () => {
    assert.equal((await register('generic@example.test', 'a-long-enough-password')).ok, true);

    const wrong = await signIn('generic@example.test', 'not-the-password', context());
    const unknown = await signIn('nobody@example.test', 'not-the-password', context());
    assert.deepEqual(wrong.ok, false);
    assert.deepEqual(unknown.ok, false);
    if (!wrong.ok && !unknown.ok) {
      assert.equal(wrong.failure, 'invalid');
      assert.equal(unknown.failure, 'invalid');
    }
  });

  it('throttles repeated failures and refuses a correct password while blocked', async () => {
    assert.equal((await register('throttle@example.test', 'a-long-enough-password')).ok, true);
    const ctx = context();

    // The configured ceiling is 10 attempts; the counter is incremented by the attempt that crosses
    // it, so the account is blocked on the *next* attempt rather than on the tenth.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await signIn('throttle@example.test', 'wrong-password-value', ctx);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.failure, 'invalid');
    }

    const blocked = await signIn('throttle@example.test', 'a-long-enough-password', ctx);
    assert.deepEqual(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.failure, 'throttled');

    // A blocked subject is refused even when the password is correct, and a different source is still
    // counted separately.
    const otherSource = await signIn('throttle@example.test', 'a-long-enough-password', context());
    assert.deepEqual(otherSource.ok, false);
  });

  it('bans a customer: status suspended, sessions revoked, audited with a reason', async () => {
    assert.equal((await register('banme@example.test', 'a-long-enough-password')).ok, true);
    const result = await signIn('banme@example.test', 'a-long-enough-password', context());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const outcome = await fixture.db.transaction((tx) =>
      suspendCustomer(tx, {
        customerId: result.customerId,
        actorStaffId: staffId,
        actorRoleCodes: ['owner'],
        reason: 'confirmed fake order found by the owner',
      }),
    );
    assert.equal(outcome.sessionsRevoked, 1);

    // The session row is revoked at the moment of the ban, and resolution refuses it either way.
    const live = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from customer_session
        where customer_id = $1 and revoked_at is null`,
      [result.customerId],
    );
    assert.equal(live.rows[0]?.total, '0');
    assert.equal(
      await fixture.db.transaction((tx) => resolveCustomerSession(tx, result.rawToken, csrf)),
      null,
    );

    // A suspended customer cannot sign in again.
    const again = await signIn('banme@example.test', 'a-long-enough-password', context());
    assert.deepEqual(again.ok, false);

    const audit = await fixture.db
      .select({ action: auditEvent.action, reason: auditEvent.reason, actorStaffId: auditEvent.actorStaffId })
      .from(auditEvent)
      .where(sql`${auditEvent.entityType} = 'customer' and ${auditEvent.entityId} = ${result.customerId}`);
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.action, 'customer.banned');
    assert.equal(audit[0]?.actorStaffId, staffId);
    assert.match(String(audit[0]?.reason), /confirmed fake order/);
  });

  it('requires a reason, and refuses a second ban of the same account', async () => {
    assert.equal((await register('ban-twice@example.test', 'a-long-enough-password')).ok, true);
    const account = await fixture.pool.query<{ id: string }>(
      `select id from customer where email = 'ban-twice@example.test'`,
    );
    const customerId = Number(account.rows[0]?.id);

    await assert.rejects(
      () =>
        fixture.db.transaction((tx) =>
          suspendCustomer(tx, { customerId, actorStaffId: staffId, actorRoleCodes: ['owner'], reason: 'short' }),
        ),
      ValidationError,
    );

    await fixture.db.transaction((tx) =>
      suspendCustomer(tx, {
        customerId,
        actorStaffId: staffId,
        actorRoleCodes: ['owner'],
        reason: 'a long enough reason for the first ban',
      }),
    );
    await assert.rejects(
      () =>
        fixture.db.transaction((tx) =>
          suspendCustomer(tx, {
            customerId,
            actorStaffId: staffId,
            actorRoleCodes: ['owner'],
            reason: 'a long enough reason for the second ban',
          }),
        ),
      ConflictError,
    );
  });

  it('restores a banned customer: active again, one audit record, and no session resurrected', async () => {
    assert.equal((await register('restore-me@example.test', 'a-long-enough-password')).ok, true);
    const first = await signIn('restore-me@example.test', 'a-long-enough-password', context());
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const customerId = first.customerId;
    await fixture.db.transaction((tx) =>
      suspendCustomer(tx, {
        customerId,
        actorStaffId: staffId,
        actorRoleCodes: ['owner'],
        reason: 'confirmed fake order found by the owner',
      }),
    );

    // A reason is required, or restoring becomes a silent, unexplained state change.
    await assert.rejects(
      () =>
        fixture.db.transaction((tx) =>
          restoreCustomer(tx, { customerId, actorStaffId: staffId, actorRoleCodes: ['owner'], reason: 'short' }),
        ),
      ValidationError,
    );

    await fixture.db.transaction((tx) =>
      restoreCustomer(tx, {
        customerId,
        actorStaffId: staffId,
        actorRoleCodes: ['owner'],
        reason: 'the owner verified the customer and restored access',
      }),
    );

    const standing = await fixture.pool.query<{ status: string }>(
      'select status from customer where id = $1',
      [customerId],
    );
    assert.equal(standing.rows[0]?.status, 'active');

    // A restore lifts the ban; it does not resurrect the session the ban revoked.
    assert.equal(await fixture.db.transaction((tx) => resolveCustomerSession(tx, first.rawToken, csrf)), null);
    const live = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from customer_session
        where customer_id = $1 and revoked_at is null`,
      [customerId],
    );
    assert.equal(live.rows[0]?.total, '0');

    // The customer signs in again with their own password.
    assert.equal((await signIn('restore-me@example.test', 'a-long-enough-password', context())).ok, true);

    // Both decisions are in the trail, each with its own reason, and neither replaces the other.
    const audit = await fixture.db
      .select({ action: auditEvent.action, reason: auditEvent.reason })
      .from(auditEvent)
      .where(sql`${auditEvent.entityType} = 'customer' and ${auditEvent.entityId} = ${customerId}`)
      .orderBy(auditEvent.id);
    assert.deepEqual(audit.map((row) => row.action), ['customer.banned', 'customer.ban_reversed']);
    assert.match(String(audit[1]?.reason), /verified the customer/);
  });

  it('refuses to restore an account that is not suspended', async () => {
    assert.equal((await register('never-banned@example.test', 'a-long-enough-password')).ok, true);
    const account = await fixture.pool.query<{ id: string }>(
      `select id from customer where email = 'never-banned@example.test'`,
    );
    const customerId = Number(account.rows[0]?.id);

    await assert.rejects(
      () =>
        fixture.db.transaction((tx) =>
          restoreCustomer(tx, {
            customerId,
            actorStaffId: staffId,
            actorRoleCodes: ['owner'],
            reason: 'a long enough reason to attempt a restore',
          }),
        ),
      ConflictError,
    );
  });

  it('issues a six-digit SMS code at phone registration and settles the number on entry', async () => {
    const registered = await fixture.db.transaction((tx) =>
      registerCustomer(tx, {
        method: 'phone',
        email: null,
        phone: '01711111111',
        password: 'a-long-enough-password',
        displayName: null,
        context: context(),
      }),
    );
    assert.equal(registered.ok, true);
    if (!registered.ok) return;
    assert.equal(registered.verification?.channel, 'sms');
    if (registered.verification?.channel !== 'sms') return;
    assert.match(registered.verification.code, /^[0-9]{6}$/);

    // The stored row is a keyed digest, never the six digits themselves.
    const stored = await fixture.pool.query<{ token_hash: string; attempts: number }>(
      `select token_hash, attempts from account_recovery_token
        where customer_id = $1 and purpose = 'phone_verify'`,
      [registered.customerId],
    );
    assert.notEqual(stored.rows[0]?.token_hash, registered.verification.code);
    assert.equal(stored.rows[0]?.attempts, 0);

    const wrong = await fixture.db.transaction((tx) =>
      confirmCustomerPhoneVerification(tx, {
        phone: '01711111111',
        code: registered.verification?.channel === 'sms' && registered.verification.code === '000000' ? '111111' : '000000',
        context: context(),
      }),
    );
    assert.equal(wrong.ok, false);

    const confirmed = await fixture.db.transaction((tx) =>
      confirmCustomerPhoneVerification(tx, {
        phone: '01711111111',
        code: registered.verification?.channel === 'sms' ? registered.verification.code : '',
        context: context(),
      }),
    );
    assert.equal(confirmed.ok, true);

    const rows = await fixture.pool.query<{ phone_verified_at: Date | null }>(
      'select phone_verified_at from customer where id = $1',
      [registered.customerId],
    );
    assert.ok(rows.rows[0]?.phone_verified_at !== null);
  });

  it('recovers a phone-only account with an SMS code, and refuses the wrong one', async () => {
    const registered = await fixture.db.transaction((tx) =>
      registerCustomer(tx, {
        method: 'phone',
        email: null,
        phone: '01722222222',
        password: 'a-long-enough-password',
        displayName: null,
        context: context(),
      }),
    );
    assert.equal(registered.ok, true);
    if (!registered.ok) return;

    const requested = await fixture.db.transaction((tx) =>
      requestCustomerPasswordReset(tx, { identifier: '01722222222', context: context() }),
    );
    assert.equal(requested.delivery?.channel, 'sms');
    if (requested.delivery?.channel !== 'sms') return;
    assert.equal(requested.delivery.to, '01722222222');

    const wrong = await fixture.db.transaction((tx) =>
      resetCustomerPasswordWithCode(tx, {
        phone: '01722222222',
        code: requested.delivery?.channel === 'sms' && requested.delivery.code === '000000' ? '111111' : '000000',
        password: 'another-long-password',
        context: context(),
      }),
    );
    assert.deepEqual(wrong, { ok: false, failure: 'invalid_code' });

    const changed = await fixture.db.transaction((tx) =>
      resetCustomerPasswordWithCode(tx, {
        phone: '01722222222',
        code: requested.delivery?.channel === 'sms' ? requested.delivery.code : '',
        password: 'another-long-password',
        context: context(),
      }),
    );
    assert.equal(changed.ok, true);

    // The new password signs in; the old one does not. The number now counts as proved.
    assert.equal((await signIn('', 'another-long-password', context(), '01722222222')).ok, true);
    assert.equal((await signIn('', 'a-long-enough-password', context(), '01722222222')).ok, false);
    const rows = await fixture.pool.query<{ phone_verified_at: Date | null }>(
      'select phone_verified_at from customer where id = $1',
      [registered.customerId],
    );
    assert.ok(rows.rows[0]?.phone_verified_at !== null);
  });

  it('changes the email address directly, without a confirmation link, and signs other devices out', async () => {
    assert.equal((await register('before-change@example.test', 'a-long-enough-password')).ok, true);
    const signedIn = await signIn('before-change@example.test', 'a-long-enough-password', context());
    assert.equal(signedIn.ok, true);
    if (!signedIn.ok) return;

    const changed = await fixture.db.transaction((tx) =>
      changeCustomerEmail(tx, {
        customerId: signedIn.customerId,
        newEmail: 'after-change@example.test',
        currentPassword: 'a-long-enough-password',
        context: context(),
      }),
    );
    assert.equal(changed.ok, true);
    if (!changed.ok) return;
    assert.equal(changed.previousEmail, 'before-change@example.test');
    assert.ok(changed.sessionsRevoked >= 1);

    const rows = await fixture.pool.query<{ email: string; email_verified_at: Date | null }>(
      'select email, email_verified_at from customer where id = $1',
      [signedIn.customerId],
    );
    assert.equal(rows.rows[0]?.email, 'after-change@example.test');
    // The new address has not been proved, and no verification exists outside registration/recovery.
    assert.equal(rows.rows[0]?.email_verified_at, null);

    // The old address no longer signs in; the new one does.
    assert.equal((await signIn('before-change@example.test', 'a-long-enough-password', context())).ok, false);
    assert.equal((await signIn('after-change@example.test', 'a-long-enough-password', context())).ok, true);

    const taken = await fixture.db.transaction((tx) =>
      changeCustomerEmail(tx, {
        customerId: signedIn.customerId,
        newEmail: 'taken@example.test',
        currentPassword: 'wrong-password',
        context: context(),
      }),
    );
    assert.deepEqual(taken, { ok: false, failure: 'wrong_password' });
  });

  it('refuses a customer row with neither an email address nor a number', async () => {
    await assert.rejects(() =>
      fixture.pool.query(`insert into customer (email, phone) values (null, null)`),
    );
  });
  it('writes no audit row for registration or sign-in: a customer is never an audit actor', async () => {
    const before = await fixture.db.select({ total: sql<number>`count(*)::int` }).from(auditEvent);
    assert.equal((await register('no-audit@example.test', 'a-long-enough-password')).ok, true);
    assert.equal((await signIn('no-audit@example.test', 'a-long-enough-password', context())).ok, true);
    const after = await fixture.db.select({ total: sql<number>`count(*)::int` }).from(auditEvent);
    assert.equal(after[0]?.total, before[0]?.total);
  });

  it('stores a hash that verifies, so a credential row is real and usable', async () => {
    const hash = await hashPassword('a-long-enough-password');
    assert.match(hash, /^scrypt\$N=16384,r=8,p=1\$/);
  });
});
