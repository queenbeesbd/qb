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
/**
 * Password and email live on their own screen (2026-11-10).
 *
 * The two account-security routes return their result code **here**, not to the dashboard: a refusal
 * has to be read beside the field that caused it, and the fields are no longer on the landing page.
 */
export const CUSTOMER_SECURITY_PATH = '/account/security';
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

// ------------------------------------------------------------------
// Emailed account security (ADR 0030)
// ------------------------------------------------------------------

/** Ask for a recovery link. */
export const CUSTOMER_FORGOT_PATH = '/account/forgot-password';
/** Choose a new password from a recovery link. */
export const CUSTOMER_RESET_PATH = '/account/reset';
/** Confirm a requested change of email address. */
export const CUSTOMER_CONFIRM_EMAIL_PATH = '/account/confirm-email';
/** The destination of a registration verification link (2026-11-11). */
export const CUSTOMER_VERIFY_EMAIL_PATH = '/account/verify-email';

/**
 * Lifetime of a **mailed** recovery link.
 *
 * One hour: long enough that a customer can find the message after finishing what they were doing, short
 * enough that a forwarded or archived message is not a standing key to the account. The owner-issued
 * code keeps its 30-minute lifetime (`RECOVERY_TOKEN_MS`), because it is read out during a phone call.
 */
export const CUSTOMER_RESET_TOKEN_MS = 60 * 60 * 1000;

/** Lifetime of a mailed change-of-address confirmation. A day: the address may be checked later. */
export const CUSTOMER_EMAIL_CHANGE_TOKEN_MS = 24 * 60 * 60 * 1000;

/**
 * Lifetime of a registration verification link. Two days: a new account is usable before the link is
 * opened, so the message may sit in an inbox until the next time the person signs in.
 */
export const CUSTOMER_EMAIL_VERIFY_TOKEN_MS = 48 * 60 * 60 * 1000;

/**
 * Recovery **requests**: by account and by source, five an hour.
 *
 * Every request counts, whether or not the address has an account, so the endpoint cannot be used to
 * probe addresses quickly and a person cannot flood one inbox. The response is identical in every case.
 */
export const CUSTOMER_RESET_REQUEST_THROTTLE: ThrottlePolicy = {
  scope: 'recovery',
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
};

/** Password changes from the account page: the current password is required, so ten an hour is ample. */
export const CUSTOMER_PASSWORD_CHANGE_THROTTLE: ThrottlePolicy = {
  scope: 'recovery',
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 60 * 60 * 1000,
};

/** Change-of-address requests: five an hour, keyed on the account. */
export const CUSTOMER_EMAIL_CHANGE_THROTTLE: ThrottlePolicy = {
  scope: 'recovery',
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  blockMs: 60 * 60 * 1000,
};

/** Resending a registration verification mail: three an hour, keyed on the account. */
export const CUSTOMER_EMAIL_VERIFY_THROTTLE: ThrottlePolicy = {
  scope: 'recovery',
  windowMs: 60 * 60 * 1000,
  maxAttempts: 3,
  blockMs: 60 * 60 * 1000,
};

/**
 * Paths a post-authentication redirect may resolve to.
 *
 * Only same-origin, relative customer paths are accepted - the checkout page and the account tree.
 * Anything else resolves to the account root, so the sign-in form cannot be used as an open redirect
 * (the owner flow's `safeReturnPath` rule, applied to the customer surface).
 */
export const CUSTOMER_PATH_PATTERN = /^\/account(?:\/[A-Za-z0-9-]+)*$/;

/**
 * The canonical receipt route - `/orders/<orderNumber>` (Phase 49, ADR 0032).
 *
 * It sits outside `/account` because a guest reads their receipt there too, but it is a legitimate
 * place to return a customer after signing in: that is the page that offers to attach their guest
 * order to the account they just created. Bounded to an order number's own character set and length,
 * so it cannot become a general second allowlist.
 */
export const RECEIPT_PATH_PATTERN = /^\/orders\/[A-Za-z0-9-]{1,40}$/;
