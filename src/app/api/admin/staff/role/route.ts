/**
 * POST /api/admin/staff/role - grant or revoke a role.
 *
 * Requires `staff.manage`. The service behind this re-checks the same permission, refuses a change to
 * the actor's own roles, refuses granting a role the actor does not hold, refuses revoking the last
 * active owner-level role, and audits the change with the actor's role snapshot. A role change also
 * revokes the target's live sessions, because their existing token was issued under the old role set.
 */

import { withTransaction } from '@/db/client';
import { STAFF_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, grantRole, revokeRole } from '@/server/authz/roles';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.staffManage);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${STAFF_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const staffUserId = Number(form.get('staffUserId'));
  const roleCode = form.get('roleCode');
  const operation = form.get('operation');

  if (!Number.isSafeInteger(staffUserId) || staffUserId <= 0) {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }
  if (typeof roleCode !== 'string' || roleCode === '') {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }
  if (operation !== 'grant' && operation !== 'revoke') {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    await withTransaction(async (tx) => {
      if (operation === 'grant') {
        await grantRole(tx, actor, { targetStaffUserId: staffUserId, roleCode });
      } else {
        await revokeRole(tx, actor, { targetStaffUserId: staffUserId, roleCode });
      }
    });
    return redirectTo(`${STAFF_PATH}?notice=${operation === 'grant' ? 'roleGranted' : 'roleRevoked'}`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${STAFF_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${STAFF_PATH}?notice=denied`);
    throw error;
  }
}
