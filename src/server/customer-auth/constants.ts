/**
 * Customer authentication policy - the numeric limits and paths in one place (D17, ADR 0012).
 *
 * The session lifetimes were a **proposal** in `docs/data-model.md` 15.2 ("30 days absolute, 7 days
 * idle for customers"), adopted here as the Phase 15 value; ADR 0012 records that the exact customer
 * lifetimes are confirmed at implementation. They are not environment-tunable on purpose: a session
 * lifetime a deployment can quietly lengthen is a policy enforced nowhere.
 *
 * The customer session cookie is a **different name from the owner's**, and the session rows live in a
 * different table, so no cookie or query can mix the two principals (data-model 4.7).
 */

import type { ThrottlePolicy } from '../auth/throttle';

/** Cookie holding the opaque customer session token. Server-only: the name never appears in a bundle. */
export const CUSTOMER_SESSION_COOKIE = 'qb_customer_session';

/** Absolute session ceiling. A session cannot be renewed past this, however active it is. */
export const CUSTOMER_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

/** Sliding idle limit. Shorter than the ceiling, longer than the owner's (a shopper returns). */
export const CUSTOMER_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** How stale `last_seen_at` may become before a request rewrites it, so a read does not become a write. */
export const CUSTOMER_SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export const ACCOUNT_ROOT = '/account';
export const CUSTOMER_LOGIN_PATH = '/account/login';
export const CUSTOMER_REGISTER_PATH = '/account/register';
export const CUSTOMER_ORDERS_PATH = '/account/orders';
export const CHECKOUT_PATH = '/checkout';

/** Customer sign-in throttle: by account and by source, matching the owner flow's shape. */
export const CUSTOMER_LOGIN_THROTTLE: ThrottlePolicy = {
  scope: 'login',
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
};

/** Registration throttle: by source only (there is no account yet), and tighter than sign-in. */
export const CUSTOMER_REGISTER_THROTTLE: ThrottlePolicy = {
  scope: 'register',
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
};

/**
 * Lifetime of an owner-issued customer recovery credential (Phase 23).
 *
 * **30 minutes, matching the owner surface's `RECOVERY_TOKEN_MS`.** The choice is deliberately the
 * shorter of the two bounds the architecture already uses: it is far longer than the owner needs to read
 * one credential to a customer on the phone - the hand-off is immediate, during a call that is already
 * happening - and short enough that a credential read out and mislaid (a wrong number, a note on a desk)
 * is worthless by the time anyone could abuse it. A mail-based reset would need hours; this flow never
 * does, so it does not borrow that lifetime.
 *
 * It is not environment-tunable for the same reason the session lifetimes are not: a policy a deployment
 * can quietly lengthen is a policy enforced nowhere.
 */
export const RECOVERY_TOKEN_MS = 30 * 60 * 1000;

/**
 * Redemption throttle: by source only.
 *
 * There is no account subject to key on, because a caller without a valid credential must not be able to
 * point the counter at someone else's account. Ten attempts per 15 minutes is enough for a customer who
 * mistypes a credential twice and nowhere near enough to search a 256-bit space.
 */
export const CUSTOMER_RECOVERY_REDEEM_THROTTLE: ThrottlePolicy = {
  scope: 'recovery',
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
};

/** Where a customer enters a one-time credential, and where they land afterwards. */
export const CUSTOMER_RECOVERY_PATH = '/account/recover';

/**
 * Paths a post-authentication redirect may resolve to.
 *
 * Only same-origin, relative customer paths are accepted - the checkout page and the account tree.
 * Anything else resolves to the account root, so the sign-in form cannot be used as an open redirect
 * (the owner flow's `safeReturnPath` rule, applied to the customer surface).
 */
export const CUSTOMER_PATH_PATTERN = /^\/account(?:\/[A-Za-z0-9-]+)*$/;
