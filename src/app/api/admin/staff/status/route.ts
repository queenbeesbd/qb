/**
 * POST /api/admin/staff/status - enable or disable a staff account.
 *
 * Requires `staff.manage`. Disabling is the documented alternative to deletion, because audit records
 * reference staff users and a deleted actor would break attribution (`docs/data-model.md` 4.6).
 * Disabling also revokes the account's live sessions, so access ends at the next request rather than
 * at the next expiry.
 *
 * A staff user cannot disable their own account, and the last active owner-level account cannot be
 * disabled - otherwise the system could be locked out of its own administration.
 */

import { withTransaction } from '@/db/client';
import { STAFF_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, setStaffDisabled } from '@/server/authz/roles';
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
  const operation = form.get('operation');

  if (!Number.isSafeInteger(staffUserId) || staffUserId <= 0) {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }
  if (operation !== 'disable' && operation !== 'enable') {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }

  try {
    await withTransaction((tx) =>
      setStaffDisabled(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { targetStaffUserId: staffUserId, disabled: operation === 'disable' },
      ),
    );
    return redirectTo(`${STAFF_PATH}?notice=${operation === 'disable' ? 'disabled' : 'enabled'}`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${STAFF_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${STAFF_PATH}?notice=denied`);
    throw error;
  }
}
