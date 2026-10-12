/**
 * POST /api/admin/catalog/image - attach, update or remove a product image.
 *
 * Every branch requires `catalog.write` twice over: once in `guardMutation` and again inside the service.
 * The asset key is resolved against the server's own inventory and its metadata is read from the file
 * bytes, so nothing about the image comes from the request except the key and the alt text.
 */

import { withTransaction } from '@/db/client';
import { CATALOG_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { attachImage, removeImage, updateImage } from '@/server/catalog/service';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['attach', 'update', 'remove'] as const;

/** Redirects back to the product being edited, so the owner stays where they were. */
function backToProduct(productId: string | null, notice: string): Response {
  const suffix = productId === null ? '' : `&edit=${encodeURIComponent(productId)}`;
  return redirectTo(`${CATALOG_PATH}?notice=${notice}${suffix}`);
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
    return backToProduct(null, 'invalid');
  }

  const rawProductId = form.get('productId');
  const productId = typeof rawProductId === 'string' && rawProductId !== '' ? rawProductId : null;

  try {
    if (operation === 'attach') {
      await withTransaction((tx) =>
        attachImage(tx, actor, {
          productId: form.get('productId'),
          key: form.get('key'),
          altBn: form.get('altBn') ?? undefined,
          altEn: form.get('altEn') ?? undefined,
          isPrimary: form.get('isPrimary') ?? undefined,
          sortOrder: form.get('sortOrder') ?? undefined,
        }),
      );
      return backToProduct(productId, 'imageAttached');
    }

    if (operation === 'update') {
      await withTransaction((tx) =>
        updateImage(tx, actor, {
          imageId: form.get('imageId'),
          altBn: form.get('altBn') ?? undefined,
          altEn: form.get('altEn') ?? undefined,
          isPrimary: form.get('isPrimary') ?? undefined,
          sortOrder: form.get('sortOrder') ?? undefined,
        }),
      );
      return backToProduct(productId, 'imageUpdated');
    }

    await withTransaction((tx) => removeImage(tx, actor, form.get('imageId')));
    return backToProduct(productId, 'imageRemoved');
  } catch (error) {
    if (error instanceof ValidationError) return backToProduct(productId, 'invalid');
    if (error instanceof ConflictError) return backToProduct(productId, 'conflict');
    if (error instanceof AuthorizationError) return backToProduct(productId, 'denied');
    throw error;
  }
}
