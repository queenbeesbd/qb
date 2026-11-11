/**
 * POST /api/qbpanel/owners - two owner-level operations.
 *
 * - `create`: an **owner or moderator** account, plus its one-time credential token. The role is one of
 *   two fixed codes and anything else is a refusal, so the form cannot invent a role; a moderator is not
 *   owner-level, so the database trigger refuses it any privileged permission.
 * - `access`: replace the moderator role's permission set (owner direction, 2026-11-12) - the owner's
 *   answer to "which screens do moderators get?". The service refuses owner-level permissions, the
 *   overview and staff management, and rewrites the set in one transaction.
 *
 * Behaviour is chosen by the `operation` field, defaulting to `create` for the original form. Both
 * require `staff.manage`, which only an owner-level role holds.
 *
 * The creation token travels through the flash cookie, never the redirect URL, and is displayed once.
 */

import { withTransaction } from '@/db/client';
import { OWNERS_PATH } from '@/server/auth/constants';
import { clearIssuedTokenFlash, setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError } from '@/server/authz/authorize';
import { createStaffAccount, saveModeratorAccess } from '@/server/authz/owners';
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

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  if (form.get('operation') === 'access') {
    try {
      await withTransaction((tx) =>
        saveModeratorAccess(tx, actor, {
          permissions: form.getAll('permission').filter((entry): entry is string => typeof entry === 'string'),
        }),
      );
      return redirectTo(`${OWNERS_PATH}?notice=accessSaved`);
    } catch (error) {
      if (error instanceof AuthorizationError) return redirectTo(`${OWNERS_PATH}?notice=denied`);
      if (error instanceof ConflictError) return redirectTo(`${OWNERS_PATH}?notice=conflict`);
      return redirectTo(`${OWNERS_PATH}?notice=invalid`);
    }
  }

  // Validated before the transaction opens, so a malformed address never reaches the database.
  const email = parseEmail(form.get('email'));
  const displayName = parseDisplayName(form.get('displayName'));
  if (email === null || displayName === null) {
    return redirectTo(`${OWNERS_PATH}?notice=invalid`);
  }

  try {
    const created = await withTransaction((tx) =>
      createStaffAccount(
        tx,
        actor,
        { email, displayName, role: form.get('role') ?? undefined },
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
