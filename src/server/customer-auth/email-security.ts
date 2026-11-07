/**
 * Self-service customer account security over email (ADR 0030).
 *
 * Four flows, and the rules they share:
 *
 * 1. **A mailed token is the authority, and only its digest is stored.** `createOpaqueToken()` is 256
 *    bits of randomness; the raw value exists only inside the message. A stolen database cannot be
 *    turned into a working link, and a link cannot be replayed: consuming one is a guarded
 *    `UPDATE ... WHERE used_at IS NULL`, so a second click loses the race.
 * 2. **Every token expires.** A recovery link lasts an hour and a change-of-address confirmation a day.
 *    An expired token answers exactly like an unknown one.
 * 3. **Nothing tells an anonymous caller whether an account exists.** `requestCustomerPasswordReset`
 *    always reports the same thing - the route always shows the same sentence - whether the address is
 *    registered, suspended, malformed or absent.
 * 4. **A password change ends the sessions that were not part of it.** Both reset paths revoke every
 *    live customer session, so a session stolen before the change is worthless afterwards. The
 *    account-page path immediately mints a fresh session for the browser that made the change, so the
 *    customer is not thrown out of the tab they are using.
 *
 * **A customer is never an audit actor (D23).** Each completed action writes a `system`-actor record -
 * the same shape the owner-issued redemption uses - carrying the customer id and a boolean, never an
 * address, a password or a token digest.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { accountRecoveryToken, customer, customerCredential, customerEmailChange } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { customerPasswordPolicyError, hashPassword, verifyPassword } from '../auth/password';
import type { SessionContext } from '../auth/session';
import {
  clearThrottle,
  recordFailedAttempt,
  sourceSubject,
  throttleState,
  type ThrottlePolicy,
} from '../auth/throttle';
import { createOpaqueToken, looksLikeToken, sha256Hex } from '../auth/tokens';
import {
  CUSTOMER_EMAIL_CHANGE_THROTTLE,
  CUSTOMER_EMAIL_CHANGE_TOKEN_MS,
  CUSTOMER_PASSWORD_CHANGE_THROTTLE,
  CUSTOMER_RECOVERY_REDEEM_THROTTLE,
  CUSTOMER_RESET_REQUEST_THROTTLE,
  CUSTOMER_RESET_TOKEN_MS,
} from './constants';
import { revokeAllCustomerSessions } from './session';
import { parseEmail, parsePassword } from './validation';

function accountSubjectFor(label: string, email: string): string {
  return sha256Hex(`customer-${label}:${email}`);
}

/** Every request is counted, so probing an address list is bounded exactly like guessing a password. */
async function countRequest(
  tx: Transaction,
  policy: ThrottlePolicy,
  subjects: readonly string[],
): Promise<boolean> {
  let blocked = false;
  for (const subject of subjects) {
    const state = await throttleState(tx, policy, subject);
    if (state.blocked) blocked = true;
  }
  if (blocked) return false;
  for (const subject of subjects) {
    await recordFailedAttempt(tx, policy, subject);
  }
  return true;
}

// ------------------------------------------------------------------
// Password recovery by email
// ------------------------------------------------------------------

export type PasswordResetRequest = {
  /** Who to mail and which token to embed, or `null` when nothing must be sent. */
  readonly delivery: { readonly to: string; readonly token: string } | null;
};

/**
 * Creates a recovery link for the address **if** it belongs to an active account.
 *
 * The caller decides what to say - and says the same thing either way. A throttled request, an unknown
 * address, a suspended account and a malformed address all produce `delivery: null`.
 */
export async function requestCustomerPasswordReset(
  tx: Transaction,
  input: { readonly email: unknown; readonly context: SessionContext },
): Promise<PasswordResetRequest> {
  const email = parseEmail(input.email);
  const subjects =
    email === null
      ? [sourceSubject(input.context.ipHash)]
      : [accountSubjectFor('reset', email), sourceSubject(input.context.ipHash)];

  const allowed = await countRequest(tx, CUSTOMER_RESET_REQUEST_THROTTLE, subjects);
  if (!allowed || email === null) return { delivery: null };

  const rows = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(
      sql`lower(${customer.email}) = ${email} and ${customer.status} = 'active' and ${customer.deletedAt} is null`,
    );
  const target = rows[0];
  if (target === undefined) return { delivery: null };

  const token = createOpaqueToken();
  const now = new Date();

  // One live recovery token per account: a new request supersedes the previous link rather than
  // leaving two working ones. The partial unique index makes this structural.
  await tx
    .update(accountRecoveryToken)
    .set({ usedAt: now })
    .where(
      sql`${accountRecoveryToken.customerId} = ${target.id} and ${accountRecoveryToken.purpose} = 'password_reset' and ${accountRecoveryToken.usedAt} is null`,
    );

  await tx.insert(accountRecoveryToken).values({
    customerId: target.id,
    purpose: 'password_reset',
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now.getTime() + CUSTOMER_RESET_TOKEN_MS),
    requestedIpHash: input.context.ipHash,
  });

  return { delivery: { to: email, token } };
}

export type PasswordResetFailure = 'invalid_token' | 'weak_password' | 'throttled';

export type PasswordResetResult =
  | { readonly ok: true; readonly customerId: number }
  | { readonly ok: false; readonly failure: PasswordResetFailure };

/**
 * Consumes a mailed recovery token and replaces the password.
 *
 * Every refusal is `invalid_token` - expired, already used, unknown, or belonging to an account that is
 * no longer active - because telling them apart would describe account state to whoever holds a token.
 */
export async function resetCustomerPasswordWithToken(
  tx: Transaction,
  input: { readonly rawToken: unknown; readonly password: unknown; readonly context: SessionContext },
): Promise<PasswordResetResult> {
  const rawToken = typeof input.rawToken === 'string' ? input.rawToken.trim() : '';
  if (!looksLikeToken(rawToken)) return { ok: false, failure: 'invalid_token' };

  const password = parsePassword(input.password);
  if (password === null || customerPasswordPolicyError(password) !== null) {
    return { ok: false, failure: 'weak_password' };
  }

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const rows = await tx
    .select({
      tokenId: accountRecoveryToken.id,
      customerId: accountRecoveryToken.customerId,
    })
    .from(accountRecoveryToken)
    .innerJoin(customer, sql`${customer.id} = ${accountRecoveryToken.customerId}`)
    .where(
      sql`${accountRecoveryToken.tokenHash} = ${sha256Hex(rawToken)}
          and ${accountRecoveryToken.purpose} = 'password_reset'
          and ${accountRecoveryToken.usedAt} is null
          and ${accountRecoveryToken.expiresAt} > now()
          and ${customer.status} = 'active'
          and ${customer.deletedAt} is null`,
    );

  const target = rows[0];
  if (target === undefined) {
    await recordFailedAttempt(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
    return { ok: false, failure: 'invalid_token' };
  }

  const now = new Date();
  const consumed = await tx
    .update(accountRecoveryToken)
    .set({ usedAt: now })
    .where(sql`${accountRecoveryToken.id} = ${target.tokenId} and ${accountRecoveryToken.usedAt} is null`)
    .returning({ id: accountRecoveryToken.id });
  // A second redemption of the same link answers like any other dead token.
  if (consumed.length === 0) return { ok: false, failure: 'invalid_token' };

  const secretHash = await hashPassword(password);
  await tx
    .update(customerCredential)
    .set({ secretHash, hashAlgorithm: 'scrypt', updatedAt: now })
    .where(
      sql`${customerCredential.customerId} = ${target.customerId} and ${customerCredential.kind} = 'password' and ${customerCredential.revokedAt} is null`,
    );

  const sessionsRevoked = await revokeAllCustomerSessions(tx, target.customerId, 'password_change');
  await clearThrottle(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, [source]);

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.password_reset_completed',
    entityType: 'customer',
    entityId: target.customerId,
    after: { sessionsRevoked, via: 'email_link' },
  });

  return { ok: true, customerId: target.customerId };
}

// ------------------------------------------------------------------
// Password change from the account page
// ------------------------------------------------------------------

export type PasswordChangeFailure = 'wrong_password' | 'weak_password' | 'unavailable' | 'throttled';

export type PasswordChangeResult =
  | { readonly ok: true; readonly email: string; readonly sessionsRevoked: number }
  | { readonly ok: false; readonly failure: PasswordChangeFailure };

/**
 * Replaces the password from a signed-in session, after re-proving the current one.
 *
 * The current password is required because a session alone is not evidence that the person at the
 * keyboard is the account holder - a borrowed laptop is the ordinary case. Every session is revoked,
 * and the calling route mints a replacement for the current browser so the customer stays signed in
 * exactly where they are.
 */
export async function changeCustomerPassword(
  tx: Transaction,
  input: {
    readonly customerId: number;
    readonly currentPassword: unknown;
    readonly newPassword: unknown;
    readonly context: SessionContext;
  },
): Promise<PasswordChangeResult> {
  const current = parsePassword(input.currentPassword);
  const next = parsePassword(input.newPassword);
  if (current === null) return { ok: false, failure: 'wrong_password' };

  const subject = accountSubjectFor('password-change', String(input.customerId));
  const state = await throttleState(tx, CUSTOMER_PASSWORD_CHANGE_THROTTLE, subject);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const rows = await tx
    .select({
      email: customer.email,
      status: customer.status,
      secretHash: customerCredential.secretHash,
    })
    .from(customer)
    .leftJoin(
      customerCredential,
      sql`${customerCredential.customerId} = ${customer.id}
          and ${customerCredential.kind} = 'password'
          and ${customerCredential.revokedAt} is null`,
    )
    .where(sql`${customer.id} = ${input.customerId}`);

  const row = rows[0];
  if (row === undefined || row.status !== 'active' || row.secretHash === null) {
    return { ok: false, failure: 'unavailable' };
  }

  if (!(await verifyPassword(current, row.secretHash))) {
    await recordFailedAttempt(tx, CUSTOMER_PASSWORD_CHANGE_THROTTLE, subject);
    return { ok: false, failure: 'wrong_password' };
  }

  if (next === null || customerPasswordPolicyError(next) !== null) return { ok: false, failure: 'weak_password' };

  const now = new Date();
  const secretHash = await hashPassword(next);
  await tx
    .update(customerCredential)
    .set({ secretHash, hashAlgorithm: 'scrypt', updatedAt: now })
    .where(
      sql`${customerCredential.customerId} = ${input.customerId} and ${customerCredential.kind} = 'password' and ${customerCredential.revokedAt} is null`,
    );

  const sessionsRevoked = await revokeAllCustomerSessions(tx, input.customerId, 'password_change');
  await clearThrottle(tx, CUSTOMER_PASSWORD_CHANGE_THROTTLE, [subject]);

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.password_changed',
    entityType: 'customer',
    entityId: input.customerId,
    after: { sessionsRevoked, via: 'account_page' },
  });

  return { ok: true, email: row.email, sessionsRevoked };
}

// ------------------------------------------------------------------
// Change of email address
// ------------------------------------------------------------------

export type EmailChangeRequestFailure =
  | 'wrong_password'
  | 'invalid_email'
  | 'same_email'
  | 'email_taken'
  | 'throttled';

export type EmailChangeRequestResult =
  | { readonly ok: true; readonly token: string; readonly newEmail: string }
  | { readonly ok: false; readonly failure: EmailChangeRequestFailure };

/**
 * Starts a change of address: verify the password, check the new address is free, and mail a
 * confirmation **there**. The account's address does not move until that link is used.
 */
export async function requestCustomerEmailChange(
  tx: Transaction,
  input: {
    readonly customerId: number;
    readonly newEmail: unknown;
    readonly currentPassword: unknown;
    readonly context: SessionContext;
  },
): Promise<EmailChangeRequestResult> {
  const newEmail = parseEmail(input.newEmail);
  if (newEmail === null) return { ok: false, failure: 'invalid_email' };

  const password = parsePassword(input.currentPassword);
  if (password === null) return { ok: false, failure: 'wrong_password' };

  const subject = accountSubjectFor('email-change', String(input.customerId));
  const state = await throttleState(tx, CUSTOMER_EMAIL_CHANGE_THROTTLE, subject);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const rows = await tx
    .select({
      email: customer.email,
      status: customer.status,
      secretHash: customerCredential.secretHash,
    })
    .from(customer)
    .leftJoin(
      customerCredential,
      sql`${customerCredential.customerId} = ${customer.id}
          and ${customerCredential.kind} = 'password'
          and ${customerCredential.revokedAt} is null`,
    )
    .where(sql`${customer.id} = ${input.customerId}`);

  const row = rows[0];
  if (row === undefined || row.status !== 'active' || row.secretHash === null) {
    return { ok: false, failure: 'wrong_password' };
  }
  if (!(await verifyPassword(password, row.secretHash))) {
    await recordFailedAttempt(tx, CUSTOMER_EMAIL_CHANGE_THROTTLE, subject);
    return { ok: false, failure: 'wrong_password' };
  }
  if (row.email.toLowerCase() === newEmail) return { ok: false, failure: 'same_email' };

  const taken = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(sql`lower(${customer.email}) = ${newEmail} and ${customer.id} <> ${input.customerId}`);
  if (taken[0] !== undefined) return { ok: false, failure: 'email_taken' };

  const token = createOpaqueToken();
  const now = new Date();
  await tx
    .update(customerEmailChange)
    .set({ usedAt: now })
    .where(sql`${customerEmailChange.customerId} = ${input.customerId} and ${customerEmailChange.usedAt} is null`);

  await tx.insert(customerEmailChange).values({
    customerId: input.customerId,
    newEmail,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(now.getTime() + CUSTOMER_EMAIL_CHANGE_TOKEN_MS),
    requestedIpHash: input.context.ipHash,
  });

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.email_change_requested',
    entityType: 'customer',
    entityId: input.customerId,
    after: { pending: true },
  });

  return { ok: true, token, newEmail };
}

export type EmailChangeConfirmFailure = 'invalid_token' | 'email_taken';

export type EmailChangeConfirmResult =
  | { readonly ok: true; readonly customerId: number; readonly previousEmail: string; readonly newEmail: string }
  | { readonly ok: false; readonly failure: EmailChangeConfirmFailure };

/**
 * Consumes a confirmation token and moves the account to the requested address.
 *
 * Every session is revoked at that moment: the login identifier changed, and a session established
 * against the old address is not one the new address can vouch for. The page tells the customer to sign
 * in again with the new address, which is also the first proof the change is usable.
 */
export async function confirmCustomerEmailChange(
  tx: Transaction,
  input: { readonly rawToken: unknown },
): Promise<EmailChangeConfirmResult> {
  const rawToken = typeof input.rawToken === 'string' ? input.rawToken.trim() : '';
  if (!looksLikeToken(rawToken)) return { ok: false, failure: 'invalid_token' };

  const rows = await tx
    .select({
      changeId: customerEmailChange.id,
      customerId: customerEmailChange.customerId,
      newEmail: customerEmailChange.newEmail,
      previousEmail: customer.email,
    })
    .from(customerEmailChange)
    .innerJoin(customer, sql`${customer.id} = ${customerEmailChange.customerId}`)
    .where(
      sql`${customerEmailChange.tokenHash} = ${sha256Hex(rawToken)}
          and ${customerEmailChange.usedAt} is null
          and ${customerEmailChange.expiresAt} > now()
          and ${customer.status} = 'active'
          and ${customer.deletedAt} is null`,
    );

  const target = rows[0];
  if (target === undefined) return { ok: false, failure: 'invalid_token' };

  const now = new Date();
  try {
    await tx
      .update(customer)
      .set({ email: target.newEmail, emailVerifiedAt: now, updatedAt: now })
      .where(sql`${customer.id} = ${target.customerId}`);
  } catch {
    // The unique index on `lower(email)` is the authority; a race that arrived after the check above
    // answers as a taken address rather than a 500.
    return { ok: false, failure: 'email_taken' };
  }

  const consumed = await tx
    .update(customerEmailChange)
    .set({ usedAt: now })
    .where(sql`${customerEmailChange.id} = ${target.changeId} and ${customerEmailChange.usedAt} is null`)
    .returning({ id: customerEmailChange.id });
  if (consumed.length === 0) {
    // A concurrent second click: undo nothing, because the first click already moved the address.
    return { ok: true, customerId: target.customerId, previousEmail: target.previousEmail, newEmail: target.newEmail };
  }

  const sessionsRevoked = await revokeAllCustomerSessions(tx, target.customerId, 'email_change');

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.email_changed',
    entityType: 'customer',
    entityId: target.customerId,
    before: { emailChanged: true },
    after: { emailChanged: true, sessionsRevoked },
  });

  return { ok: true, customerId: target.customerId, previousEmail: target.previousEmail, newEmail: target.newEmail };
}
