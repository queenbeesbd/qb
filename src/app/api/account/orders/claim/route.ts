/**
 * POST /api/account/orders/claim - attach a guest order to the signed-in account (ADR 0032).
 *
 * Signed in and CSRF-bound through `guardCustomerMutation`: a session is required, the request must
 * be same-origin, and the form must carry the session's CSRF token. The order number answers only
 * "was there a guest order with this reference" - the receipt it comes from is the same handle that
 * already let this browser read the order.
 *
 * Two outcomes, both redirects:
 *
 * - the order is (now) this customer's -> back to the receipt with `?claim=claimed`;
 * - it is not available to this account (no such order, or another account claimed it first) -> the
 *   customer's own order list. Not an error page: there is no 403 for a customer, and the list is the
 *   truthful statement that the order is not in this account.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { guardCustomerMutation } from '@/server/customer-auth/guard';
import { claimGuestOrder } from '@/server/orders/claim';

export const dynamic = 'force-dynamic';

/** The receipt route, with the number bounded so the redirect cannot become an open redirect. */
function receiptPath(orderNumber: string): string | null {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(orderNumber)) return null;
  return `/orders/${orderNumber}?claim=claimed`;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const submitted = guard.form.get('orderNumber');
  const orderNumber = typeof submitted === 'string' ? submitted.trim() : '';

  const result = await withTransaction((tx) =>
    claimGuestOrder(tx, { customerId: guard.principal.customerId, orderNumber }),
  );

  if (!result.ok) return redirectTo(CUSTOMER_ORDERS_PATH);

  const receipt = receiptPath(orderNumber);
  return redirectTo(receipt ?? CUSTOMER_ORDERS_PATH);
}
