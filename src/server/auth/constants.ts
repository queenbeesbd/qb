/**
 * Staff authentication policy - every numeric limit in one place, with its source.
 *
 * These are not tunable from the environment on purpose: a session lifetime that a deployment can
 * quietly lengthen is a policy that is not enforced anywhere. Changing a value here is a reviewed
 * code change.
 *
 * Sources:
 *   - session lifetimes: **owner decision, 2026-11-09** (ADR 0031). The owner runs this shop alone
 *     from a phone and a browser, and a panel that asks for the password again every morning is a
 *     panel they stop opening. The Phase 12 values (`docs/data-model.md` 4.7: 8-hour absolute,
 *     30-minute idle) were a multi-staff assumption this shop does not have. A session now lasts a
 *     year of absolute ceiling and 30 days of idling, so signing in is a one-time act per device;
 *     logout, a password change and owner revocation still end it immediately.
 *   - recovery token lifetime: `docs/data-model.md` 4.4 ("proposal: 30 minutes").
 *   - login throttle: `docs/data-model.md` 4.5 (fixed window with a monotonic counter).
 */

/** Cookie holding the opaque staff session token. Server-only: the name never appears in a bundle. */
export const STAFF_SESSION_COOKIE = 'qb_staff_session';

/**
 * Absolute session ceiling. A session cannot be renewed past this, however active it is.
 *
 * One year: the owner's devices (this browser and the admin app) are the only clients, and being
 * asked to sign in again is the failure the owner reported. The row still carries a ceiling, so a
 * forgotten device cannot be signed in forever.
 */
export const SESSION_ABSOLUTE_MS = 365 * 24 * 60 * 60 * 1000;

/** Sliding idle limit - a month of not opening the panel ends the session. */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

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
export const ADMIN_ROOT = '/qbpanel';
export const LOGIN_PATH = '/qbpanel/login';
export const REDEEM_PATH = '/qbpanel/redeem';

/**
 * Owner-account management. Was `/qbpanel/staff` in Phase 12; Phase 13 replaced the staff and role screen
 * with this one, because the launch surface has owner accounts only (D10, ADR 0009). The old path is not
 * kept as an alias: a route that no longer exists should 404, not quietly render something else.
 */
export const OWNERS_PATH = '/qbpanel/owners';
export const CATALOG_PATH = '/qbpanel/catalog';
export const BRANDS_PATH = '/qbpanel/catalog/brands';
export const CATEGORIES_PATH = '/qbpanel/categories';
export const DELIVERY_SETTINGS_PATH = '/qbpanel/settings/delivery';
export const PROMO_CODES_PATH = '/qbpanel/promo-codes';
/** The derived figures screen: revenue, orders and what is selling (Phase 38). */
export const ANALYTICS_PATH = '/qbpanel/analytics';
/**
 * Traffic: the shop's own first-party visit log (ADR 0027), on its own screen since 2026-11-09.
 *
 * It is not a second view of the order rows - a visit is not an order - so it left the analytics page
 * and sits beside it in the rail. Same permission (`order.read`): it is another reading of this shop's
 * own activity, and administration is owner-only.
 */
export const TRAFFIC_PATH = '/qbpanel/traffic';
export const ANNOUNCEMENT_SETTINGS_PATH = '/qbpanel/settings/announcement';
export const SUPPORT_SETTINGS_PATH = '/qbpanel/settings/support';
/** The shop's own phone, hours and address, and the policy text it publishes (Phase 51). */
export const CONTACT_SETTINGS_PATH = '/qbpanel/settings/contact';
/** The homepage hero carousel's images and their order (Phase 51). */
export const HERO_SETTINGS_PATH = '/qbpanel/settings/hero';
export const OFFER_POPUP_SETTINGS_PATH = '/qbpanel/settings/offer-popup';
/**
 * Integrations (Phase 39): outbound notification destinations.
 *
 * A hub rather than a single screen, because "where should news go" is a family that will grow (a
 * courier, a mail provider) and the sidebar should not grow with it. Telegram is the only member today.
 */
export const INTEGRATIONS_PATH = '/qbpanel/settings/integrations';
/** Checkout policy the owner controls (Phase 42): today, whether guests may order. */
export const OTHER_SETTINGS_PATH = '/qbpanel/settings/other';
export const TELEGRAM_SETTINGS_PATH = '/qbpanel/settings/integrations/telegram';
export const STEADFAST_SETTINGS_PATH = '/qbpanel/settings/integrations/steadfast';

/**
 * Phase 16 worklists: COD confirmation and customer moderation.
 *
 * Phase 17 removed the prepaid verification queue and the payment-recipient screen along with the
 * manual-payment subsystem, so `/qbpanel/payments` and `/qbpanel/payments/recipients` are retired paths.
 * They are not kept as aliases: a route that no longer exists should 404, not quietly render something
 * else.
 */
export const COD_PATH = '/qbpanel/orders-cod';
export const CUSTOMERS_PATH = '/qbpanel/customers';

/**
 * The order history and one order's detail (Phase 20).
 *
 * The queue stays its own destination because it is a worklist - the one list that waits on a person -
 * while this is the record of everything taken. They share the decision route and the guarded service
 * underneath, so the two screens cannot disagree about what an approval does.
 */
export const ORDERS_PATH = '/qbpanel/orders';

/**
 * The one mutation endpoint for an order's operational transitions (Phase 20).
 *
 * One endpoint for dispatch, delivery outcome, return receipt, inspection, collection, completion and
 * pre-dispatch cancellation, because they share a single validated action set and a single redirect
 * convention. `orders-cod` stays separate: it is the decision the queue posts to, and it keeps its own
 * notices so a queue decision is never mistaken for an operation.
 */
export const ORDER_TRANSITION_PATH = '/api/qbpanel/orders/transition';
/** Recording and voiding the additional courier costs an order incurred (Phase 22). */
export const ORDER_COST_PATH = '/api/qbpanel/orders/cost';

/**
 * Where an authenticated page may send a browser after a successful sign-in. Anything else resolves
 * to the admin root, so the login form cannot be used as an open redirect.
 */
export const ADMIN_PATH_PATTERN = /^\/qbpanel(?:\/[a-z0-9-]+)*$/;
