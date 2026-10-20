/**
 * POST /api/admin/owners - create another owner account and issue its one-time credential token.
 *
 * Requires `staff.manage`, which only an owner-level role holds. There is **no role field**: the role is
 * forced inside the service, so this endpoint cannot be used to create a privileged account the caller
 * could not otherwise create. The account is created without a credential, so creating it grants nobody
 * access until an owner hands over the token.
 *
 * The token travels through the flash cookie, never the redirect URL, and is displayed once.
 */

import { withTransaction } from '@/db/client';
import { OWNERS_PATH } from '@/server/auth/constants';
import { clearIssuedTokenFlash, setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError } from '@/server/authz/authorize';
import { createOwnerAccount } from '@/server/authz/owners';
import { parseDisplayName, parseEmail } from '@/server/catalog/validation';
import { roleCodes } from '@/server/authz/principal';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.staffManage);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${OWNERS_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;

  // Validated before the transaction opens, so a malformed address never reaches the database.
  const email = parseEmail(form.get('email'));
  const displayName = parseDisplayName(form.get('displayName'));
  if (email === null || displayName === null) {
    return redirectTo(`${OWNERS_PATH}?notice=invalid`);
  }

  try {
    const created = await withTransaction((tx) =>
      createOwnerAccount(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { email, displayName },
      ),
    );

    await clearIssuedTokenFlash();
    await setIssuedTokenFlash({
      token: created.recoveryToken,
      expiresAt: created.expiresAt.toISOString(),
      purpose: 'initial_credential',
      subject: email,
    });

    return redirectTo(`${OWNERS_PATH}?notice=tokenIssued`);
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(`${OWNERS_PATH}?notice=exists`);
    if (error instanceof AuthorizationError) return redirectTo(`${OWNERS_PATH}?notice=denied`);
    throw error;
  }
}
