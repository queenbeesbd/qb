/**
 * POST /api/admin/owners/status - enable or disable an owner account.
 *
 * Two refusals live behind this route and neither is a UI concern: an owner cannot disable their own
 * account, and the last active owner cannot be disabled. The owner count is read under `FOR UPDATE`, so
 * two concurrent requests cannot both pass the check and both succeed.
 *
 * Disabling revokes the target's live sessions, so access ends on the next request rather than at the
 * next expiry.
 */

import { withTransaction } from '@/db/client';
import { OWNERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError } from '@/server/authz/authorize';
import { setOwnerDisabled } from '@/server/authz/owners';
import { roleCodes } from '@/server/authz/principal';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.staffManage);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${OWNERS_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const targetStaffUserId = parseId(form.get('staffUserId'));
  if (targetStaffUserId === null) return redirectTo(`${OWNERS_PATH}?notice=invalid`);

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (operation !== 'disable' && operation !== 'enable') {
    return redirectTo(`${OWNERS_PATH}?notice=invalid`);
  }
  const disabled = operation === 'disable';

  try {
    await withTransaction((tx) =>
      setOwnerDisabled(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { targetStaffUserId, disabled },
      ),
    );
    return redirectTo(`${OWNERS_PATH}?notice=${disabled ? 'disabled' : 'enabled'}`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${OWNERS_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${OWNERS_PATH}?notice=denied`);
    throw error;
  }
}
