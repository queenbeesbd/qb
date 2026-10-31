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

  /*
   * A ticked box posts `true`; an unticked one posts **nothing**, which the policy already reads as
   * off (it requires the literal `true`), so the box needs no hidden companion - and must not have
   * one. A hidden `false` beside a box of the same name is the defect this replaced: both controls
   * carried `guestOrders`, and `form.get()` returns the **first** entry, so a hidden `false` written
   * above the box won every submission. The switch could turn guest ordering **off** and never on -
   * the panel said "saved" while the feature stayed off, which is exactly the report that found this.
   *
   * Reading the whole list, so that any explicit `true` wins, makes the route independent of that
   * ordering rather than depending on the markup never regressing to it.
   */
  const guestOrders = form.getAll('guestOrders').includes('true');

  try {
    await withTransaction((tx) => saveGuestOrderPolicy(tx, actor, { guestOrders }));
    return backTo('saved');
  } catch (error) {
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
