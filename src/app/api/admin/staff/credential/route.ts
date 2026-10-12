/**
 * POST /api/admin/staff/credential - issue a single-use credential token for an existing staff user.
 *
 * Requires `staff.manage`. This is the recovery path: no mail provider is authorized, so an owner
 * issues the token and passes it to the colleague out of band. Issuing a new token marks any live
 * token for the same purpose used, so a re-issue cannot leave a second usable secret behind - the
 * partial unique index `staff_recovery_token_live_unique` makes that a database guarantee.
 *
 * The token is delivered through the flash cookie and displayed once; it is stored only as a digest.
 */

import { withTransaction } from '@/db/client';
import { STAFF_PATH } from '@/server/auth/constants';
import { setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, issueCredentialToken } from '@/server/authz/roles';
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
  if (!Number.isSafeInteger(staffUserId) || staffUserId <= 0) {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }

  try {
    const issued = await withTransaction((tx) =>
      issueCredentialToken(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        staffUserId,
        'password_reset',
      ),
    );

    await setIssuedTokenFlash({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      purpose: 'password_reset',
      subject: `staff #${staffUserId}`,
    });

    return redirectTo(`${STAFF_PATH}?notice=tokenIssued`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${STAFF_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${STAFF_PATH}?notice=denied`);
    throw error;
  }
}
