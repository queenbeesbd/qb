/**
 * POST /api/admin/catalog/product - create, update or archive a product.
 *
 * `guardMutation` enforces the session, the CSRF token and the same-origin check before anything is read;
 * the service then re-checks `catalog.write`, validates every field server-side and audits the change in
 * the same transaction. Prices arrive as the owner typed them and are converted to integer poisha by
 * `parsePoisha`; availability must be one of the two documented states. Neither is read from a
 * client-formatted value.
 *
 * The redirect target carries only a fixed notice code, never a submitted value, so a rejection cannot
 * echo attacker-controlled text back into the page.
 */

import { withTransaction } from '@/db/client';
import { CATALOG_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { archiveProduct, createProduct, updateProduct } from '@/server/catalog/service';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['create', 'update', 'archive'] as const;

/**
 * A fixed notice plus, for an edit, the product being edited - never a value from the form.
 *
 * The edit form is its own route, so a successful update returns there and a refusal returns there too;
 * only a create or an archive goes back to the list, because those are list-level outcomes.
 */
function backToProduct(productId: string | null, notice: string): Response {
  if (productId === null) return redirectTo(`${CATALOG_PATH}?notice=${notice}`);
  return redirectTo(`${CATALOG_PATH}/${encodeURIComponent(productId)}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${CATALOG_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) {
    return redirectTo(`${CATALOG_PATH}?notice=invalid`);
  }

  const rawProductId = form.get('productId');
  const productId = typeof rawProductId === 'string' && rawProductId !== '' ? rawProductId : null;

  const fields = {
    slug: form.get('slug') ?? undefined,
    nameBn: form.get('nameBn'),
    nameEn: form.get('nameEn'),
    descriptionBn: form.get('descriptionBn') ?? undefined,
    descriptionEn: form.get('descriptionEn') ?? undefined,
    shortDescription: form.get('shortDescription') ?? undefined,
    categoryId: form.get('categoryId'),
    brandId: form.get('brandId'),
    packSize: form.get('packSize') ?? undefined,
    price: form.get('price'),
    compareAtPrice: form.get('compareAtPrice') ?? undefined,
    sku: form.get('sku') ?? undefined,
    availability: form.get('availability'),
    isPublished: form.get('isPublished') ?? undefined,
  };

  try {
    if (operation === 'create') {
      // Straight to the new product's edit screen: the product exists but has no images yet, and that
      // is the next thing to do. The list would show a row with a "No image" badge and no way forward.
      const created = await withTransaction((tx) => createProduct(tx, actor, fields));
      return redirectTo(`${CATALOG_PATH}/${created.productId}?notice=created`);
    }

    if (operation === 'update') {
      await withTransaction((tx) => updateProduct(tx, actor, form.get('productId'), fields));
      return backToProduct(productId, 'updated');
    }

    await withTransaction((tx) => archiveProduct(tx, actor, form.get('productId')));
    return redirectTo(`${CATALOG_PATH}?notice=archived`);
  } catch (error) {
    if (error instanceof ValidationError) return backToProduct(productId, 'invalid');
    if (error instanceof ConflictError) return backToProduct(productId, 'conflict');
    if (error instanceof AuthorizationError) return backToProduct(productId, 'denied');
    throw error;
  }
}
