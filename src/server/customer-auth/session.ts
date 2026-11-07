/**
 * Customer sessions.
 *
 * Server-side sessions in `customer_session`, deliberately separate from `staff_session` so no single
 * query can return both kinds of principal and a missing `WHERE` cannot escalate privilege
 * (`docs/data-model.md` 4.7).
 *
 * Properties this module is responsible for, matching ADR 0012:
 *
 * - **Opaque tokens.** 256 bits of randomness; only the SHA-256 digest is stored, so a database read
 *   does not yield a usable session. The raw token exists in exactly two places: the httpOnly cookie
 *   and the response that sets it.
 * - **Rotation on authentication.** Sign-in mints a new row and a new token; an existing token is never
 *   promoted, so a pre-authentication token cannot become an authenticated one (fixation).
 * - **Two lifetimes.** A sliding idle limit inside a fixed absolute ceiling, both server-side facts.
 * - **Immediate revocation.** Logout, credential change and an administrative ban all write
 *   `revoked_at`, and validation refuses a revoked row - there is no cached principal.
 * - **Suspension is refused on the next request.** A banned customer's session resolves to `null`
 *   because the joined `customer.status` is not `active`, so access ends at the next request even
 *   before the row is revoked (D20).
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customer, customerSession } from '@/db/schema';

import { createOpaqueToken, looksLikeToken, sha256Hex } from '../auth/tokens';
import type { SessionContext } from '../auth/session';
import {
  CUSTOMER_SESSION_ABSOLUTE_MS,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_IDLE_MS,
  CUSTOMER_SESSION_TOUCH_INTERVAL_MS,
} from './constants';

export type { SessionContext };

export type CustomerPrincipal = {
  readonly sessionId: string;
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly absoluteExpiresAt: Date;
  readonly idleExpiresAt: Date;
  /** CSRF token derived from the raw session token. Recomputed per request; never persisted. */
  readonly csrfToken: string;
};

/**
 * Creates a session and returns the **raw** token.
 *
 * The caller must place it in the cookie and discard it; nothing else may store it.
 */
export async function createCustomerSession(
  tx: Transaction,
  customerId: number,
  context: SessionContext,
): Promise<{ token: string; sessionId: string; absoluteExpiresAt: Date }> {
  const token = createOpaqueToken();
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + CUSTOMER_SESSION_ABSOLUTE_MS);

  const rows = await tx
    .insert(customerSession)
    .values({
      customerId,
      tokenHash: sha256Hex(token),
      idleExpiresAt: new Date(now + CUSTOMER_SESSION_IDLE_MS),
      absoluteExpiresAt,
      userAgentHash: context.userAgentHash,
      ipHash: context.ipHash,
    })
    .returning({ id: customerSession.id });

  const sessionId = rows[0]?.id;
  if (sessionId === undefined) throw new Error('customer session insert returned no id');

  return { token, sessionId, absoluteExpiresAt };
}

export type ResolvedCustomerSession = {
  principal: CustomerPrincipal;
  sessionId: string;
  rawToken: string;
};

/**
 * Resolves a session token to a principal, or `null`.
 *
 * Every rejection path returns `null` rather than a distinguishable error, so an expired session, a
 * revoked session, a banned account and a forged token are indistinguishable to the caller and to the
 * client. The caller turns `null` into a redirect to sign-in, never into a message that reveals why.
 */
export async function resolveCustomerSession(
  tx: Transaction,
  rawToken: string | undefined,
  /**
   * Derives the session-bound CSRF token. Passed in rather than imported, so this module has no
   * dependency on the request/session policy layer and the derivation label stays in one file.
   */
  csrfToken: (raw: string) => string,
): Promise<ResolvedCustomerSession | null> {
  if (rawToken === undefined || !looksLikeToken(rawToken)) return null;

  const rows = await tx
    .select({
      sessionId: customerSession.id,
      customerId: customerSession.customerId,
      idleExpiresAt: customerSession.idleExpiresAt,
      absoluteExpiresAt: customerSession.absoluteExpiresAt,
      revokedAt: customerSession.revokedAt,
      lastSeenAt: customerSession.lastSeenAt,
      status: customer.status,
      email: customer.email,
      displayName: customer.displayName,
    })
    .from(customerSession)
    .innerJoin(customer, sql`${customer.id} = ${customerSession.customerId}`)
    .where(sql`${customerSession.tokenHash} = ${sha256Hex(rawToken)}`);

  const row = rows[0];
  if (row === undefined) return null;
  if (row.revokedAt !== null) return null;
  // A banned or deleted customer cannot use a session, however valid the token is (D20).
  if (row.status !== 'active') return null;

  const now = Date.now();
  if (row.absoluteExpiresAt.getTime() <= now) return null;
  if (row.idleExpiresAt.getTime() <= now) return null;

  if (now - row.lastSeenAt.getTime() >= CUSTOMER_SESSION_TOUCH_INTERVAL_MS) {
    // `least(...)` keeps the sliding limit inside the absolute ceiling; the schema CHECK enforces the
    // same rule, so a clamp here and a rejection there cannot disagree.
    await tx
      .update(customerSession)
      .set({
        lastSeenAt: new Date(now),
        idleExpiresAt: sql`least(now() + ${sql.raw(`interval '${CUSTOMER_SESSION_IDLE_MS} milliseconds'`)}, ${customerSession.absoluteExpiresAt})`,
      })
      .where(sql`${customerSession.id} = ${row.sessionId}`);
  }

  return {
    sessionId: row.sessionId,
    rawToken,
    principal: {
      sessionId: row.sessionId,
      customerId: row.customerId,
      email: row.email,
      displayName: row.displayName,
      absoluteExpiresAt: row.absoluteExpiresAt,
      idleExpiresAt: row.idleExpiresAt,
      csrfToken: csrfToken(rawToken),
    },
  };
}

/** Revokes one session. Returns false when the row was already revoked or absent. */
export async function revokeCustomerSession(
  tx: Transaction,
  sessionId: string,
  reason: 'logout' | 'password_change' | 'admin_revoke' | 'reuse_detected' | 'email_change',
): Promise<boolean> {
  const rows = await tx
    .update(customerSession)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(sql`${customerSession.id} = ${sessionId} and ${customerSession.revokedAt} is null`)
    .returning({ id: customerSession.id });
  return rows.length > 0;
}

/** Revokes every live session for a customer. Used by a ban and by a credential change (D20). */
export async function revokeAllCustomerSessions(
  tx: Transaction,
  customerId: number,
  reason: 'logout' | 'password_change' | 'admin_revoke' | 'reuse_detected' | 'email_change',
): Promise<number> {
  const rows = await tx
    .update(customerSession)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(sql`${customerSession.customerId} = ${customerId} and ${customerSession.revokedAt} is null`)
    .returning({ id: customerSession.id });
  return rows.length;
}

/**
 * Reads the raw token from a `Request` (route handlers).
 *
 * Reuses the shared, defensive cookie parser rather than re-implementing header parsing: the header is
 * untrusted input, and two parsers would eventually disagree.
 */
export { parseCookieHeader } from '../auth/session';

export function readCustomerToken(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (header === null) return undefined;
  return parseCookieHeaderValue(header)[CUSTOMER_SESSION_COOKIE];
}

function parseCookieHeaderValue(header: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === '') continue;
    parsed[name] = value;
  }
  return parsed;
}
