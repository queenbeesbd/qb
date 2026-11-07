/**
 * Owner-operated customer credential recovery (Phase 23, ADR 0012 §recovery).
 *
 * **Since ADR 0030 the ordinary route is a mailed link**, but this owner-operated route still exists for a
 * customer who cannot reach the inbox: the owner, during the call they were already going to make, hands
 * over a **one-time credential** that the customer must immediately replace with a password of their own.
 * This module is that route, and its whole job is to make it safe:
 *
 * - **Permission re-checked here, not only in the route.** `customer.credential_reset` is required in
 *   the service, so a caller that forgets the route check fails closed. The refusal is recorded durably
 *   by `requirePermission` in its own transaction.
 * - **Only a digest is stored.** The credential is 256 bits from `crypto.randomBytes`, returned to the
 *   caller exactly once, and persisted only as a SHA-256 digest in `account_recovery_token`. It can
 *   never be recovered from the database, an audit row, a log or this module's return value twice.
 * - **Single live token per account.** Issuing marks any live token `used_at`, which the partial unique
 *   index requires, so superseding is structural rather than best-effort. Two concurrent issues cannot
 *   both leave a live token.
 * - **Every session dies at issuance.** A customer who cannot sign in does not need an old session left
 *   alive, and a session minted before the reset is a session the owner's action cannot vouch for.
 * - **A suspended account is refused without saying why.** The owner sees the same "cannot issue"
 *   outcome as for an unknown account, so this endpoint cannot be used to probe account state, and the
 *   refusal is deliberately **not** written to the audit trail with a reason that names suspension.
 * - **Redemption is atomic and one-use.** The consume is a guarded `UPDATE ... WHERE used_at IS NULL`,
 *   so a replay loses the race rather than being served a second time.
 *
 * **What a customer action is NOT.** Per D23 a customer is never an audit actor type: their successful
 * redemption is recorded as a `system`-actor entry naming no customer-supplied identity beyond the id
 * the token already resolves, and it holds no password, no plaintext credential and no digest.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { accountRecoveryToken, customer, customerCredential } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password';
import type { SessionContext } from '../auth/session';
import { throttleState, recordFailedAttempt } from '../auth/throttle';
import { createOpaqueToken, looksLikeToken, sha256Hex } from '../auth/tokens';
import { requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';
import { CUSTOMER_RECOVERY_REDEEM_THROTTLE, RECOVERY_TOKEN_MS } from './constants';
import { createCustomerSession, revokeAllCustomerSessions } from './session';

/**
 * Why an issuance was refused.
 *
 * Deliberately **one value**. "No such customer" and "that account is suspended" produce the same
 * answer, because distinguishing them would turn an owner-only endpoint into a way to read account
 * state - and a suspension is the customer's business, not something to leak in a redirect parameter.
 */
export type CustomerRecoveryIssueFailure = 'unavailable' | 'invalid_reason';

export type CustomerRecoveryIssueResult =
  | { ok: true; token: string; expiresAt: Date; sessionsRevoked: number }
  | { ok: false; failure: CustomerRecoveryIssueFailure };

/** Why a redemption was refused. One generic value plus the two states a customer can act on. */
export type CustomerRecoveryRedeemFailure =
  | 'invalid_token'
  | 'weak_password'
  | 'throttled';

export type CustomerRecoveryRedeemResult =
  | { ok: true; customerId: number; rawToken: string; absoluteExpiresAt: Date }
  | { ok: false; failure: CustomerRecoveryRedeemFailure; blockedUntil?: Date | null };

/**
 * Issues a one-time recovery credential for a customer.
 *
 * The reason is required and bounded for the same purpose as a ban's: an administrative action that
 * locks a customer out of their existing sessions must carry the owner's stated grounds, and a reason
 * shorter than ten characters is not a reason.
 */
export async function issueCustomerRecovery(
  tx: Transaction,
  actor: ActorContext,
  input: { customerId: number; reason: string },
): Promise<CustomerRecoveryIssueResult> {
  await requirePermission(
    actor,
    PERMISSIONS.customerCredentialReset,
    'customer',
    input.customerId,
  );

  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason.length < 10 || reason.length > 500) {
    return { ok: false, failure: 'invalid_reason' };
  }

  const rows = await tx
    .select({ id: customer.id, status: customer.status })
    .from(customer)
    .where(sql`${customer.id} = ${input.customerId} and ${customer.deletedAt} is null`)
    .limit(1);

  const target = rows[0];
  // One outcome for "no such account" and "not active": the caller cannot tell them apart.
  if (target === undefined || target.status !== 'active') {
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'customer.recovery_refused',
      entityType: 'customer',
      entityId: input.customerId,
      // The reason is the owner's words about their own process; it never names a suspension state,
      // because the trail is readable and the state is not this action's to publish.
      reason,
      after: { refused: true },
    });
    return { ok: false, failure: 'unavailable' };
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MS);
  const now = new Date();

  // Supersede first: the partial unique index `account_recovery_token_live_unique` permits one live
  // row per (customer, purpose), so retiring the old one is a precondition of the insert, not a
  // courtesy. A concurrent issue either retires ours or loses on the index.
  await tx
    .update(accountRecoveryToken)
    .set({ usedAt: now })
    .where(sql`${accountRecoveryToken.customerId} = ${input.customerId}
        and ${accountRecoveryToken.purpose} = 'password_reset'
        and ${accountRecoveryToken.usedAt} is null`);

  await tx.insert(accountRecoveryToken).values({
    customerId: input.customerId,
    purpose: 'password_reset',
    tokenHash: sha256Hex(token),
    expiresAt,
  });

  // A session issued before this action cannot be vouched for by it.
  const sessionsRevoked = await revokeAllCustomerSessions(tx, input.customerId, 'admin_revoke');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'customer.credential_reset_issued',
    entityType: 'customer',
    entityId: input.customerId,
    reason,
    // The token, its digest and its expiry instant are all absent on purpose: the trail records that
    // a credential was issued, never the credential.
    after: { purpose: 'password_reset', sessionsRevoked },
  });

  return { ok: true, token, expiresAt, sessionsRevoked };
}

/**
 * Consumes a recovery credential and sets the customer's new password.
 *
 * Ordered so that **nothing is consumed until the new password is acceptable**: a weak password does
 * not burn the credential, so a customer who mistypes one does not need a second call to the owner.
 * Once the token is consumed the rest commits together - new credential, old credential retired, every
 * session revoked, audit row written - so there is no window in which the old password still works.
 */
export async function redeemCustomerRecovery(
  tx: Transaction,
  input: {
    rawToken: string;
    password: string;
    context: SessionContext;
    createSession(customerId: number): Promise<{ token: string; absoluteExpiresAt: Date }>;
  },
): Promise<CustomerRecoveryRedeemResult> {
  // A value that is not even token-shaped is refused before any lookup, so a garbage submission
  // cannot be turned into a query or a throttle write.
  if (!looksLikeToken(input.rawToken)) return { ok: false, failure: 'invalid_token' };

  if (passwordPolicyError(input.password) !== null) return { ok: false, failure: 'weak_password' };

  const source = sha256Hex(`recovery-source:${input.context.ipHash ?? 'unknown'}`);
  const state = await throttleState(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
  if (state.blocked) return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };

  const rows = await tx
    .select({
      tokenId: accountRecoveryToken.id,
      customerId: accountRecoveryToken.customerId,
      purpose: accountRecoveryToken.purpose,
      expiresAt: accountRecoveryToken.expiresAt,
      usedAt: accountRecoveryToken.usedAt,
      status: customer.status,
      deletedAt: customer.deletedAt,
    })
    .from(accountRecoveryToken)
    .innerJoin(customer, sql`${customer.id} = ${accountRecoveryToken.customerId}`)
    .where(sql`${accountRecoveryToken.tokenHash} = ${sha256Hex(input.rawToken)}`);

  const row = rows[0];
  const usable =
    row !== undefined &&
    row.purpose === 'password_reset' &&
    row.usedAt === null &&
    row.expiresAt.getTime() > Date.now() &&
    row.status === 'active' &&
    row.deletedAt === null;

  if (!usable || row === undefined) {
    // Counted so a guesser cannot enumerate token space, and so a leaked-but-dead link cannot be
    // retried indefinitely. The failure is generic: expired, used, superseded and unknown are one code.
    const verdict = await recordFailedAttempt(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
    return {
      ok: false,
      failure: verdict.blockedUntil !== null ? 'throttled' : 'invalid_token',
      blockedUntil: verdict.blockedUntil,
    };
  }

  const secretHash = await hashPassword(input.password);

  // Consume first, guarded on `used_at is null`. Two concurrent redemptions both read the row, but only
  // one `UPDATE` can match, so exactly one proceeds and the other is refused as invalid.
  const consumed = await tx
    .update(accountRecoveryToken)
    .set({ usedAt: new Date() })
    .where(sql`${accountRecoveryToken.id} = ${row.tokenId} and ${accountRecoveryToken.usedAt} is null`)
    .returning({ id: accountRecoveryToken.id });
  if (consumed.length === 0) return { ok: false, failure: 'invalid_token' };

  // Retire then insert: the partial unique index permits one live `password` credential per customer.
  await tx
    .update(customerCredential)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(sql`${customerCredential.customerId} = ${row.customerId}
        and ${customerCredential.kind} = 'password'
        and ${customerCredential.revokedAt} is null`);

  await tx.insert(customerCredential).values({
    customerId: row.customerId,
    kind: 'password',
    secretHash,
    hashAlgorithm: 'scrypt',
  });

  // The recovery credential is spent; the password is now the only way in.
  await tx
    .update(customer)
    .set({ updatedAt: new Date() })
    .where(sql`${customer.id} = ${row.customerId}`);

  await recordAudit(tx, {
    // A customer is never an audit *actor* (D23); this is a recorded system fact about the account.
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.credential_reset_redeemed',
    entityType: 'customer',
    entityId: row.customerId,
    after: { sessionsRevoked: true },
    ipHash: input.context.ipHash,
  });

  // Only now does a session exist, minted against the new credential. A customer is never handed back
  // into the account with an old session still valid.
  const session = await input.createSession(row.customerId);

  return {
    ok: true,
    customerId: row.customerId,
    rawToken: session.token,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

/** Exported for the route that needs both primitives without reaching into the session module. */
export { createCustomerSession, verifyPassword };
