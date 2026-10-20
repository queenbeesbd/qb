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
 *
 * **It is genuinely a single read, because the route clears it.** Before Phase 23 the cookie was only
 * ever read, never cleared, so "read once, then gone" was true of the token but not of the page: every
 * reload re-displayed it for the cookie's whole two-minute lifetime.
 *
 * The clear therefore happens in the **route handler**, which is where Next.js permits a cookie
 * mutation: this version's docs are explicit that `.set`/`.delete` must run in a Server Function or
 * Route Handler, and a page render that calls `delete` throws. The route writes the flash and the next
 * page must render it, so the write and the read are necessarily one hop apart. What happens instead is
 * the second half of the pair: **the route clears the flash before rendering its own page**, so the value
 * reaches exactly one render and no reload can show it again. The page only ever reads.
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
 * Deletes the flash cookie. **Route handlers only** - a page render calling this throws, because Next.js
 * permits a cookie mutation only in a Server Function or a Route Handler.
 *
 * A no-op when the cookie is already gone, so a repeated submission is harmless.
 */
export async function clearIssuedTokenFlash(): Promise<void> {
  const store = await cookies();
  // Overwritten with an empty, already-expired value carrying the **same** `path` and flags it was set
  // with. A bare `delete(name)` targets the default path, which is not where this cookie lives, so it
  // leaves the real one in place - the value would keep being rendered on every reload.
  store.set(FLASH_COOKIE, '', {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0,
  });
}

/** Reads the flash, if present. Pages call only this; only a route may clear. */
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
