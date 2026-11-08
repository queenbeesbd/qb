/**
 * POST /api/qbpanel/session/logout
 *
 * Requires a session and a valid CSRF token, exactly like every other state-changing route - signing
 * out is not exempt from the CSRF rule, because a cross-site forced logout is still a denial of
 * service. The row is revoked and the cookie cleared, so the token cannot be replayed even if a copy
 * of it exists.
 */

import { withTransaction } from '@/db/client';
import { recordAudit } from '@/server/auth/audit';
import { LOGIN_PATH } from '@/server/auth/constants';
import { guardSessionMutation } from '@/server/auth/guard';
import { sessionContextFrom, clearSessionCookie, revokeSession } from '@/server/auth/session';
import { roleCodes } from '@/server/authz/principal';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardSessionMutation(request);
  if (!guard.ok) {
    // An unauthenticated sign-out still clears the cookie: leaving a dead token in the browser would
    // make the next request fail for no visible reason.
    if (guard.reason === 'unauthenticated') {
      await clearSessionCookie();
      return redirectTo(LOGIN_PATH);
    }
    return deny(guard.status);
  }

  const { principal } = guard;
  const context = sessionContextFrom(request.headers);

  await withTransaction(async (tx) => {
    await revokeSession(tx, principal.sessionId, 'logout');
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: principal.staffUserId,
      actorRoleCodes: roleCodes(principal),
      action: 'staff.logout',
      entityType: 'staff_user',
      entityId: principal.staffUserId,
      ipHash: context.ipHash,
    });
  });

  await clearSessionCookie();
  return redirectTo(`${LOGIN_PATH}?signedOut=1`);
}
