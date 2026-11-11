/**
 * POST /api/qbpanel/storefront - save the homepage's three curatable rows.
 *
 * One operation, one permission: `settings.write`, which is owner-level in the catalogue. The route
 * checks the session, CSRF and origin; the service re-checks the permission, the caps (15 / 15 / 10)
 * and that every pick is something the shop can still show - a live top-level department, a live brand,
 * or a published product with a genuine saving. The three lists and their audit record commit together.
 *
 * The submitted lists are **ordered**: the form posts one hidden input per pick, so `form.getAll` is the
 * owner's sequence. A redirect carries only a fixed notice code - never an id.
 */

import { withTransaction } from '@/db/client';
import { STOREFRONT_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { saveStorefrontSelection } from '@/server/storefront/selection';
import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${STOREFRONT_PATH}?notice=${notice}`);
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

  const categories = form.getAll('categories');
  const brands = form.getAll('brands');
  const offers = form.getAll('offers');

  try {
    await withTransaction((tx) =>
      saveStorefrontSelection(tx, actor, { categories, brands, offers }),
    );
    /*
     * The picks live inside the storefront snapshot, so the homepage would serve the previous
     * selection until the one-hour backstop. Expire the tag after the commit, exactly as the catalog
     * writes do.
     */
    invalidateStorefrontCatalog();
    // An empty selection is a decision too, and saying "saved" would hide it: it means "let the shop
    // choose again", which is what every row falls back to.
    const empty = categories.length === 0 && brands.length === 0 && offers.length === 0;
    return backTo(empty ? 'cleared' : 'saved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
