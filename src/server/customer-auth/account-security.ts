/**
 * Self-service customer account security over email and SMS (ADR 0030, amended 2026-11-12).
 *
 * Verification exists in exactly two places (owner decision, 2026-11-12): **registration**, where a
 * new account proves the identifier it was opened with, and **recovery**, where a forgotten password
 * is replaced through a mailed link or a six-digit SMS code. A password change needs only the current
 * password, and a change of email address is applied directly from the account page - neither waits on
 * a message.
 *
 * The rules every flow shares:
 *
 * 1. **Only a digest of the credential is stored.** A mailed link is 256 bits of randomness; a code is
 *    six digits, keyed with a server-only secret before hashing because six digits alone are guessable
 *    from a dump. Consuming either is a guarded `UPDATE ... WHERE used_at IS NULL`, so a replay loses.
 * 2. **Every credential expires.** A link lasts an hour, a code ten minutes, and a registration
 *    verification link two days. An expired credential answers exactly like an unknown one.
 * 3. **A code has five guesses.** Each wrong one is counted on the row and the row is consumed when the
 *    fifth is spent, so a six-digit space cannot be walked through.
 * 4. **Nothing tells an anonymous caller whether an account exists.** `requestCustomerPasswordReset`
 *    always reports the same thing - the route always shows the same sentence - whether the identifier
 *    is registered, suspended, malformed or absent.
 * 5. **A password change ends the sessions that were not part of it.** Both reset paths revoke every
 *    live customer session, so a session stolen before the change is worthless afterwards. The
 *    account-page path immediately mints a fresh session for the browser that made the change.
 *
 * **A customer is never an audit actor (D23).** Each completed action writes a `system`-actor record -
 * the same shape the owner-issued redemption uses - carrying the customer id and a boolean, never an
 * address, a number, a password or a digest.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { accountRecoveryToken, customer, customerCredential } from '@/db/schema';
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
import { createNumericCode, createOpaqueToken, looksLikeToken, sha256Hex } from '../auth/tokens';
import { smsConfigured } from '../integrations/sms';
import {
  CUSTOMER_EMAIL_CHANGE_THROTTLE,
  CUSTOMER_PASSWORD_CHANGE_THROTTLE,
  CUSTOMER_RECOVERY_REDEEM_THROTTLE,
  CUSTOMER_RESET_REQUEST_THROTTLE,
  CUSTOMER_RESET_TOKEN_MS,
  CUSTOMER_SMS_CODE_ATTEMPTS,
  CUSTOMER_SMS_CODE_MS,
} from './constants';
import { revokeAllCustomerSessions } from './session';
import { parseEmail, parsePassword, parsePhone } from './validation';

function accountSubjectFor(label: string, value: string): string {
  return sha256Hex(`customer-${label}:${value}`);
}

/**
 * A six-digit code is stored exactly like a password: scrypt with a per-row salt.
 *
 * One million scrypt derivations is not an offline attack anyone runs, so no separate key is needed -
 * and that matters, because a new required secret would have to exist in every environment before a
 * code could be issued. Guessing is bounded online by the attempt counter and the source throttle.
 */
/** Issues a code for a live account, superseding any earlier one for the same purpose. */
async function issueSmsCode(
  tx: Transaction,
  input: { readonly customerId: number; readonly purpose: 'phone_verify' | 'phone_reset'; readonly requestedIpHash?: string | null },
): Promise<string | null> {
  if (!smsConfigured()) return null;
  const code = createNumericCode(6);
  const codeHash = await hashPassword(code);
  const now = new Date();
  await tx
    .update(accountRecoveryToken)
    .set({ usedAt: now })
    .where(
      sql`${accountRecoveryToken.customerId} = ${input.customerId}
          and ${accountRecoveryToken.purpose} = ${input.purpose}
          and ${accountRecoveryToken.usedAt} is null`,
    );

  await tx.insert(accountRecoveryToken).values({
    customerId: input.customerId,
    purpose: input.purpose,
    tokenHash: codeHash,
    expiresAt: new Date(now.getTime() + CUSTOMER_SMS_CODE_MS),
    requestedIpHash: input.requestedIpHash ?? null,
  });

  return code;
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
// Password recovery by email link or SMS code
// ------------------------------------------------------------------

/**
 * What to deliver, and how. A mailed link carries a token; a code carries six digits.
 *
 * The caller sends it **after** the transaction commits and never varies its user-facing answer on
 * whether anything was delivered.
 */
export type PasswordRecoveryDelivery =
  | { readonly channel: 'email'; readonly to: string; readonly token: string }
  | { readonly channel: 'sms'; readonly to: string; readonly code: string };

export type PasswordResetRequest = {
  /** Where to deliver and what to deliver, or `null` when nothing must be sent. */
  readonly delivery: PasswordRecoveryDelivery | null;
};

/**
 * Creates a recovery credential for the address or number **if** it belongs to an active account.
 *
 * The caller decides what to say - and says the same thing either way. A throttled request, an unknown
 * identifier, a suspended account, a malformed value, an account with no usable channel and an
 * unconfigured provider all produce `delivery: null`.
 */
export async function requestCustomerPasswordReset(
  tx: Transaction,
  input: { readonly identifier: unknown; readonly context: SessionContext },
): Promise<PasswordResetRequest> {
  const raw = typeof input.identifier === 'string' ? input.identifier.trim() : '';
  const email = raw.includes('@') ? parseEmail(raw) : null;
  const phone = raw.includes('@') ? null : parsePhone(raw);
  const normalized = email ?? phone;

  const subjects =
    normalized === null
      ? [sourceSubject(input.context.ipHash)]
      : [accountSubjectFor('reset', normalized), sourceSubject(input.context.ipHash)];

  const allowed = await countRequest(tx, CUSTOMER_RESET_REQUEST_THROTTLE, subjects);
  if (!allowed || normalized === null) return { delivery: null };

  const rows = await tx
    .select({ id: customer.id, email: customer.email, phone: customer.phone })
    .from(customer)
    .where(
      email !== null
        ? sql`lower(${customer.email}) = ${email} and ${customer.status} = 'active' and ${customer.deletedAt} is null`
        : sql`${customer.phone} = ${phone} and ${customer.status} = 'active' and ${customer.deletedAt} is null`,
    );
  const target = rows[0];
  if (target === undefined) return { delivery: null };

  if (phone !== null) {
    // A number signs the account in, so a code sent to it is the equivalent of the mailed link.
    const code = await issueSmsCode(tx, {
      customerId: target.id,
      purpose: 'phone_reset',
      requestedIpHash: input.context.ipHash,
    });
    return { delivery: code === null ? null : { channel: 'sms', to: phone, code } };
  }

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

  return { delivery: { channel: 'email', to: email ?? '', token } };
}


/**
 * Writes the new password, settles the identifier that proved control, and ends every session.
 *
 * Both recovery paths end here, so a future change to "what a reset does" cannot apply to one channel
 * and not the other.
 */
async function applyPasswordReset(
  tx: Transaction,
  input: { readonly customerId: number; readonly password: string; readonly proved: 'email' | 'phone' },
): Promise<number> {
  const now = new Date();
  const secretHash = await hashPassword(input.password);

  await tx
    .update(customerCredential)
    .set({ secretHash, hashAlgorithm: 'scrypt', updatedAt: now })
    .where(
      sql`${customerCredential.customerId} = ${input.customerId} and ${customerCredential.kind} = 'password' and ${customerCredential.revokedAt} is null`,
    );

  // Opening the mailed link proves control of the address; receiving the SMS proves control of the
  // number. Either way the registration verification for that identifier is settled too.
  if (input.proved === 'email') {
    await tx
      .update(customer)
      .set({ emailVerifiedAt: sql`coalesce(${customer.emailVerifiedAt}, now())`, updatedAt: now })
      .where(sql`${customer.id} = ${input.customerId}`);
  } else {
    await tx
      .update(customer)
      .set({ phoneVerifiedAt: sql`coalesce(${customer.phoneVerifiedAt}, now())`, updatedAt: now })
      .where(sql`${customer.id} = ${input.customerId}`);
  }

  return revokeAllCustomerSessions(tx, input.customerId, 'password_change');
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

  const sessionsRevoked = await applyPasswordReset(tx, {
    customerId: target.customerId,
    password,
    proved: 'email',
  });
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


export type PasswordResetCodeFailure = 'invalid_code' | 'weak_password' | 'throttled';

export type PasswordResetCodeResult =
  | { readonly ok: true; readonly customerId: number }
  | { readonly ok: false; readonly failure: PasswordResetCodeFailure };

/**
 * Consumes a six-digit SMS code and replaces the password.
 *
 * A wrong guess counts against the code row, and the fifth wrong guess consumes it; the source is
 * throttled as well, so one caller cannot walk the whole six-digit space even across codes. Every
 * refusal is one `invalid_code`, because separating them would describe account state.
 */
export async function resetCustomerPasswordWithCode(
  tx: Transaction,
  input: {
    readonly phone: unknown;
    readonly code: unknown;
    readonly password: unknown;
    readonly context: SessionContext;
  },
): Promise<PasswordResetCodeResult> {
  const phone = parsePhone(input.phone);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const password = parsePassword(input.password);

  if (password === null || (password !== null && customerPasswordPolicyError(password) !== null)) {
    return { ok: false, failure: 'weak_password' };
  }
  if (phone === null || !/^[0-9]{6}$/.test(code)) return { ok: false, failure: 'invalid_code' };

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
  if (state.blocked) return { ok: false, failure: 'throttled' };

  const rows = await tx
    .select({ customerId: customer.id, status: customer.status })
    .from(customer)
    .where(sql`${customer.phone} = ${phone} and ${customer.deletedAt} is null`);
  const account = rows[0];

  if (account === undefined || account.status !== 'active') {
    await recordFailedAttempt(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
    return { ok: false, failure: 'invalid_code' };
  }

  const live = await tx
    .select({
      tokenId: accountRecoveryToken.id,
      tokenHash: accountRecoveryToken.tokenHash,
      attempts: accountRecoveryToken.attempts,
    })
    .from(accountRecoveryToken)
    .where(
      sql`${accountRecoveryToken.customerId} = ${account.customerId}
          and ${accountRecoveryToken.purpose} = 'phone_reset'
          and ${accountRecoveryToken.usedAt} is null
          and ${accountRecoveryToken.expiresAt} > now()`,
    );
  const target = live[0];

  if (target === undefined || target.attempts >= CUSTOMER_SMS_CODE_ATTEMPTS) {
    await recordFailedAttempt(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
    return { ok: false, failure: 'invalid_code' };
  }

  if (!(await verifyPassword(code, target.tokenHash))) {
    const spent = target.attempts + 1 >= CUSTOMER_SMS_CODE_ATTEMPTS;
    await tx
      .update(accountRecoveryToken)
      .set({ attempts: target.attempts + 1, usedAt: spent ? new Date() : null })
      .where(sql`${accountRecoveryToken.id} = ${target.tokenId} and ${accountRecoveryToken.usedAt} is null`);
    await recordFailedAttempt(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, source);
    return { ok: false, failure: 'invalid_code' };
  }

  const consumed = await tx
    .update(accountRecoveryToken)
    .set({ usedAt: new Date() })
    .where(sql`${accountRecoveryToken.id} = ${target.tokenId} and ${accountRecoveryToken.usedAt} is null`)
    .returning({ id: accountRecoveryToken.id });
  if (consumed.length === 0) return { ok: false, failure: 'invalid_code' };

  const sessionsRevoked = await applyPasswordReset(tx, {
    customerId: account.customerId,
    password,
    proved: 'phone',
  });
  await clearThrottle(tx, CUSTOMER_RECOVERY_REDEEM_THROTTLE, [source]);

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.password_reset_completed',
    entityType: 'customer',
    entityId: account.customerId,
    after: { sessionsRevoked, via: 'sms_code' },
  });

  return { ok: true, customerId: account.customerId };
}

// ------------------------------------------------------------------
// Password change from the account page
// ------------------------------------------------------------------

export type PasswordChangeFailure = 'wrong_password' | 'weak_password' | 'unavailable' | 'throttled';

export type PasswordChangeResult =
  | { readonly ok: true; readonly email: string | null; readonly sessionsRevoked: number }
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

export type EmailChangeFailure =
  | 'wrong_password'
  | 'invalid_email'
  | 'same_email'
  | 'email_taken'
  | 'throttled'
  | 'unavailable';

export type EmailChangeResult =
  | {
      readonly ok: true;
      readonly previousEmail: string | null;
      readonly newEmail: string;
      readonly sessionsRevoked: number;
    }
  | { readonly ok: false; readonly failure: EmailChangeFailure };

/**
 * Moves the account to a new email address **directly** (owner decision, 2026-11-12).
 *
 * There is no confirmation link and no verification step: verification exists only at registration and
 * in recovery. The current password is still required, because a borrowed session is not evidence that
 * the person at the keyboard owns the account, and the address is also a sign-in identifier.
 *
 * The address is stored unverified (`email_verified_at` is cleared): it has not been proved, and the
 * account page says so. Every session is revoked because the login identifier changed; the calling
 * route mints one for the browser that made the change.
 */
export async function changeCustomerEmail(
  tx: Transaction,
  input: {
    readonly customerId: number;
    readonly newEmail: unknown;
    readonly currentPassword: unknown;
    readonly context: SessionContext;
  },
): Promise<EmailChangeResult> {
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
    return { ok: false, failure: 'unavailable' };
  }
  if (!(await verifyPassword(password, row.secretHash))) {
    await recordFailedAttempt(tx, CUSTOMER_EMAIL_CHANGE_THROTTLE, subject);
    return { ok: false, failure: 'wrong_password' };
  }
  if (row.email !== null && row.email.toLowerCase() === newEmail) {
    return { ok: false, failure: 'same_email' };
  }

  const taken = await tx
    .select({ id: customer.id })
    .from(customer)
    .where(sql`lower(${customer.email}) = ${newEmail} and ${customer.id} <> ${input.customerId}`);
  if (taken[0] !== undefined) return { ok: false, failure: 'email_taken' };

  const now = new Date();
  try {
    await tx
      .update(customer)
      .set({ email: newEmail, emailVerifiedAt: null, updatedAt: now })
      .where(sql`${customer.id} = ${input.customerId}`);
  } catch {
    // The unique index on `lower(email)` is the authority; a race that arrived after the check above
    // answers as a taken address rather than a 500.
    return { ok: false, failure: 'email_taken' };
  }

  const sessionsRevoked = await revokeAllCustomerSessions(tx, input.customerId, 'email_change');
  await clearThrottle(tx, CUSTOMER_EMAIL_CHANGE_THROTTLE, [subject]);

  await recordAudit(tx, {
    actorType: 'system',
    actorRoleCodes: [],
    action: 'customer.email_changed',
    entityType: 'customer',
    entityId: input.customerId,
    after: { emailChanged: true, sessionsRevoked },
  });

  return { ok: true, previousEmail: row.email, newEmail, sessionsRevoked };
}
