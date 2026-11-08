/**
 * POST /api/qbpanel/customers - ban a customer, or restore a banned one (D20, ADR 0023).
 *
 * Two operations, one permission (`customer.suspend`) and one form vocabulary. Each is the owner's
 * explicit decision with a **required reason**: banning revokes every live session, restoring does not
 * resurrect one. Nothing here is automatic - a cancelled COD order never reaches this route, and
 * neither operation cancels, refunds or deletes an order or touches payment, refund or stock state.
 *
 * The operation is required rather than defaulted: a missing or misspelled value is a refusal, so a
 * typo cannot quietly ban somebody.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError } from '@/server/authz/authorize';
import { restoreCustomer, suspendCustomer } from '@/server/customer-auth/service';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['ban', 'restore'] as const;

/** A restore is confirmed on the profile it is about, so both operations can return there. */
function safeReturn(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return CUSTOMERS_PATH;
  return /^\/qbpanel\/customers(?:\/\d+)?$/.test(value) ? value : CUSTOMERS_PATH;
}

function backTo(path: string, notice: string): Response {
  return redirectTo(`${path}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.customerSuspend);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const target = safeReturn(form.get('returnTo'));
  const customerId = parseId(form.get('customerId'));
  const reason = typeof form.get('reason') === 'string' ? (form.get('reason') as string) : '';
  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';

  if (customerId === null || !(OPERATIONS as readonly string[]).includes(operation)) {
    return backTo(target, 'invalid');
  }

  const actor = { actorStaffId: principal.staffUserId, actorRoleCodes: roleCodes(principal) };

  try {
    if (operation === 'ban') {
      await withTransaction((tx) => suspendCustomer(tx, { customerId, reason, ...actor }));
      return backTo(CUSTOMERS_PATH, 'suspended');
    }

    await withTransaction((tx) => restoreCustomer(tx, { customerId, reason, ...actor }));
    return backTo(`${CUSTOMERS_PATH}/${customerId}`, 'restored');
  } catch (error) {
    if (error instanceof ValidationError) return backTo(target, 'invalid');
    if (error instanceof ConflictError) return backTo(target, 'conflict');
    throw error;
  }
}
