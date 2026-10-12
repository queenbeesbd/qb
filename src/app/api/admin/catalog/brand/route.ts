/**
 * POST /api/admin/catalog/brand - create a brand.
 *
 * Brands are a prerequisite, not a module: `product.brand_id` is `NOT NULL`, so a product cannot be
 * created before a brand exists. There is no brand editing or deletion surface in this phase.
 */

import { withTransaction } from '@/db/client';
import { CATALOG_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { createBrand } from '@/server/catalog/service';
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
      createBrand(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        {
          nameBn: form.get('nameBn'),
          nameEn: form.get('nameEn'),
          slug: form.get('slug') ?? undefined,
        },
      ),
    );
    return redirectTo(`${CATALOG_PATH}?notice=brandCreated`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${CATALOG_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${CATALOG_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${CATALOG_PATH}?notice=denied`);
    throw error;
  }
}
