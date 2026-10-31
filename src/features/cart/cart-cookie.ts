import type { CartLine } from '@/lib/types';
import { MAX_LINES } from './cart-storage';

/**
 * A **mirror** of the cart's product ids, so a cart page can be drawn without the catalog.
 *
 * Phase 45 removed the catalog from every route's payload by keeping only ids in the cart provider.
 * The two routes that draw lines still received the whole catalog, because the server could not know
 * which products a line needed - the lines live in `localStorage`, which the server never sees.
 *
 * This cookie closes that gap. It carries **ids only** - never a quantity, a price or a total - and it
 * is used for exactly one decision: which products to project into the page. Everything that matters
 * is still derived from the database and the cart store:
 *
 * - a quantity is read from the cart, clamped there, and never sent by the server;
 * - a price, name and picture come from the catalog row the id resolves to;
 * - an id that no longer exists in the catalog is simply dropped by the projection.
 *
 * So the value is untrusted in the strong sense: a forged cookie can change *which* products this page
 * mentions, and nothing else. It cannot add a line (the cart store decides what is in the cart), price
 * one, or place an order. That is why it is safe for it to be a plain, readable, first-party cookie.
 *
 * It is deliberately **not** httpOnly. Only the browser knows the cart, and only the browser writes
 * it; the server just reads it. The path is `/`, so the admin surface receives the value too - a few
 * hundred bytes, and never read there.
 */
export const CART_COOKIE_NAME = 'qb_cart';

/**
 * Thirty days, which is the horizon a saved basket is useful for. The cart itself lives in
 * `localStorage` with no expiry; if the browser drops this cookie first, the cart page recovers by
 * writing it again and refreshing once (see `useCartProjection`), so the two never need to agree
 * forever.
 */
export const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The most ids a cookie may carry. Matches the cart's own line cap, so the two cannot drift apart. */
export const MAX_CART_COOKIE_IDS = MAX_LINES;

/**
 * Ids are the database's own product identities (decimal digits today), but the shape is validated
 * rather than assumed: a value that is not an id is dropped before it reaches a lookup or a render.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The cookie value for these lines. Ids are joined with a dot, which no id can contain. */
export function cartIdsToCookieValue(lines: readonly CartLine[]): string {
  return lines.map((line) => line.productId).join('.');
}

/**
 * Reads ids out of a cookie value, defensively.
 *
 * Anything that is not a plausible id, a duplicate, or a value past the line cap is discarded - a
 * tampered or truncated cookie degrades to a shorter cart page, never to an error.
 */
export function parseCartIds(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split('.')) {
    const id = part.trim();
    if (!ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_CART_COOKIE_IDS) break;
  }
  return ids;
}

/**
 * The last value written by this page, so a re-render does not rewrite the cookie needlessly.
 *
 * `null` means "not written yet", which is why the first commit of a page load always writes: the
 * cookie may have been dropped by the browser while `localStorage` still holds the cart.
 */
let lastWritten: string | null = null;

/**
 * Writes (or removes) the mirror. Client-only: the server never sets this cookie.
 *
 * An empty cart **removes** the cookie instead of storing an empty value, so the common visitor -
 * someone browsing without a basket - sends nothing at all.
 */
export function mirrorCartCookie(lines: readonly CartLine[]): void {
  if (typeof document === 'undefined') return;
  const value = cartIdsToCookieValue(lines);
  if (value === lastWritten) return;
  try {
    const age = value === '' ? 0 : CART_COOKIE_MAX_AGE_SECONDS;
    document.cookie =
      value === ''
        ? `${CART_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`
        : `${CART_COOKIE_NAME}=${value}; path=/; max-age=${age}; samesite=lax`;
    lastWritten = value;
  } catch {
    // A browser that refuses the write leaves `lastWritten` unset, so the next commit retries. The
    // cart page then says plainly that its lines could not be loaded rather than drawing a short cart.
    lastWritten = null;
  }
}
