/**
 * POST /api/admin/settings/contact - save the shop's contact facts and its policy text.
 *
 * One operation, one permission: `settings.write`. The route checks the session, CSRF and origin; the
 * service re-checks the permission, validates the phone shape and refuses markup in the free-text
 * fields. The change and its audit record commit together.
 *
 * A blank field unpublishes that fact or that page. A redirect carries only a fixed notice code - never
 * the submitted text.
 */

import { withTransaction } from '@/db/client';
import { CONTACT_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { saveStoreContact } from '@/server/settings/contact';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${CONTACT_SETTINGS_PATH}?notice=${notice}`);
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
    await withTransaction((tx) =>
      saveStoreContact(tx, actor, {
        phone: form.get('phone') ?? '',
        hours: form.get('hours') ?? '',
        address: form.get('address') ?? '',
        delivery: form.get('delivery') ?? '',
        returns: form.get('returns') ?? '',
        privacy: form.get('privacy') ?? '',
        terms: form.get('terms') ?? '',
      }),
    );
    return backTo('saved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
