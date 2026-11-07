/**
 * POST /api/admin/orders/consignment - send one confirmed COD order to SteadFast, or ask the courier
 * where it is.
 *
 * Two operations, two different permissions. **Sending** is the same commitment as approving the order,
 * so it needs `cod.approve` (privileged); **refreshing** only reads the courier's current status and
 * stores it on the consignment row, so `order.read` is enough. Both services re-check their own
 * permission, so this route is a first gate and never the control.
 *
 * Only the order's public reference travels back on the redirect (in the path), never the courier's
 * answer and never a key: the answer is on the page, read from the row.
 */

import { withTransaction } from '@/db/client';
import { ORDERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { hasPermission, roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError } from '@/server/authz/authorize';
import {
  bookApprovedOrder,
  orderIdByNumber,
  refreshConsignmentStatus,
} from '@/server/integrations/steadfast-booking';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['send', 'refresh'] as const;

function backTo(orderNumber: string, notice: string): Response {
  return redirectTo(`${ORDERS_PATH}/${encodeURIComponent(orderNumber)}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  const rawReference = form.get('orderNumber');
  const orderNumber = typeof rawReference === 'string' ? rawReference.slice(0, 64) : '';

  if (!(OPERATIONS as readonly string[]).includes(operation) || orderNumber.length === 0) {
    return deny(400);
  }
  if (operation === 'send' && !hasPermission(principal, PERMISSIONS.codApprove)) return deny(403);

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const orderId = await withTransaction((tx) => orderIdByNumber(tx, orderNumber));
  // A reference that names no order cannot be acted on. Answer the same way for "never existed" and
  // "not this order's reference": there is nothing an owner could do with the difference.
  if (orderId === null) return backTo(orderNumber, 'invalid');

  try {
    if (operation === 'send') {
      const booking = await bookApprovedOrder(actor, orderId);
      switch (booking.status) {
        case 'booked':
          return backTo(orderNumber, 'steadfastBooked');
        case 'exists':
          return backTo(orderNumber, 'steadfastExists');
        case 'not_configured':
          return backTo(orderNumber, 'steadfastNotConfigured');
        case 'in_progress':
          return backTo(orderNumber, 'steadfastInProgress');
        case 'refused':
        case 'failed':
          return backTo(orderNumber, 'steadfastFailed');
      }
    }

    const refreshed = await refreshConsignmentStatus(actor, orderId);
    switch (refreshed.status) {
      case 'refreshed':
        return backTo(orderNumber, 'steadfastRefreshed');
      case 'missing':
        return backTo(orderNumber, 'steadfastMissing');
      case 'not_configured':
        return backTo(orderNumber, 'steadfastNotConfigured');
      case 'failed':
        return backTo(orderNumber, 'steadfastFailed');
    }
  } catch (error) {
    // The service re-checks its own permission; a refusal is a 403 and never a description of why.
    if (error instanceof AuthorizationError) return deny(403);
    throw error;
  }
}
