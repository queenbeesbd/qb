/**
 * Customer authentication service (D17, ADR 0012).
 *
 * The flows this phase supports:
 *
 * - **registerCustomer** - email and password, hashed with scrypt, creating the account and its first
 *   credential. Email is the sole registration identifier; a phone number is not collected here at all.
 * - **signInCustomer** - throttled by account and by source, generic failure, and a new session issued
 *   on success (never a promoted one).
 * - **signOutCustomer** - revokes the row; the route clears the cookie.
 * - **suspendCustomer** - the **D20 ban primitive**: status becomes `suspended`, every live session is
 *   revoked at that moment, and an audited reason and actor are recorded.
 *
 * Three deliberate boundaries:
 *
 * 1. **No self-service recovery exists.** There is no reset endpoint, no recovery token issued for a
 *    customer, and no mail provider to deliver one. ADR 0012 records the limitation and the
 *    owner-operated process that replaces it, which belongs to a later phase.
 * 2. **A customer action is never written to `audit_event`.** D23 makes a customer a non-actor type in
 *    the audit trail; customer business activity is recorded as `order_event`, and authentication abuse
 *    control is `auth_throttle`. A ban is different: it is an administrative, staff-actor record.
 * 3. **Sign-in reveals nothing.** Every credential failure returns one code, performs comparable work
 *    whether or not the account exists (a dummy verification runs when it does not), and never names the
 *    address in a row or a log.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customer, customerCredential } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError } from '../authz/authorize';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password';
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
import { createCustomerSession, revokeAllCustomerSessions, revokeCustomerSession } from './session';
import { parseDisplayName, parseEmail, parsePassword } from './validation';

/** One code for every credential failure. The caller maps it to one localized message. */
export type CustomerSignInFailure = 'invalid' | 'throttled';

export type CustomerSignInResult =
  | { ok: true; customerId: number; rawToken: string; absoluteExpiresAt: Date }
  | { ok: false; failure: CustomerSignInFailure; blockedUntil: Date | null };

export type CustomerRegisterFailure =
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_name'
  | 'email_taken'
  | 'throttled';

export type CustomerRegisterResult =
  | { ok: true; customerId: number }
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
function customerAccountSubject(email: string): string {
  return sha256Hex(`customer-account:${email}`);
}

/**
 * Registers a customer account.
 *
 * Registration is throttled **by source only** - there is no account yet - and a duplicate address is
 * reported explicitly. That is a deliberate, accepted enumeration surface: a person must be told the
 * address is taken to choose another one, and unlike sign-in there is no credential to steal by
 * learning that an address exists.
 */
export async function registerCustomer(
  tx: Transaction,
  input: { email: unknown; password: unknown; displayName: unknown; context: SessionContext },
): Promise<CustomerRegisterResult> {
  const email = parseEmail(input.email);
  if (email === null) return { ok: false, failure: 'invalid_email' };

  const password = parsePassword(input.password);
  if (password === null || passwordPolicyError(password) !== null) {
    return { ok: false, failure: 'weak_password' };
  }

  const name = parseDisplayName(input.displayName);
  if (!name.ok) return { ok: false, failure: 'invalid_name' };

  const source = sourceSubject(input.context.ipHash);
  const state = await throttleState(tx, CUSTOMER_REGISTER_THROTTLE, source);
  if (state.blocked) {
    return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };
  }

  const secretHash = await hashPassword(password);

  // The insert runs inside a **savepoint** (a nested transaction), because a unique-violation is a
  // normal outcome here and PostgreSQL aborts the whole transaction on any error. Catching it in the
  // outer transaction would leave the transaction unusable, so the loser is rolled back to the
  // savepoint and the caller can still record the throttled attempt. The unique index remains the
  // authority: a concurrent registration of the same address loses the race rather than creating a
  // second account.
  let customerId: number | null = null;
  try {
    customerId = await tx.transaction(async (inner) => {
      const rows = await inner
        .insert(customer)
        .values({ email, displayName: name.value })
        .returning({ id: customer.id });
      const inserted = rows[0]?.id;
      if (inserted === undefined) throw new Error('customer insert returned no id');
      return inserted;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  if (customerId === null) {
    // A duplicate attempt is counted, so probing addresses is bounded like any other failure.
    await recordFailedAttempt(tx, CUSTOMER_REGISTER_THROTTLE, source);
    return { ok: false, failure: 'email_taken' };
  }

  await tx.insert(customerCredential).values({
    customerId,
    kind: 'password',
    secretHash,
    hashAlgorithm: 'scrypt',
  });

  // A successful registration clears the source counter, so a person's own typos do not lock them out.
  await clearThrottle(tx, CUSTOMER_REGISTER_THROTTLE, [source]);

  return { ok: true, customerId };
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
    email: string;
    password: string;
    context: SessionContext;
    createSession: (customerId: number) => Promise<{ token: string; absoluteExpiresAt: Date }>;
  },
): Promise<CustomerSignInResult> {
  const email = parseEmail(input.email);
  const subjects =
    email === null
      ? [sourceSubject(input.context.ipHash)]
      : [customerAccountSubject(email), sourceSubject(input.context.ipHash)];

  for (const subject of subjects) {
    const state = await throttleState(tx, CUSTOMER_LOGIN_THROTTLE, subject);
    if (state.blocked) {
      return { ok: false, failure: 'throttled', blockedUntil: state.blockedUntil };
    }
  }

  const rows =
    email === null
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
          .where(sql`lower(${customer.email}) = ${email}`);

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
