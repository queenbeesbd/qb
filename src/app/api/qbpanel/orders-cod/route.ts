/**
 * POST /api/qbpanel/orders-cod - one COD owner decision after the call.
 *
 * Approving moves the order to `cod_approved` and `status = confirmed`; rejecting cancels the order
 * while it is still `pending`. Both transitions are guarded server-side and audited; neither touches
 * the customer's account, and neither can fire twice.
 *
 * The decision is taken from a card on the one Orders screen (`/qbpanel/orders?view=waiting`). The
 * endpoint's URI is unchanged - the worklist and its decision have always been separate things - but
 * every outcome returns to that screen: a decision lands on the "decided today" view where the result
 * is visible, and a refusal lands back on the waiting view where the card still is.
 */

import { withTransaction } from '@/db/client';
import { ORDERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { bookApprovedOrder } from '@/server/integrations/steadfast-booking';
import { decideCod, type CodDecision } from '@/server/orders/manage';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const DECISIONS: readonly CodDecision[] = ['approve', 'reject'];

/** A notice on the view where the order is now to be found: a decision, or the waiting card. */
function ordersNotice(notice: string, view: 'decided' | 'waiting'): string {
  return `${ORDERS_PATH}?view=${view}&notice=${notice}`;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const orderId = parseId(form.get('orderId'));
  const rawDecision = typeof form.get('decision') === 'string' ? (form.get('decision') as string) : '';
  const decision = (DECISIONS as readonly string[]).includes(rawDecision) ? (rawDecision as CodDecision) : null;
  const reason = typeof form.get('reason') === 'string' ? (form.get('reason') as string) : '';

  if (orderId === null || decision === null) return redirectTo(ordersNotice('invalid', 'waiting'));

  /*
   * The note is optional on both decisions (owner direction, 2026-11-19), and the sentence an empty
   * field records lives in `decideCod` so the service - not this route - is the one place that decides
   * what "no note" means. Nothing is filled in here: a browser that posts an empty string and the
   * no-JavaScript path then behave the same, because both reach the same function with the same value.
   */

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    await withTransaction((tx) => decideCod(tx, actor, { orderId, decision, reason }));
    if (decision === 'reject') return redirectTo(ordersNotice('rejected', 'decided'));

    /*
     * The parcel is booked **after** the approval commits, in its own transaction, so a courier
     * outage can never undo a decision the owner just made on the phone. The outcome is stated on the
     * decided view; a failure leaves the order approved and is retried from the order screen, where
     * the consignment is also shown. When booking is switched off, the approval is unchanged.
     */
    const booking = await bookApprovedOrder(actor, orderId);
    if (booking.status === 'booked' || booking.status === 'exists') {
      return redirectTo(ordersNotice('approvedBooked', 'decided'));
    }
    if (booking.status === 'failed' || booking.status === 'refused') {
      return redirectTo(ordersNotice('approvedBookingFailed', 'decided'));
    }
    return redirectTo(ordersNotice('approved', 'decided'));
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(ordersNotice('invalid', 'waiting'));
    if (error instanceof ConflictError) return redirectTo(ordersNotice('conflict', 'waiting'));
    if (error instanceof AuthorizationError) return redirectTo(ordersNotice('denied', 'waiting'));
    throw error;
  }
}
