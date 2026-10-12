/**
 * POST /api/admin/staff - create a staff account and issue its first credential token.
 *
 * Requires `staff.manage`, which the owner ruling (D10) grants only to the owner role. The account is
 * created **without** a credential, so creating it grants no access: the owner must hand over the
 * single-use token, and the staff member sets their own password. That is what keeps the owner from
 * knowing anyone else's password.
 *
 * The token is returned through the flash cookie, never through the redirect URL, and is displayed
 * once on the staff screen.
 */

import { withTransaction } from '@/db/client';
import { STAFF_PATH } from '@/server/auth/constants';
import { setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, createStaffUser } from '@/server/authz/roles';
import { roleCodes } from '@/server/authz/principal';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.staffManage);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${STAFF_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const email = form.get('email');
  const displayName = form.get('displayName');
  const roleCode = form.get('roleCode');

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }
  if (typeof displayName !== 'string' || displayName.trim() === '' || displayName.trim().length > 80) {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }
  if (typeof roleCode !== 'string' || roleCode === '') {
    return redirectTo(`${STAFF_PATH}?notice=invalid`);
  }

  try {
    const created = await withTransaction((tx) =>
      createStaffUser(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { email: email.trim().toLowerCase(), displayName: displayName.trim(), roleCode },
      ),
    );

    await setIssuedTokenFlash({
      token: created.recoveryToken,
      expiresAt: created.expiresAt.toISOString(),
      purpose: 'initial_credential',
      subject: email.trim().toLowerCase(),
    });

    return redirectTo(`${STAFF_PATH}?notice=tokenIssued`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${STAFF_PATH}?notice=exists`);
    if (error instanceof AuthorizationError) return redirectTo(`${STAFF_PATH}?notice=denied`);
    throw error;
  }
}
