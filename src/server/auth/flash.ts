/**
 * One-time credential token hand-off.
 *
 * An owner-issued credential token must be read by the owner exactly once and must not travel in a
 * URL, a client bundle, `localStorage` or a log. A redirect therefore cannot carry it, and a Server
 * Component cannot write a cookie to clear it. The mechanism used instead is a short-lived,
 * `httpOnly`, `SameSite=Lax` cookie scoped to the admin path:
 *
 * - `httpOnly`, so no client script can read it and it cannot reach a bundle;
 * - never in the URL, so it cannot leak through history, a referrer header or a shared link;
 * - `path=/admin`, so it is not even sent to storefront requests;
 * - a two-minute lifetime, so the exposure window is a single read;
 * - it holds only the token and its expiry, never a password.
 *
 * The trade-off is stated rather than hidden: while the cookie is live, the token is present in the
 * browser that performed the action - which is the browser the owner is looking at, and the only
 * place it can be displayed to them. Nothing else about the account is in the cookie, and the token
 * is single-use and expires after 30 minutes server-side regardless.
 */

import { cookies } from 'next/headers';

import { cookiesMustBeSecure } from './session';

export const FLASH_COOKIE = 'qb_admin_flash';

export type IssuedTokenFlash = {
  readonly token: string;
  readonly expiresAt: string;
  readonly purpose: string;
  readonly subject: string;
};

/** Two minutes: long enough for one redirect and one render, short enough to be a single read. */
const FLASH_MAX_AGE_SECONDS = 120;

export async function setIssuedTokenFlash(flash: IssuedTokenFlash): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, JSON.stringify(flash), {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/admin',
    maxAge: FLASH_MAX_AGE_SECONDS,
  });
}

/**
 * Reads the flash, if present.
 *
 * Parsed defensively: the value is untrusted input from the client, so a malformed cookie yields
 * `null` rather than an exception or a partially-populated object.
 */
export async function readIssuedTokenFlash(): Promise<IssuedTokenFlash | null> {
  const store = await cookies();
  const raw = store.get(FLASH_COOKIE)?.value;
  if (raw === undefined || raw === '') return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const { token, expiresAt, purpose, subject } = candidate;
    if (typeof token !== 'string' || typeof expiresAt !== 'string') return null;
    if (typeof purpose !== 'string' || typeof subject !== 'string') return null;
    if (token.length !== 43) return null;
    if (Number.isNaN(Date.parse(expiresAt))) return null;
    return { token, expiresAt, purpose, subject };
  } catch {
    return null;
  }
}
