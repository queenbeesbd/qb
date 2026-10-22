/**
 * POST /api/admin/settings/checkout - save the checkout policy (Phase 42).
 *
 * One operation today: whether a **guest** may order without an account. `settings.write`, a CSRF-bound
 * session and the same-origin check, exactly like the announcement and delivery routes. Only a notice
 * code travels back on the redirect.
 */

import { withTransaction } from '@/db/client';
import { OTHER_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError } from '@/server/authz/authorize';
import { saveGuestOrderPolicy } from '@/server/settings/checkout';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${OTHER_SETTINGS_PATH}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo('denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    await withTransaction((tx) => saveGuestOrderPolicy(tx, actor, { guestOrders: form.get('guestOrders') }));
    return backTo('saved');
  } catch (error) {
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
