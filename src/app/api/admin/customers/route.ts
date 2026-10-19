/**
 * POST /api/admin/customers - suspend (ban) a customer account (D20).
 *
 * The owner's explicit decision, with a required reason. The existing `suspendCustomer` primitive does
 * the work: a guarded `active -> suspended` transition, every live customer session revoked, and an
 * append-only audit record. Nothing here is automatic: a cancelled COD order never reaches this route,
 * and a ban never cancels, refunds or deletes an order.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError } from '@/server/authz/authorize';
import { suspendCustomer } from '@/server/customer-auth/service';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.customerSuspend);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const customerId = parseId(form.get('customerId'));
  const reason = typeof form.get('reason') === 'string' ? (form.get('reason') as string) : '';

  if (customerId === null) return redirectTo(`${CUSTOMERS_PATH}?notice=invalid`);

  try {
    await withTransaction((tx) =>
      suspendCustomer(tx, {
        customerId,
        actorStaffId: principal.staffUserId,
        actorRoleCodes: roleCodes(principal),
        reason,
      }),
    );
    return redirectTo(`${CUSTOMERS_PATH}?notice=suspended`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${CUSTOMERS_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${CUSTOMERS_PATH}?notice=conflict`);
    throw error;
  }
}