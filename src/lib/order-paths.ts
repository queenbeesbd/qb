/**
 * Where one order's receipt lives.
 *
 * **One canonical route for every order**, guest or account. It used to be
 * `/account/orders/<number>`, which was wrong in two ways: a guest has no account, and the page decided
 * "anonymous" from the presence of a session cookie rather than from a resolved session - so a guest
 * whose browser still held an expired cookie was sent to sign in instead of seeing the order they had
 * just placed.
 *
 * Client-safe and dependency-free: the order route and the views both build these paths.
 */

/** The receipt root. The account tree keeps only the list of a customer's own orders. */
export const ORDERS_ROOT = '/orders';

/** The path for one order's receipt, optionally marking a freshly placed order. */
export function orderReceiptPath(orderNumber: string, options: { placed?: boolean } = {}): string {
  const base = `${ORDERS_ROOT}/${encodeURIComponent(orderNumber)}`;
  return options.placed === true ? `${base}?placed=1` : base;
}
