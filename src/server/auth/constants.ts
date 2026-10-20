/**
 * Staff authentication policy - every numeric limit in one place, with its source.
 *
 * These are not tunable from the environment on purpose: a session lifetime that a deployment can
 * quietly lengthen is a policy that is not enforced anywhere. Changing a value here is a reviewed
 * code change.
 *
 * Sources:
 *   - session lifetimes: `docs/data-model.md` 4.7 ("sessions are shorter ... proposal: 8-hour
 *     absolute ceiling, 30-minute idle") - adopted verbatim as the Phase 12 value.
 *   - recovery token lifetime: `docs/data-model.md` 4.4 ("proposal: 30 minutes").
 *   - login throttle: `docs/data-model.md` 4.5 (fixed window with a monotonic counter).
 */

/** Cookie holding the opaque staff session token. Server-only: the name never appears in a bundle. */
export const STAFF_SESSION_COOKIE = 'qb_staff_session';

/** Absolute session ceiling. A session cannot be renewed past this, however active it is. */
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

/** Sliding idle limit. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * How stale `last_seen_at` may become before a request rewrites it. Without this, every request
 * would perform a write; with it, the idle limit is still enforced to within a minute.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/** Owner-issued credential token lifetime. Short, single-use, and never shown twice. */
export const RECOVERY_TOKEN_MS = 30 * 60 * 1000;

/**
 * Denial-log bounds.
 *
 * A refusal is worth recording, but a burst of refusals must not become a cheap way to write rows.
 * Writing already requires an authenticated session (an anonymous denial is not stored at all), so
 * this bound caps what a malicious *authenticated* client can produce. Fixed window with a monotonic
 * counter, matching the login throttle's shape.
 */
export const DENIAL_LOG = {
  windowMs: 60 * 1000,
  /** Denial records per actor per window. Beyond this the refusal happens and is not recorded. */
  maxAttemptsPerWindow: 10,
  /** Bounded in-process map, so the limiter itself cannot be used to grow memory. */
  maxTrackedActors: 500,
} as const;

/** Login throttle: attempts per window, then a block of the same length. */
export const LOGIN_THROTTLE = {
  /** `auth_throttle.scope` value. `login` covers customer and staff sign-in alike. */
  scope: 'login',
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  blockMs: 15 * 60 * 1000,
} as const;

/** Password length bounds. Defined in `src/lib/password-policy.ts` so forms can import them too. */
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

/** Paths. Kept here so the redirect allowlist and the routes cannot drift apart. */
export const ADMIN_ROOT = '/admin';
export const LOGIN_PATH = '/admin/login';
export const REDEEM_PATH = '/admin/redeem';

/**
 * Owner-account management. Was `/admin/staff` in Phase 12; Phase 13 replaced the staff and role screen
 * with this one, because the launch surface has owner accounts only (D10, ADR 0009). The old path is not
 * kept as an alias: a route that no longer exists should 404, not quietly render something else.
 */
export const OWNERS_PATH = '/admin/owners';
export const CATALOG_PATH = '/admin/catalog';
export const CATEGORIES_PATH = '/admin/categories';
export const DELIVERY_SETTINGS_PATH = '/admin/settings/delivery';

/**
 * Phase 16 worklists: COD confirmation and customer moderation.
 *
 * Phase 17 removed the prepaid verification queue and the payment-recipient screen along with the
 * manual-payment subsystem, so `/admin/payments` and `/admin/payments/recipients` are retired paths.
 * They are not kept as aliases: a route that no longer exists should 404, not quietly render something
 * else.
 */
export const COD_PATH = '/admin/orders-cod';
export const CUSTOMERS_PATH = '/admin/customers';

/**
 * The order history and one order's detail (Phase 20).
 *
 * The queue stays its own destination because it is a worklist - the one list that waits on a person -
 * while this is the record of everything taken. They share the decision route and the guarded service
 * underneath, so the two screens cannot disagree about what an approval does.
 */
export const ORDERS_PATH = '/admin/orders';

/**
 * Where an authenticated page may send a browser after a successful sign-in. Anything else resolves
 * to the admin root, so the login form cannot be used as an open redirect.
 */
export const ADMIN_PATH_PATTERN = /^\/admin(?:\/[a-z0-9-]+)*$/;
