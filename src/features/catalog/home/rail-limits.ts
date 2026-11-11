/**
 * How many circles each discovery rail draws (owner direction, 2026-11-12).
 *
 * **One number for every width now.** The rails used to publish twenty on a desktop and fifteen on a
 * phone; the owner asked for fifteen everywhere, and the choice moved into the admin panel where the
 * owner picks the departments and brands themselves. So the rail length is the same fact on a phone
 * and on a wide screen, and the storefront does not cut anything in CSS: the server sends at most this
 * many picks (or the same number chosen automatically), and the trailing "View all" circle appears
 * when the shop has more than the rail shows.
 *
 * The offer row's number lives with the selection service (`STOREFRONT_OFFER_LIMIT`), because it is the
 * owner-faced cap the editor enforces.
 */
export const RAIL_LIMIT = 15;
