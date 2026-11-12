/**
 * POST /api/qbpanel/support-links - save the storefront's Facebook and WhatsApp links.
 *
 * One operation, one permission: `settings.write`, which is owner-level in the catalogue. The route
 * checks the session, CSRF and origin; the service re-checks the permission and validates both URLs as
 * absolute `https` addresses. The change and its audit record commit together.
 *
 * A blank field clears that button. A redirect carries only a fixed notice code - never the submitted
 * text.
 */

import { withTransaction } from '@/db/client';
import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { SUPPORT_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { saveSupportLinks } from '@/server/settings/support';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${SUPPORT_SETTINGS_PATH}?notice=${notice}`);
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
      saveSupportLinks(tx, actor, {
        facebookUrl: form.get('facebookUrl') ?? '',
        whatsappUrl: form.get('whatsappUrl') ?? '',
      }),
    );
    invalidateStorefrontCatalog();
    return backTo('saved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
