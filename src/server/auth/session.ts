/**
 * Staff sessions.
 *
 * Server-side sessions in a separate table from customer sessions, so no single query can return
 * both kinds of principal and a missing `WHERE` cannot escalate privilege (`docs/data-model.md` 4.7).
 *
 * Properties this module is responsible for:
 *
 * - **Opaque tokens.** 256 bits of randomness; only the SHA-256 digest is stored, so a database read
 *   does not yield a usable session. The raw token exists in exactly two places: the httpOnly cookie
 *   and the response that sets it. It is never returned in a body, a URL, a log or an audit record.
 * - **Rotation on authentication.** Sign-in mints a new row and a new token; an existing token is
 *   never promoted, so a pre-authentication token cannot become an authenticated one (fixation).
 * - **Two lifetimes.** A sliding idle limit and a fixed absolute ceiling, both server-side facts. The
 *   idle limit can never extend past the ceiling, which the schema also enforces.
 * - **Immediate revocation.** Logout, a role change, a credential change and an administrative
 *   revocation all write `revoked_at`, and validation refuses a revoked row - there is no cached
 *   principal and no grace period.
 */

import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { staffSession, staffUser } from '@/db/schema';
import { serverEnv } from '@/server/env';

import { STAFF_SESSION_COOKIE, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_INTERVAL_MS } from './constants';
import { loadStaffPermissions, loadStaffRoles } from '../authz/roles';
import type { StaffPrincipal } from '../authz/principal';
import { createOpaqueToken, deriveCsrfToken, looksLikeToken, sha256Hex } from './tokens';

export type SessionContext = {
  /** Digest of the client address, for correlation only. Never the address itself. */
  readonly ipHash: string | null;
  /** Digest of the user agent, for correlation only. */
  readonly userAgentHash: string | null;
};

export function sessionContextFrom(headers: Headers): SessionContext {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const userAgent = headers.get('user-agent') ?? '';
  return {
    ipHash: forwardedFor === '' ? null : sha256Hex(`ip:${forwardedFor}`),
    userAgentHash: userAgent === '' ? null : sha256Hex(`ua:${userAgent}`),
  };
}

/**
 * Creates a session and returns the **raw** token. The caller must place it in the cookie and
 * discard it; nothing else may store it.
 */
export async function createStaffSession(
  tx: Transaction,
  staffUserId: number,
  context: SessionContext,
): Promise<{ token: string; sessionId: string; absoluteExpiresAt: Date }> {
  const token = createOpaqueToken();
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);

  const rows = await tx
    .insert(staffSession)
    .values({
      staffUserId,
      tokenHash: sha256Hex(token),
      idleExpiresAt: new Date(now + SESSION_IDLE_MS),
      absoluteExpiresAt,
      userAgentHash: context.userAgentHash,
      ipHash: context.ipHash,
    })
    .returning({ id: staffSession.id });

  const sessionId = rows[0]?.id;
  if (sessionId === undefined) throw new Error('staff session insert returned no id');

  return { token, sessionId, absoluteExpiresAt };
}

export type ResolvedSession = { principal: StaffPrincipal; sessionId: string; rawToken: string };

/**
 * Resolves a session token to a principal, or `null`.
 *
 * Every rejection path returns `null` rather than a distinguishable error, so an expired session, a
 * revoked session, a disabled account and a forged token are indistinguishable to the caller and to
 * the client. The caller turns `null` into a redirect to sign-in, never into a message that reveals
 * why.
 *
 * A successful resolution also performs the sliding-idle update, but at most once per
 * `SESSION_TOUCH_INTERVAL_MS`, so a request does not become a write by default.
 */
export async function resolveStaffSession(
  tx: Transaction,
  rawToken: string | undefined,
): Promise<ResolvedSession | null> {
  if (rawToken === undefined || !looksLikeToken(rawToken)) return null;

  const rows = await tx
    .select({
      sessionId: staffSession.id,
      staffUserId: staffSession.staffUserId,
      idleExpiresAt: staffSession.idleExpiresAt,
      absoluteExpiresAt: staffSession.absoluteExpiresAt,
      revokedAt: staffSession.revokedAt,
      lastSeenAt: staffSession.lastSeenAt,
      status: staffUser.status,
      email: staffUser.email,
      displayName: staffUser.displayName,
    })
    .from(staffSession)
    .innerJoin(staffUser, sql`${staffUser.id} = ${staffSession.staffUserId}`)
    .where(sql`${staffSession.tokenHash} = ${sha256Hex(rawToken)}`);

  const row = rows[0];
  if (row === undefined) return null;
  if (row.revokedAt !== null) return null;
  if (row.status !== 'active') return null;

  const now = Date.now();
  if (row.absoluteExpiresAt.getTime() <= now) return null;
  if (row.idleExpiresAt.getTime() <= now) return null;

  if (now - row.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    // `least(...)` keeps the sliding limit inside the absolute ceiling; the schema CHECK enforces the
    // same rule, so a clamp here and a rejection there cannot disagree.
    await tx
      .update(staffSession)
      .set({
        lastSeenAt: new Date(now),
        idleExpiresAt: sql`least(now() + ${sql.raw(`interval '${SESSION_IDLE_MS} milliseconds'`)}, ${staffSession.absoluteExpiresAt})`,
      })
      .where(sql`${staffSession.id} = ${row.sessionId}`);
  }

  const roles = await loadStaffRoles(tx, row.staffUserId);
  const permissions = await loadStaffPermissions(tx, row.staffUserId);

  return {
    sessionId: row.sessionId,
    rawToken,
    principal: {
      sessionId: row.sessionId,
      staffUserId: row.staffUserId,
      email: row.email,
      displayName: row.displayName,
      roles,
      permissions,
      isOwnerLevel: roles.some((role) => role.isOwnerLevel),
      absoluteExpiresAt: row.absoluteExpiresAt,
      idleExpiresAt: row.idleExpiresAt,
      csrfToken: deriveCsrfToken(rawToken),
    },
  };
}

/** Revokes one session. Returns false when the row was already revoked or absent. */
export async function revokeSession(
  tx: Transaction,
  sessionId: string,
  reason: 'logout' | 'password_change' | 'admin_revoke' | 'reuse_detected',
): Promise<boolean> {
  const rows = await tx
    .update(staffSession)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(sql`${staffSession.id} = ${sessionId} and ${staffSession.revokedAt} is null`)
    .returning({ id: staffSession.id });
  return rows.length > 0;
}

/**
 * `Secure` is set whenever the deployment is not local development or test.
 *
 * A `Secure` cookie is not sent over plain HTTP, so setting it locally would make sign-in silently
 * fail; leaving it off in production would be the actual vulnerability. The condition keys on the
 * validated environment rather than on the request, so a header cannot influence it.
 */
export function cookiesMustBeSecure(): boolean {
  const environment = serverEnv().environment;
  return environment === 'production' || environment === 'preview';
}

function sessionCookieOptions(): { httpOnly: true; secure: boolean; sameSite: 'lax'; path: string; maxAge: number } {
  return {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/',
    // The browser drops the cookie no later than the server-side absolute ceiling.
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
  };
}

/** Writes the session cookie. Server Action / route handler only. */
export async function setSessionCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set(STAFF_SESSION_COOKIE, rawToken, sessionCookieOptions());
}

/**
 * Clears the session cookie.
 *
 * The value is overwritten with an empty string and expired rather than merely deleted, because a
 * delete that fails to match the path would leave a live cookie in the browser.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const { httpOnly, secure, sameSite, path } = sessionCookieOptions();
  store.set(STAFF_SESSION_COOKIE, '', { httpOnly, secure, sameSite, path, maxAge: 0 });
}

/** Reads the raw token from the cookie jar. The value never leaves the server. */
export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(STAFF_SESSION_COOKIE)?.value;
}

/** Reads the raw token from a `Request` (route handlers), for the same purpose. */
export function readSessionCookieFromRequest(request: Request): string | undefined {
  return parseCookieHeader(request.headers.get('cookie'))[STAFF_SESSION_COOKIE];
}

/** Minimal, defensive cookie parsing: the header is untrusted input. */
export function parseCookieHeader(header: string | null): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (header === null) return parsed;
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
