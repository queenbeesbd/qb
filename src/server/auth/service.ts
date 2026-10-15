/**
 * Staff authentication service.
 *
 * The three flows this phase supports:
 *
 * - **signIn** - email and password, throttled by account and by source, generic failure, and a new
 *   session issued on success (never a promoted one).
 * - **signOut** - revokes the row and clears the cookie.
 * - **redeemCredentialToken** - consumes an owner-issued single-use token and sets the password. This
 *   is both the first-credential flow for a new staff member and the recovery path, because no mail
 *   provider is authorized to deliver a reset link (`docs/decisions/0008`).
 *
 * Failure handling is deliberate. Every credential failure returns the same code, takes a comparable
 * amount of work whether or not the account exists (a dummy verification runs when it does not), and
 * is audited with a pseudonymous subject digest - so the response, the timing and the log all avoid
 * telling an attacker which staff addresses are real.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { staffCredential, staffRecoveryToken, staffSession, staffUser } from '@/db/schema';

import { recordAudit } from './audit';
import { LOGIN_THROTTLE } from './constants';
import { hashPassword, needsRehash, passwordPolicyError, verifyPassword } from './password';
import {
  clearThrottle,
  recordFailedAttempt,
  sourceSubject,
  throttleState,
  accountSubject,
} from './throttle';
import { createOpaqueToken, normalizeEmail, sha256Hex } from './tokens';
import type { SessionContext } from './session';

/** One code for every credential failure. The caller maps it to one localized message. */
export type SignInFailure = 'invalid' | 'throttled';

export type SignInResult =
  | { ok: true; staffUserId: number; rawToken: string; absoluteExpiresAt: Date }
  | { ok: false; failure: SignInFailure; blockedUntil: Date | null };

/**
 * A hash of a value no one can supply, used to equalise the work done for an unknown account.
 * Computed once per process: the point is the cost of verification, not the value.
 */
const DUMMY_HASH_PROMISE = hashPassword(createOpaqueToken());

/**
 * Attempts a sign-in.
 *
 * The throttle is checked before the credential is read, and both subjects are counted on failure, so
 * neither a single account nor a single source can be probed indefinitely. The block is applied even
 * when the password happens to be correct, because a blocked subject must not be able to keep trying.
 */
export async function signIn(
  tx: Transaction,
  input: { email: string; password: string; context: SessionContext; createSession: (staffUserId: number) => Promise<{ token: string; absoluteExpiresAt: Date }> },
): Promise<SignInResult> {
  const email = normalizeEmail(input.email);
  const subjects = [accountSubject(email), sourceSubject(input.context.ipHash)];

  for (const subject of subjects) {
    const state = await throttleState(tx, LOGIN_THROTTLE, subject);
    if (state.blocked) {
      await recordAudit(tx, {
        actorType: 'system',
        actorRoleCodes: [],
        action: 'staff.login_blocked',
        entityType: 'staff_user',
        entityId: 0,
        reason: 'throttle limit reached',
        after: { subject: subject.slice(0, 12) },
        ipHash: input.context.ipHash,
      });
      return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };
    }
  }

  const rows = await tx
    .select({
      id: staffUser.id,
      status: staffUser.status,
      credentialId: staffCredential.id,
      secretHash: staffCredential.secretHash,
    })
    .from(staffUser)
    .leftJoin(
      staffCredential,
      sql`${staffCredential.staffUserId} = ${staffUser.id}
          and ${staffCredential.kind} = 'password'
          and ${staffCredential.revokedAt} is null`,
    )
    .where(sql`lower(${staffUser.email}) = ${email}`);

  const row = rows[0];

  // Verification runs in every branch so the response time does not disclose whether the account
  // exists. `Promise.all` is not used: the credential check must be the only work that varies.
  let verified = false;
  if (row === undefined || row.credentialId === null || row.secretHash === null) {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
  } else {
    verified = await verifyPassword(input.password, row.secretHash);
  }

  const usable = row !== undefined && row.status === 'active' && row.secretHash !== null;

  if (!verified || !usable || row === undefined || row.secretHash === null) {
    let blockedUntil: Date | null = null;
    for (const subject of subjects) {
      const verdict = await recordFailedAttempt(tx, LOGIN_THROTTLE, subject);
      if (verdict.blockedUntil !== null) blockedUntil = verdict.blockedUntil;
    }

    await recordAudit(tx, {
      actorType: row === undefined ? 'system' : 'staff',
      actorStaffId: row === undefined ? null : row.id,
      actorRoleCodes: [],
      action: 'staff.login_failed',
      entityType: 'staff_user',
      entityId: row?.id ?? 0,
      // A pseudonymous digest, never the submitted address.
      reason: usable ? 'credential mismatch' : 'unknown or unusable account',
      after: { subject: subjects[0]?.slice(0, 12) ?? null },
      ipHash: input.context.ipHash,
    });

    return { ok: false, failure: 'invalid', blockedUntil };
  }

  const staffUserId = row.id;

  // A successful sign-in clears the counters, so a user's own earlier typos do not lock them out.
  await clearThrottle(tx, LOGIN_THROTTLE, subjects);

  // Opportunistic upgrade: a credential stored with weaker parameters is re-hashed now that the
  // plaintext is legitimately in hand. This is the only moment it can be done without asking again.
  if (needsRehash(row.secretHash)) {
    await tx
      .update(staffCredential)
      .set({ secretHash: await hashPassword(input.password), hashAlgorithm: 'scrypt', updatedAt: new Date() })
      .where(sql`${staffCredential.id} = ${row.credentialId}`);
  }

  await tx
    .update(staffUser)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(sql`${staffUser.id} = ${staffUserId}`);

  const session = await input.createSession(staffUserId);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: staffUserId,
    actorRoleCodes: [],
    action: 'staff.login_succeeded',
    entityType: 'staff_user',
    entityId: staffUserId,
    // The session id is not recorded: it is a server-side handle, and the trail needs the actor, the
    // time and the source - not a pointer to a live credential.
    after: { sessionIssued: true },
    ipHash: input.context.ipHash,
  });

  return { ok: true, staffUserId, rawToken: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
}

export type RedeemResult =
  | { ok: true; staffUserId: number; purpose: string }
  | { ok: false; failure: 'invalid_token' | 'weak_password' | 'account_disabled' };

/**
 * Consumes a credential token and sets the password.
 *
 * The token is single-use and short-lived. A successful redemption revokes every existing session for
 * the account, so a credential change ends any session an attacker may already hold - the schema's
 * `password_change` revocation reason exists for exactly this.
 */
export async function redeemCredentialToken(
  tx: Transaction,
  input: { rawToken: string; password: string; context: SessionContext },
): Promise<RedeemResult> {
  const policyError = passwordPolicyError(input.password);
  if (policyError !== null) return { ok: false, failure: 'weak_password' };

  const rows = await tx
    .select({
      tokenId: staffRecoveryToken.id,
      staffUserId: staffRecoveryToken.staffUserId,
      purpose: staffRecoveryToken.purpose,
      expiresAt: staffRecoveryToken.expiresAt,
      usedAt: staffRecoveryToken.usedAt,
      status: staffUser.status,
    })
    .from(staffRecoveryToken)
    .innerJoin(staffUser, sql`${staffUser.id} = ${staffRecoveryToken.staffUserId}`)
    .where(sql`${staffRecoveryToken.tokenHash} = ${sha256Hex(input.rawToken)}`);

  const row = rows[0];
  if (row === undefined || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, failure: 'invalid_token' };
  }
  if (row.status !== 'active') return { ok: false, failure: 'account_disabled' };

  // Mark used first: the update is guarded on `used_at is null`, so a replayed redemption cannot
  // win the race against the first one.
  const consumed = await tx
    .update(staffRecoveryToken)
    .set({ usedAt: new Date() })
    .where(sql`${staffRecoveryToken.id} = ${row.tokenId} and ${staffRecoveryToken.usedAt} is null`)
    .returning({ id: staffRecoveryToken.id });
  if (consumed.length === 0) return { ok: false, failure: 'invalid_token' };

  const secretHash = await hashPassword(input.password);

  // Revoke the previous credential before inserting the replacement: the partial unique index permits
  // exactly one live `password` credential per staff user.
  await tx
    .update(staffCredential)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(sql`${staffCredential.staffUserId} = ${row.staffUserId}
        and ${staffCredential.kind} = 'password'
        and ${staffCredential.revokedAt} is null`);

  await tx.insert(staffCredential).values({
    staffUserId: row.staffUserId,
    kind: 'password',
    secretHash,
    hashAlgorithm: 'scrypt',
  });

  // Every existing session dies with the old credential.
  await tx
    .update(staffSession)
    .set({ revokedAt: new Date(), revokedReason: 'password_change' })
    .where(sql`${staffSession.staffUserId} = ${row.staffUserId} and ${staffSession.revokedAt} is null`);

  await tx
    .update(staffUser)
    .set({ updatedAt: new Date() })
    .where(sql`${staffUser.id} = ${row.staffUserId}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: row.staffUserId,
    actorRoleCodes: [],
    action: 'staff.credential_set',
    entityType: 'staff_user',
    entityId: row.staffUserId,
    after: { purpose: row.purpose, sessionsRevoked: true },
    ipHash: input.context.ipHash,
  });

  return { ok: true, staffUserId: row.staffUserId, purpose: row.purpose };
}
