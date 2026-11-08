/**
 * POST /api/qbpanel/owners/credential - issue a replacement one-time credential token for an owner.
 *
 * This is the recovery path, because no mail provider is authorized and a reset link therefore cannot be
 * delivered. The raw token is shown once through the flash cookie and stored only as a SHA-256 digest.
 * Issuing a new token supersedes any live token for the same purpose, so only one can be redeemed.
 */

import { withTransaction } from '@/db/client';
import { OWNERS_PATH } from '@/server/auth/constants';
import { setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { issueOwnerCredential } from '@/server/authz/owners';
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

  try {
    const issued = await withTransaction((tx) =>
      issueOwnerCredential(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        targetStaffUserId,
      ),
    );

    await setIssuedTokenFlash({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      purpose: 'password_reset',
      subject: String(targetStaffUserId),
    });

    return redirectTo(`${OWNERS_PATH}?notice=tokenIssued`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${OWNERS_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${OWNERS_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${OWNERS_PATH}?notice=denied`);
    throw error;
  }
}
