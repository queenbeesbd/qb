/**
 * POST /api/admin/catalog/availability - set a product's In Stock / Out of Stock state.
 *
 * The narrow, high-frequency mutation behind the availability toggle (D19). `guardMutation` enforces the
 * session, the CSRF token and the same-origin check; `setAvailability` re-checks `catalog.write` and
 * refuses any value that is not one of the two documented states, so a client cannot invent a third
 * state or smuggle a quantity in where a state belongs. The change is audited in the same transaction.
 */

import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { withTransaction } from '@/db/client';
import { CATALOG_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { setAvailability } from '@/server/catalog/service';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${CATALOG_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;

  try {
    await withTransaction((tx) =>
      setAvailability(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { productId: form.get('productId'), availability: form.get('availability') },
      ),
    );
    invalidateStorefrontCatalog();
    return redirectTo(`${CATALOG_PATH}?notice=availability`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${CATALOG_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${CATALOG_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${CATALOG_PATH}?notice=denied`);
    throw error;
  }
}
