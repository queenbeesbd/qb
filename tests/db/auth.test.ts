import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { seedReferenceData } from '../../src/db/seed';
import { permission, role, rolePermission } from '../../src/db/schema';
import { recordAudit } from '../../src/server/auth/audit';
import { SESSION_IDLE_MS, SESSION_ABSOLUTE_MS } from '../../src/server/auth/constants';
import { hashPassword } from '../../src/server/auth/password';
import { redeemCredentialToken, signIn } from '../../src/server/auth/service';
import {
  createStaffSession,
  resolveStaffSession,
  revokeSession,
  type SessionContext,
} from '../../src/server/auth/session';
import { sha256Hex } from '../../src/server/auth/tokens';
import { loadStaffPermissions, loadStaffRoles } from '../../src/server/authz/roles';
import { OWNER_ROLE, PERMISSION_CATALOGUE, PERMISSIONS } from '../../src/server/authz/permissions';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Staff authentication against real PostgreSQL.
 *
 * These tests exist because the security properties Phase 12 claims are database behaviours, not code
 * shapes: a session is revocable because a row says so, a token is unrecoverable because only a digest
 * is stored, and a login is throttled because a counter row says so. Asserting them against a stub
 * would prove nothing.
 */

/**
 * A token-shaped literal of exactly 43 characters.
 *
 * Built rather than typed so the length is a property of the helper, not of a hand-counted string -
 * `looksLikeToken` rejects anything else, and a miscount would silently test the rejection path.
 */
function tokenLiteral(seed: string): string {
  return seed.padEnd(43, 'x').slice(0, 43);
}

const CONTEXT: SessionContext = { ipHash: 'test-ip-hash', userAgentHash: 'test-ua-hash' };
const OTHER_CONTEXT: SessionContext = { ipHash: 'other-ip-hash', userAgentHash: 'other-ua-hash' };

describe('staff authentication', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let ownerId: number;

  /** Creates an active staff user with a known password and returns its id. */
  async function createStaff(
    email: string,
    password: string,
    displayName = 'Test Staff',
  ): Promise<number> {
    const inserted = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ($1, $2) returning id`,
      [email, displayName],
    );
    const id = Number(inserted.rows[0]?.id);
    await fixture.pool.query(
      `insert into staff_credential (staff_user_id, kind, secret_hash, hash_algorithm)
       values ($1, 'password', $2, 'scrypt')`,
      [id, await hashPassword(password)],
    );
    const ownerRole = await fixture.pool.query<{ id: string }>(
      `select id from role where code = $1`,
      [OWNER_ROLE.code],
    );
    const roleId = ownerRole.rows[0]?.id;
    if (roleId !== undefined) {
      await fixture.pool.query(
        `insert into staff_role (staff_user_id, role_id, granted_by) values ($1, $2, $1)`,
        [id, roleId],
      );
    }
    return id;
  }

  async function signInAs(email: string, password: string, context = CONTEXT) {
    return fixture.db.transaction((tx) =>
      signIn(tx, {
        email,
        password,
        context,
        createSession: async (staffUserId) => {
          const session = await createStaffSession(tx, staffUserId, context);
          return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
        },
      }),
    );
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    await seedReferenceData();
    ownerId = await createStaff('owner@example.test', 'owner-password-1', 'Owner');
  });

  after(async () => {
    await fixture.close();
  });

  it('seeds the whole permission catalogue and exactly one owner-level role', async () => {
    const permissions = await fixture.db.select({ code: permission.code }).from(permission);
    assert.equal(permissions.length, PERMISSION_CATALOGUE.length);

    const roles = await fixture.db.select({ code: role.code, isOwnerLevel: role.isOwnerLevel }).from(role);
    assert.deepEqual(roles, [{ code: OWNER_ROLE.code, isOwnerLevel: true }]);

    const grants = await fixture.db.select({ roleId: rolePermission.roleId }).from(rolePermission);
    assert.equal(grants.length, PERMISSION_CATALOGUE.length);
  });

  it('is idempotent: re-seeding adds nothing and removes nothing', async () => {
    const before = await fixture.db.select({ id: rolePermission.permissionId }).from(rolePermission);
    const report = await seedReferenceData();
    assert.equal(report.permissionsInserted, 0);
    assert.equal(report.ownerRoleCreated, false);
    assert.equal(report.ownerPermissionsGranted, 0);
    const after = await fixture.db.select({ id: rolePermission.permissionId }).from(rolePermission);
    assert.equal(after.length, before.length);
  });

  it('gives the owner every catalogued permission, including the privileged ones', async () => {
    const held = await fixture.db.transaction((tx) => loadStaffPermissions(tx, ownerId));
    for (const entry of PERMISSION_CATALOGUE) {
      assert.ok(held.has(entry.code), `owner should hold ${entry.code}`);
    }
  });

  it('signs in with the correct password and stores only a digest of the session token', async () => {
    const result = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.match(result.rawToken, /^[A-Za-z0-9_-]{43}$/);

    const rows = await fixture.pool.query<{ token_hash: string }>(
      `select token_hash from staff_session where staff_user_id = $1`,
      [ownerId],
    );
    const stored = rows.rows.map((row) => row.token_hash);
    assert.ok(stored.includes(sha256Hex(result.rawToken)));
    // The raw token must appear in no column of the session table.
    const leaked = await fixture.pool.query(
      `select 1 from staff_session where token_hash = $1 or revoked_reason = $1`,
      [result.rawToken],
    );
    assert.equal(leaked.rowCount, 0);
  });

  it('returns one generic failure for a wrong password and for an unknown account', async () => {
    const wrongPassword = await signInAs('owner@example.test', 'not-the-password');
    const unknownAccount = await signInAs('nobody@example.test', 'not-the-password');
    assert.equal(wrongPassword.ok, false);
    assert.equal(unknownAccount.ok, false);
    if (wrongPassword.ok || unknownAccount.ok) return;
    assert.equal(wrongPassword.failure, 'invalid');
    assert.equal(unknownAccount.failure, 'invalid');
  });

  it('does not accept a sign-in for a disabled account', async () => {
    const disabledId = await createStaff('disabled@example.test', 'disabled-password-1', 'Disabled');
    await fixture.pool.query(`update staff_user set status = 'disabled', disabled_at = now() where id = $1`, [
      disabledId,
    ]);
    const result = await signInAs('disabled@example.test', 'disabled-password-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failure, 'invalid');
  });

  it('resolves a session to the principal that owns it, and never to another account', async () => {
    const otherId = await createStaff('other@example.test', 'other-password-1', 'Other');
    const otherSignIn = await signInAs('other@example.test', 'other-password-1', OTHER_CONTEXT);
    assert.equal(otherSignIn.ok, true);
    if (!otherSignIn.ok) return;

    const resolved = await fixture.db.transaction((tx) => resolveStaffSession(tx, otherSignIn.rawToken));
    assert.ok(resolved);
    assert.equal(resolved.principal.staffUserId, otherId);
    assert.notEqual(resolved.principal.staffUserId, ownerId);

    const roles = await fixture.db.transaction((tx) => loadStaffRoles(tx, otherId));
    assert.deepEqual(roles.map((r) => r.code), [OWNER_ROLE.code]);
  });

  it('refuses a malformed, unknown, revoked or expired token', async () => {
    const signIn = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    for (const candidate of [undefined, '', 'short', 'x'.repeat(43), `${signIn.rawToken}x`]) {
      const resolved = await fixture.db.transaction((tx) => resolveStaffSession(tx, candidate));
      assert.equal(resolved, null, `should refuse: ${String(candidate).slice(0, 12)}`);
    }

    // Expiry, by backdating both limits (the schema CHECK forbids an idle limit past the ceiling).
    const expiredLiteral = tokenLiteral('expired-session');
    const expiredId = await fixture.pool.query<{ id: string }>(
      `insert into staff_session (staff_user_id, token_hash, idle_expires_at, absolute_expires_at)
       values ($1, $2, now() - interval '1 minute', now() + interval '1 minute') returning id`,
      [ownerId, sha256Hex(expiredLiteral)],
    );
    assert.ok(expiredId.rows[0]);
    const expired = await fixture.db.transaction((tx) =>
      resolveStaffSession(tx, expiredLiteral),
    );
    assert.equal(expired, null);
  });

  it('kills a session immediately on revocation, so a replay cannot succeed', async () => {
    const signIn = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    const before = await fixture.db.transaction((tx) => resolveStaffSession(tx, signIn.rawToken));
    assert.ok(before);

    const revoked = await fixture.db.transaction((tx) => revokeSession(tx, before.sessionId, 'logout'));
    assert.equal(revoked, true);

    const after = await fixture.db.transaction((tx) => resolveStaffSession(tx, signIn.rawToken));
    assert.equal(after, null, 'a revoked session must not resolve');

    // Revoking twice is a no-op, not an error.
    const again = await fixture.db.transaction((tx) => revokeSession(tx, before.sessionId, 'logout'));
    assert.equal(again, false);
  });

  it('issues a distinct token per sign-in, so a pre-authentication token is never promoted', async () => {
    const first = await signInAs('owner@example.test', 'owner-password-1');
    const second = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.notEqual(first.rawToken, second.rawToken);
    const rows = await fixture.pool.query<{ count: string }>(
      `select count(*)::text as count from staff_session where staff_user_id = $1 and revoked_at is null`,
      [ownerId],
    );
    assert.ok(Number(rows.rows[0]?.count) >= 2);
  });

  it('bounds both lifetimes, and keeps the idle limit inside the absolute ceiling', async () => {
    const signIn = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    const row = await fixture.pool.query<{ created_at: Date; idle_expires_at: Date; absolute_expires_at: Date }>(
      `select created_at, idle_expires_at, absolute_expires_at from staff_session where token_hash = $1`,
      [sha256Hex(signIn.rawToken)],
    );
    const session = row.rows[0];
    assert.ok(session);
    const absolute = session.absolute_expires_at.getTime() - session.created_at.getTime();
    const idle = session.idle_expires_at.getTime() - session.created_at.getTime();

    // Postgres rounds to microseconds and the JS clock differs by a millisecond or two.
    assert.ok(Math.abs(absolute - SESSION_ABSOLUTE_MS) < 5_000, `absolute was ${absolute}ms`);
    assert.ok(Math.abs(idle - SESSION_IDLE_MS) < 5_000, `idle was ${idle}ms`);
    assert.ok(idle <= absolute);
  });

  it('sliding idle never extends past the absolute ceiling', async () => {
    const signIn = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    // Make the session look nearly at its ceiling and nearly idle, then resolve it: the touch must
    // clamp to the ceiling rather than pushing the idle limit past it.
    await fixture.pool.query(
      `update staff_session
          set last_seen_at = now() - interval '5 minutes',
              idle_expires_at = now() + interval '10 seconds',
              absolute_expires_at = now() + interval '20 seconds'
        where token_hash = $1`,
      [sha256Hex(signIn.rawToken)],
    );

    const resolved = await fixture.db.transaction((tx) => resolveStaffSession(tx, signIn.rawToken));
    assert.ok(resolved);

    const row = await fixture.pool.query<{ idle_expires_at: Date; absolute_expires_at: Date }>(
      `select idle_expires_at, absolute_expires_at from staff_session where token_hash = $1`,
      [sha256Hex(signIn.rawToken)],
    );
    const session = row.rows[0];
    assert.ok(session);
    assert.ok(
      session.idle_expires_at.getTime() <= session.absolute_expires_at.getTime(),
      'idle limit must not exceed the absolute ceiling',
    );
  });

  it('blocks the account after the configured failures, from any source', async () => {
    await createStaff('throttled@example.test', 'right-password-1', 'Throttled');
    const accountSource = { ipHash: 'throttle-source-hash', userAgentHash: 'ua' };

    // Three failures is below the limit of ten, so the correct password still works.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await signInAs('throttled@example.test', `wrong-${attempt}`, accountSource);
    }
    const belowLimit = await signInAs('throttled@example.test', 'right-password-1', accountSource);
    assert.equal(belowLimit.ok, true, 'a few failures must not lock the account out');

    // Cross the limit from a second source. The successful sign-in above cleared the counters, so the
    // full maximum has to be reached again.
    const secondSource = { ipHash: 'second-source-hash', userAgentHash: 'ua' };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await signInAs('throttled@example.test', `wrong-again-${attempt}`, secondSource);
    }

    const blocked = await signInAs('throttled@example.test', 'right-password-1', secondSource);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.failure, 'throttled');

    // The account block holds even from a source that has never failed: the subject is the account,
    // and this is the deliberate trade-off - a known staff address can be locked out for one window.
    const fromFreshSource = await signInAs('throttled@example.test', 'right-password-1', {
      ipHash: 'never-used-source-hash',
      userAgentHash: 'ua',
    });
    assert.equal(fromFreshSource.ok, false);
    if (!fromFreshSource.ok) assert.equal(fromFreshSource.failure, 'throttled');

    // A different account from a source that has not failed is unaffected.
    await createStaff('unaffected@example.test', 'unaffected-password-1', 'Unaffected');
    const unaffected = await signInAs('unaffected@example.test', 'unaffected-password-1', {
      ipHash: 'clean-source-hash',
      userAgentHash: 'ua',
    });
    assert.equal(unaffected.ok, true);
  });

  it('clears the counters after a successful sign-in, so earlier typos do not accumulate', async () => {
    await createStaff('typo@example.test', 'typo-password-1', 'Typo');
    const context = { ipHash: 'typo-source-hash', userAgentHash: 'ua' };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await signInAs('typo@example.test', `typo-${attempt}`, context);
    }
    const success = await signInAs('typo@example.test', 'typo-password-1', context);
    assert.equal(success.ok, true);

    const counters = await fixture.pool.query(
      `select 1 from auth_throttle where subject_hash in ($1, $2)`,
      [sha256Hex('account:typo@example.test'), sha256Hex('source:typo-source-hash')],
    );
    assert.equal(counters.rowCount, 0, 'a successful sign-in must clear both subjects');
  });

  it('never records the submitted email in the throttle table', async () => {
    await signInAs('owner@example.test', 'wrong-password-again');
    const rows = await fixture.pool.query<{ subject_hash: string }>(`select subject_hash from auth_throttle`);
    for (const row of rows.rows) {
      assert.ok(!row.subject_hash.includes('owner@example.test'));
      assert.match(row.subject_hash, /^[0-9a-f]{64}$/);
    }
  });

  it('records authentication events without a password or a raw session token', async () => {
    const signIn = await signInAs('owner@example.test', 'owner-password-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    const rows = await fixture.pool.query<{ action: string; before: unknown; after: unknown; reason: string | null }>(
      `select action, before, after, reason from audit_event`,
    );
    assert.ok(rows.rows.some((row) => row.action === 'staff.login_succeeded'));
    assert.ok(rows.rows.some((row) => row.action === 'staff.login_failed'));

    const serialised = JSON.stringify(rows.rows);
    assert.ok(!serialised.includes('owner-password-1'), 'a password must never reach the audit trail');
    assert.ok(!serialised.includes(signIn.rawToken), 'a raw session token must never reach the audit trail');
  });

  it('refuses to rewrite or delete an audit record, whatever the caller does', async () => {
    await fixture.db.transaction((tx) =>
      recordAudit(tx, {
        actorType: 'staff',
        actorStaffId: ownerId,
        actorRoleCodes: [OWNER_ROLE.code],
        action: 'staff.created',
        entityType: 'staff_user',
        entityId: ownerId,
        after: { marker: 'append-only-probe' },
      }),
    );

    for (const statement of [
      `update audit_event set action = 'tampered' where after ->> 'marker' = 'append-only-probe'`,
      `delete from audit_event where after ->> 'marker' = 'append-only-probe'`,
    ]) {
      await assert.rejects(
        () => fixture.pool.query(statement),
        (error: { code?: string }) => error.code === '23514',
        `should refuse: ${statement}`,
      );
    }

    const stillThere = await fixture.pool.query(
      `select 1 from audit_event where after ->> 'marker' = 'append-only-probe'`,
    );
    assert.equal(stillThere.rowCount, 1);
  });

  it('requires a staff actor for a staff audit record', async () => {
    await assert.rejects(
      () =>
        fixture.db.transaction((tx) =>
          recordAudit(tx, {
            actorType: 'staff',
            actorStaffId: null,
            actorRoleCodes: [],
            action: 'staff.created',
            entityType: 'staff_user',
            entityId: 1,
          }),
        ),
      /requires an actor id/,
    );
  });

  it('redeems a credential token once, and refuses the second attempt', async () => {
    const staffId = await createStaff('redeem@example.test', 'first-password-1', 'Redeemer');
    const token = tokenLiteral('redeem-token');
    await fixture.pool.query(
      `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, expires_at)
       values ($1, 'password_reset', $2, $3, now() + interval '30 minutes')`,
      [staffId, sha256Hex(token), ownerId],
    );

    const first = await fixture.db.transaction((tx) =>
      redeemCredentialToken(tx, { rawToken: token, password: 'brand-new-password-1', context: CONTEXT }),
    );
    assert.equal(first.ok, true);

    const second = await fixture.db.transaction((tx) =>
      redeemCredentialToken(tx, { rawToken: token, password: 'another-password-1', context: CONTEXT }),
    );
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.failure, 'invalid_token');

    // The new credential works and the old one does not.
    const newPassword = await signInAs('redeem@example.test', 'brand-new-password-1');
    assert.equal(newPassword.ok, true);
    const oldPassword = await signInAs('redeem@example.test', 'first-password-1');
    assert.equal(oldPassword.ok, false);
  });

  it('refuses an expired credential token and a password that is too short', async () => {
    const staffId = await createStaff('expired-token@example.test', 'original-password-1', 'Expired');
    const token = tokenLiteral('expired-token');
    await fixture.pool.query(
      `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, created_at, expires_at)
       values ($1, 'password_reset', $2, $3, now() - interval '1 hour', now() - interval '30 minutes')`,
      [staffId, sha256Hex(token), ownerId],
    );

    const expired = await fixture.db.transaction((tx) =>
      redeemCredentialToken(tx, { rawToken: token, password: 'brand-new-password-1', context: CONTEXT }),
    );
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.failure, 'invalid_token');

    // The expired token is still `used_at IS NULL`, so the partial unique index holds its slot. An
    // issuer retires it before issuing a replacement, which is exactly what `issueCredentialToken`
    // does - so this mirrors that, rather than pretending the index is not there.
    await fixture.pool.query(
      `update staff_recovery_token set used_at = now() where staff_user_id = $1 and used_at is null`,
      [staffId],
    );

    const fresh = tokenLiteral('fresh-token');
    await fixture.pool.query(
      `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, expires_at)
       values ($1, 'password_reset', $2, $3, now() + interval '30 minutes')`,
      [staffId, sha256Hex(fresh), ownerId],
    );
    const weak = await fixture.db.transaction((tx) =>
      redeemCredentialToken(tx, { rawToken: fresh, password: 'short', context: CONTEXT }),
    );
    assert.equal(weak.ok, false);
    if (!weak.ok) assert.equal(weak.failure, 'weak_password');
  });

  it('revokes every existing session when a credential is set', async () => {
    const staffId = await createStaff('reset-sessions@example.test', 'before-reset-1', 'Reset');
    const signIn = await signInAs('reset-sessions@example.test', 'before-reset-1');
    assert.equal(signIn.ok, true);
    if (!signIn.ok) return;

    const token = tokenLiteral('session-revoking');
    await fixture.pool.query(
      `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, expires_at)
       values ($1, 'password_reset', $2, $3, now() + interval '30 minutes')`,
      [staffId, sha256Hex(token), ownerId],
    );

    const redeemed = await fixture.db.transaction((tx) =>
      redeemCredentialToken(tx, { rawToken: token, password: 'after-reset-1', context: CONTEXT }),
    );
    assert.equal(redeemed.ok, true);

    const resolved = await fixture.db.transaction((tx) => resolveStaffSession(tx, signIn.rawToken));
    assert.equal(resolved, null, 'a credential change must end existing sessions');

    const reasons = await fixture.pool.query<{ revoked_reason: string }>(
      `select revoked_reason from staff_session where staff_user_id = $1 and revoked_at is not null`,
      [staffId],
    );
    assert.ok(reasons.rows.some((row) => row.revoked_reason === 'password_change'));
  });

  it('keeps exactly one live credential per staff user, and one live recovery token per purpose', async () => {
    const staffId = await createStaff('single-live@example.test', 'live-password-1', 'Single');

    await assert.rejects(
      () =>
        fixture.pool.query(
          `insert into staff_credential (staff_user_id, kind, secret_hash, hash_algorithm)
           values ($1, 'password', 'x', 'scrypt')`,
          [staffId],
        ),
      (error: { code?: string }) => error.code === '23505',
    );

    const [firstToken, secondToken] = [tokenLiteral('live-token-one'), tokenLiteral('live-token-two')];
    await fixture.pool.query(
      `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, expires_at)
       values ($1, 'password_reset', $2, $3, now() + interval '30 minutes')`,
      [staffId, sha256Hex(firstToken), ownerId],
    );

    // A second live token for the same purpose is refused by the partial unique index, so a re-issue
    // can never leave two usable secrets behind.
    await assert.rejects(
      () =>
        fixture.pool.query(
          `insert into staff_recovery_token (staff_user_id, purpose, token_hash, issued_by_staff_id, expires_at)
           values ($1, 'password_reset', $2, $3, now() + interval '30 minutes')`,
          [staffId, sha256Hex(secondToken), ownerId],
        ),
      (error: { code?: string }) => error.code === '23505',
    );

    const all = await fixture.pool.query(
      `select 1 from staff_recovery_token where staff_user_id = $1`,
      [staffId],
    );
    assert.equal(all.rowCount, 1, 'only the first token should exist');
  });

  it('refuses a privileged permission on a non-owner role, in the database', async () => {
    const inserted = await fixture.pool.query<{ id: string }>(
      `insert into role (code, name, is_owner_level) values ('test_admin', 'Test Admin', false) returning id`,
    );
    const roleId = Number(inserted.rows[0]?.id);
    const privileged = await fixture.pool.query<{ id: string }>(
      `select id from permission where code = $1`,
      [PERMISSIONS.paymentVerify],
    );
    const permissionId = Number(privileged.rows[0]?.id);

    await assert.rejects(
      () =>
        fixture.pool.query(`insert into role_permission (role_id, permission_id) values ($1, $2)`, [
          roleId,
          permissionId,
        ]),
      (error: { code?: string }) => error.code === '23514',
    );

    // A non-privileged permission is allowed on the same role, so the guard is not a blanket refusal.
    const routine = await fixture.pool.query<{ id: string }>(
      `select id from permission where code = $1`,
      [PERMISSIONS.orderRead],
    );
    await fixture.pool.query(`insert into role_permission (role_id, permission_id) values ($1, $2)`, [
      roleId,
      Number(routine.rows[0]?.id),
    ]);

    // Clean up so the owner-count assertions elsewhere are unaffected.
    await fixture.pool.query(`delete from role_permission where role_id = $1`, [roleId]);
    await fixture.pool.query(`delete from role where id = $1`, [roleId]);
  });

  it('gives a staff user only the permissions their roles grant', async () => {
    const supportId = await createStaff('support@example.test', 'support-password-1', 'Support');
    const supportRole = await fixture.pool.query<{ id: string }>(
      `insert into role (code, name, is_owner_level) values ('test_support', 'Test Support', false) returning id`,
    );
    const roleId = Number(supportRole.rows[0]?.id);
    await fixture.pool.query(
      `insert into role_permission (role_id, permission_id)
       select $1, id from permission where code = $2`,
      [roleId, PERMISSIONS.orderRead],
    );
    // Replace the owner role seeded by the helper with the restricted one.
    await fixture.pool.query(`delete from staff_role where staff_user_id = $1`, [supportId]);
    await fixture.pool.query(`insert into staff_role (staff_user_id, role_id, granted_by) values ($1, $2, $3)`, [
      supportId,
      roleId,
      ownerId,
    ]);

    const held = await fixture.db.transaction((tx) => loadStaffPermissions(tx, supportId));
    assert.deepEqual([...held], [PERMISSIONS.orderRead]);
    assert.ok(!held.has(PERMISSIONS.staffManage));
    assert.ok(!held.has(PERMISSIONS.paymentVerify));

    await fixture.pool.query(`delete from staff_role where staff_user_id = $1`, [supportId]);
    await fixture.pool.query(`delete from staff_user where id = $1`, [supportId]);
    await fixture.pool.query(`delete from role_permission where role_id = $1`, [roleId]);
    await fixture.pool.query(`delete from role where id = $1`, [roleId]);
  });

  it('stores no raw token in any session or recovery column', async () => {
    const columns = await fixture.pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('staff_session', 'staff_recovery_token', 'staff_credential')
        order by table_name, column_name`,
    );
    const names = columns.rows.map((row) => `${row.table_name}.${row.column_name}`);
    // `token_hash` and `secret_hash` are the only secret-bearing columns, and both are digests.
    assert.ok(names.includes('staff_session.token_hash'));
    assert.ok(names.includes('staff_recovery_token.token_hash'));
    assert.ok(names.includes('staff_credential.secret_hash'));
    assert.ok(!names.includes('staff_session.token'));
    assert.ok(!names.includes('staff_recovery_token.token'));
    assert.ok(!names.includes('staff_credential.password'));
  });
});
