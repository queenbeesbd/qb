/**
 * POST /api/admin/orders-cod - one COD owner decision after the call.
 *
 * Approving moves the order to `cod_approved` and `status = confirmed`; rejecting cancels the order
 * while it is still `pending`. Both transitions are guarded server-side and audited; neither touches
 * the customer's account, and neither can fire twice.
 */

import { withTransaction } from '@/db/client';
import { COD_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { decideCod, type CodDecision } from '@/server/orders/manage';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const DECISIONS: readonly CodDecision[] = ['approve', 'reject'];

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const orderId = parseId(form.get('orderId'));
  const rawDecision = typeof form.get('decision') === 'string' ? (form.get('decision') as string) : '';
  const decision = (DECISIONS as readonly string[]).includes(rawDecision) ? (rawDecision as CodDecision) : null;
  const reason = typeof form.get('reason') === 'string' ? (form.get('reason') as string) : '';

  if (orderId === null || decision === null) return redirectTo(`${COD_PATH}?notice=invalid`);

  try {
    await withTransaction((tx) =>
      decideCod(tx, {
        staffUserId: principal.staffUserId,
        permissions: principal.permissions,
        roleCodes: roleCodes(principal),
      }, { orderId, decision, reason }),
    );
    return redirectTo(`${COD_PATH}?notice=${decision === 'approve' ? 'approved' : 'rejected'}`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${COD_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${COD_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${COD_PATH}?notice=denied`);
    throw error;
  }
}