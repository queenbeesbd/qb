/**
 * Customer authentication service (D17, ADR 0012).
 *
 * The flows this phase supports:
 *
 * - **registerCustomer** - a password together with an email address, and optionally a Bangladeshi
 *   phone number that becomes a second sign-in identifier. Email is always collected (it is the only
 *   address a recovery link can reach); phone-first registration makes the number required.
 * - **signInCustomer** - by phone **or** by email, throttled by account and by source, generic failure,
 *   and a new session issued on success (never a promoted one).
 * - **signOutCustomer** - revokes the row; the route clears the cookie.
 * - **suspendCustomer** - the **D20 ban primitive**: status becomes `suspended`, every live session is
 *   revoked at that moment, and an audited reason and actor are recorded.
 *
 * Three deliberate boundaries:
 *
 * 1. **Self-service recovery now exists** (ADR 0030): a mailed single-use link through Resend, plus the
 *    owner-issued one-time code that remains for a customer who cannot reach the inbox. Neither touches
 *    registration or sign-in - an account is usable the moment it is created, with no verification step.
 * 2. **A customer action is never written to `audit_event`.** D23 makes a customer a non-actor type in
 *    the audit trail; customer business activity is recorded as `order_event`, and authentication abuse
 *    control is `auth_throttle`. A ban is different: it is an administrative, staff-actor record.
 * 3. **Sign-in reveals nothing.** Every credential failure returns one code, performs comparable work
 *    whether or not the account exists (a dummy verification runs when it does not), and never names the
 *    identifier in a row or a log.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customer, customerCredential } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError } from '../authz/authorize';
import { customerPasswordPolicyError, hashPassword, verifyPassword } from '../auth/password';
import type { SessionContext } from '../auth/session';
import {
  clearThrottle,
  recordFailedAttempt,
  sourceSubject,
  throttleState,
} from '../auth/throttle';
import { createOpaqueToken, sha256Hex } from '../auth/tokens';
import {
  CUSTOMER_LOGIN_THROTTLE,
  CUSTOMER_REGISTER_THROTTLE,
} from './constants';
import { issueEmailVerification } from './email-security';
import { createCustomerSession, revokeAllCustomerSessions, revokeCustomerSession } from './session';
import { parseDisplayName, parseEmail, parsePassword, parsePhone } from './validation';

/** The two identifiers an account can be signed in with (2026-11-11). */
export type CustomerIdentifierKind = 'email' | 'phone';

/** One code for every credential failure. The caller maps it to one localized message. */
export type CustomerSignInFailure = 'invalid' | 'throttled';

export type CustomerSignInResult =
  | { ok: true; customerId: number; rawToken: string; absoluteExpiresAt: Date }
  | { ok: false; failure: CustomerSignInFailure; blockedUntil: Date | null };

export type CustomerRegisterFailure =
  | 'invalid_email'
  | 'invalid_phone'
  | 'weak_password'
  | 'invalid_name'
  | 'email_taken'
  | 'phone_taken'
  | 'throttled';

/** The verification mail a successful registration should schedule after its transaction commits. */
export type CustomerVerificationDelivery = { readonly to: string; readonly token: string };

export type CustomerRegisterResult =
  | { ok: true; customerId: number; verification: CustomerVerificationDelivery | null }
  | { ok: false; failure: CustomerRegisterFailure; blockedUntil?: Date | null };

/**
 * A hash of a value no one can supply, used to equalise the work done for an unknown account.
 * Computed once per process: the point is the cost of verification, not the value.
 */
const DUMMY_HASH_PROMISE = hashPassword(createOpaqueToken());

/**
 * True for PostgreSQL `unique_violation`, raised by `customer_email_lower_unique`.
 *
 * The driver wraps the server error, so the SQLSTATE sits on the `cause` of the thrown error rather
 * than on the error itself; the chain is walked deliberately instead of reading one level, because a
 * wrapper that hid the code would silently turn "email already registered" into a 500.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The account subject for customer throttling.
 *
 * The shared helper hashes `account:<value>`; the customer flow prefixes its own label so a customer
 * attempt and an owner attempt on the same address cannot share a counter, even though both flows use
 * the `login` scope (the `(scope, subject_hash, window_start)` key keeps the rows apart).
 */
function customerAccountSubject(kind: CustomerIdentifierKind, value: string): string {
  return sha256Hex(`customer-account:${kind}:${value}`);
}

/** The name PostgreSQL gave the constraint a unique violation broke, if the driver exposes it. */
function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Which identifier the registration form was on.
 *
 * The storefront sends `method` explicitly; a caller that sends neither defaults to the form's own
 * default (phone) when a number was supplied, and to email otherwise. Validation of the number itself
 * still happens below - this only decides whether one is required.
 */
function registrationMethod(raw: unknown, phoneRaw: unknown): CustomerIdentifierKind {
  if (raw === 'email' || raw === 'phone') return raw;
  return typeof phoneRaw === 'string' && phoneRaw.trim() !== '' ? 'phone' : 'email';
}

/**
 * Registers a customer account.
 *
 * Registration is throttled **by source only** - there is no account yet - and a duplicate identifier
 * is reported explicitly. That is a deliberate, accepted enumeration surface: a person must be told the
 * address or number is taken to choose another one, and unlike sign-in there is no credential to steal
 * by learning that one exists.
 *
 * **The email address is required in both modes** (owner decision, 2026-11-11): a phone-first account
 * still needs an address, because the mailed reset link is the only self-service way back in. The
 * address is not verified before the account is usable - the account works immediately, and a
 * verification mail is scheduled after the transaction commits.
 */
export async function registerCustomer(
  tx: Transaction,
  input: {
    method?: unknown;
    email: unknown;
    phone?: unknown;
    password: unknown;
    displayName: unknown;
    context: SessionContext;
  },
): Promise<CustomerRegisterResult> {
  const method = registrationMethod(input.method, input.phone);

  const email = parseEmail(input.email);
  if (email === null) return { ok: false, failure: 'invalid_email' };

  const phone = method === 'phone' ? parsePhone(input.phone) : null;
  if (method === 'phone' && phone === null) return { ok: false, failure: 'invalid_phone' };

  const password = parsePassword(input.password);
  if (password === null || customerPasswordPolicyError(password) !== null) {
    return { ok: false, failure: 'weak_password' };
  }

  const name = parseDisplayName(input.displayName);
  if (!name.ok) return { ok: false, failure: 'invalid_name' };

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_REGISTER_THROTTLE, source);
  if (state.blocked) {
    return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };
  }

  // An explicit read first, so the refusal names the identifier that is actually taken. The unique
  // indexes remain the authority below; this check only improves the notice.
  const taken = await tx
    .select({ email: customer.email, phone: customer.phone })
    .from(customer)
    .where(
      phone === null
        ? sql`lower(${customer.email}) = ${email}`
        : sql`lower(${customer.email}) = ${email} or ${customer.phone} = ${phone}`,
    );
  if (taken.some((row) => row.email.toLowerCase() === email)) {
    return { ok: false, failure: 'email_taken' };
  }
  if (phone !== null && taken.some((row) => row.phone === phone)) {
    return { ok: false, failure: 'phone_taken' };
  }

  const secretHash = await hashPassword(password);

  // The insert runs inside a **savepoint** (a nested transaction), because a unique-violation is a
  // normal outcome here and PostgreSQL aborts the whole transaction on any error. Catching it in the
  // outer transaction would leave the transaction unusable, so the loser is rolled back to the
  // savepoint and the caller can still record the throttled attempt. The unique index remains the
  // authority: a concurrent registration of the same identifier loses the race rather than creating a
  // second account.
  let customerId: number | null = null;
  let conflict: 'email_taken' | 'phone_taken' = 'email_taken';
  try {
    customerId = await tx.transaction(async (inner) => {
      const rows = await inner
        .insert(customer)
        .values({ email, phone, displayName: name.value })
        .returning({ id: customer.id });
      const inserted = rows[0]?.id;
      if (inserted === undefined) throw new Error('customer insert returned no id');
      return inserted;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    conflict = uniqueViolationConstraint(error) === 'customer_phone_unique' ? 'phone_taken' : 'email_taken';
  }

  if (customerId === null) {
    // A duplicate attempt is counted, so probing identifiers is bounded like any other failure.
    await recordFailedAttempt(tx, CUSTOMER_REGISTER_THROTTLE, source);
    return { ok: false, failure: conflict };
  }

  await tx.insert(customerCredential).values({
    customerId,
    kind: 'password',
    secretHash,
    hashAlgorithm: 'scrypt',
  });

  // The account is usable now; the link only confirms the address the customer typed.
  const verification = await issueEmailVerification(tx, { customerId, email });

  // A successful registration clears the source counter, so a person's own typos do not lock them out.
  await clearThrottle(tx, CUSTOMER_REGISTER_THROTTLE, [source]);

  return { ok: true, customerId, verification };
}

/**
 * Attempts a customer sign-in.
 *
 * The throttle is checked before the credential is read, and both subjects are counted on failure, so
 * neither a single account nor a single source can be probed indefinitely. The block applies even when
 * the password happens to be correct, because a blocked subject must not be able to keep trying.
 */
export async function signInCustomer(
  tx: Transaction,
  input: {
    /** `phone` or `email`; when absent, an `@` in the identifier selects email and anything else phone. */
    method?: unknown;
    identifier: unknown;
    password: string;
    context: SessionContext;
    createSession: (customerId: number) => Promise<{ token: string; absoluteExpiresAt: Date }>;
  },
): Promise<CustomerSignInResult> {
  const raw = typeof input.identifier === 'string' ? input.identifier.trim() : '';
  const kind: CustomerIdentifierKind =
    input.method === 'phone' || input.method === 'email'
      ? input.method
      : raw.includes('@')
        ? 'email'
        : 'phone';
  const identifier = kind === 'email' ? parseEmail(raw) : parsePhone(raw);

  const subjects =
    identifier === null
      ? [sourceSubject(input.context.ipHash)]
      : [customerAccountSubject(kind, identifier), sourceSubject(input.context.ipHash)];

  for (const subject of subjects) {
    const state = await throttleState(tx, CUSTOMER_LOGIN_THROTTLE, subject);
    if (state.blocked) {
      return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };
    }
  }

  const rows =
    identifier === null
      ? []
      : await tx
          .select({
            id: customer.id,
            status: customer.status,
            credentialId: customerCredential.id,
            secretHash: customerCredential.secretHash,
          })
          .from(customer)
          .leftJoin(
            customerCredential,
            sql`${customerCredential.customerId} = ${customer.id}
                and ${customerCredential.kind} = 'password'
                and ${customerCredential.revokedAt} is null`,
          )
          .where(
            kind === 'email'
              ? sql`lower(${customer.email}) = ${identifier}`
              : sql`${customer.phone} = ${identifier}`,
          );

  const row = rows[0];

  // Verification runs in every branch so the response time does not disclose whether the account
  // exists.
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
      const verdict = await recordFailedAttempt(tx, CUSTOMER_LOGIN_THROTTLE, subject);
      if (verdict.blockedUntil !== null) blockedUntil = verdict.blockedUntil;
    }
    return { ok: false, failure: 'invalid', blockedUntil };
  }

  const customerId = row.id;
  await clearThrottle(tx, CUSTOMER_LOGIN_THROTTLE, subjects);

  const session = await input.createSession(customerId);
  return { ok: true, customerId, rawToken: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
}

/**
 * The D20 ban primitive.
 *
 * Sets `status = 'suspended'` (guarded on the account currently being active, so a double ban is a
 * conflict rather than a silent second write), revokes **every live session** at that moment, and
 * records the finding with the acting staff member and a required reason.
 *
 * What it deliberately does **not** do: it does not cancel, refund or delete an order, and it touches
 * no payment, refund or reservation state. The order path refuses a suspended account inside its own
 * transaction, which is the enforcement that matters; this function is the administrative action that
 * triggers it.
 *
 * **It is reversible** - see `restoreCustomer` below (owner decision, 2026-10-23).
 */
export async function suspendCustomer(
  tx: Transaction,
  input: {
    customerId: number;
    actorStaffId: number;
    actorRoleCodes: readonly string[];
    reason: string;
  },
): Promise<{ sessionsRevoked: number }> {
  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new ValidationError('a ban requires a reason of at least 10 characters');
  }

  const rows = await tx
    .update(customer)
    .set({ status: 'suspended', updatedAt: new Date() })
    .where(sql`${customer.id} = ${input.customerId} and ${customer.status} = 'active'`)
    .returning({ id: customer.id });
  if (rows.length === 0) throw new ConflictError('customer is not active');

  const sessionsRevoked = await revokeAllCustomerSessions(tx, input.customerId, 'admin_revoke');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: input.actorStaffId,
    actorRoleCodes: [...input.actorRoleCodes],
    action: 'customer.banned',
    entityType: 'customer',
    entityId: input.customerId,
    reason,
    after: { status: 'suspended', sessionsRevoked },
  });

  return { sessionsRevoked };
}

/**
 * Reverses a ban (owner decision, 2026-10-23, ADR 0023).
 *
 * Deliberately the mirror image of `suspendCustomer`, down to the shape: a guarded
 * `suspended -> active` transition, a required reason of 10-500 characters, and one audit record.
 * "Not suspended" is a **conflict**, not a silent success, so a double click cannot look like a second
 * decision and the trail cannot describe a restore that did not happen.
 *
 * What it does **not** do, each for a reason:
 *
 * - **It does not resurrect a session.** Every session was revoked at the ban and stays revoked; the
 *   customer signs in again with their own password. Restoring access is not restoring a login.
 * - **It does not touch an order, refund, reservation or payment.** The fake order that caused the ban
 *   is still there, still counted, still exactly what it was - a ban was never allowed to rewrite
 *   history, so lifting one must not either.
 * - **It does not clear the review flag.** The flag is a separate concept (D20) and is cleared by its
 *   own reasoned action; a restore says "they may shop again", not "the concern was unfounded".
 */
export async function restoreCustomer(
  tx: Transaction,
  input: {
    customerId: number;
    actorStaffId: number;
    actorRoleCodes: readonly string[];
    reason: string;
  },
): Promise<void> {
  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new ValidationError('restoring access requires a reason of at least 10 characters');
  }

  const rows = await tx
    .update(customer)
    .set({ status: 'active', updatedAt: new Date() })
    .where(sql`${customer.id} = ${input.customerId} and ${customer.status} = 'suspended'`)
    .returning({ id: customer.id });
  if (rows.length === 0) throw new ConflictError('customer is not suspended');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: input.actorStaffId,
    actorRoleCodes: [...input.actorRoleCodes],
    action: 'customer.ban_reversed',
    entityType: 'customer',
    entityId: input.customerId,
    reason,
    after: { status: 'active' },
  });
}

/** Signs a customer out by revoking the session the request carried. */
export async function signOutCustomer(tx: Transaction, sessionId: string): Promise<boolean> {
  return revokeCustomerSession(tx, sessionId, 'logout');
}

/** Re-exported for a route that needs to mint a session without importing the session module. */
export { createCustomerSession };
