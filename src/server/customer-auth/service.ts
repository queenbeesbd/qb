/**
 * Customer authentication service (D17, ADR 0012).
 *
 * The flows this phase supports:
 *
 * - **Registration** lives in `./registration`: the identifier is proved with a six-digit code
 *   **before** the account exists (ADR 0038). This module keeps sign-in and the ban primitives.
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
import { hashPassword, verifyPassword } from '../auth/password';
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
import { parseEmail, parsePhone } from './validation';

/** The two identifiers an account can be signed in with (2026-11-11). */
export type CustomerIdentifierKind = 'email' | 'phone';

/** One code for every credential failure. The caller maps it to one localized message. */
export type CustomerSignInFailure = 'invalid' | 'throttled';

export type CustomerSignInResult =
  | { ok: true; customerId: number; rawToken: string; absoluteExpiresAt: Date }
  | { ok: false; failure: CustomerSignInFailure; blockedUntil: Date | null };

/**
 * A hash of a value no one can supply, used to equalise the work done for an unknown account.
 * Computed once per process: the point is the cost of verification, not the value.
 */
const DUMMY_HASH_PROMISE = hashPassword(createOpaqueToken());

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
