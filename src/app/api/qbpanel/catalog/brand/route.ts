/**
 * POST /api/qbpanel/catalog/brand - create or update a brand, with its logo.
 *
 * The brand editor is a real route now (`/qbpanel/catalog/brands/new` and
 * `/qbpanel/catalog/brands/[brandId]`), not a disclosure on the product list or an image-only page. A
 * brand is a prerequisite for a product, so its name, address and mark belong in one form the owner
 * can complete in one visit.
 *
 * The logo follows the product/category upload contract: the bytes are decoded and re-encoded by
 * `saveUpload` before the transaction, the key and metadata come from the decoded image, and the
 * brand row and its logo save together. A refusal carries only a fixed notice code.
 */

import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { withTransaction, type Transaction } from '@/db/client';
import { BRANDS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { createBrand, setBrandImage, updateBrand } from '@/server/catalog/service';
import { saveUpload, type UploadedAsset } from '@/server/catalog/uploads';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['create', 'update'] as const;

/** The editor routes this handler owns. Anything else falls back to the brand list. */
function safeReturn(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return BRANDS_PATH;
  return /^\/qbpanel\/catalog\/brands(?:\/new|\/\d+)?$/.test(value) ? value : BRANDS_PATH;
}

function backTo(path: string, notice: string): Response {
  return redirectTo(`${path}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo(BRANDS_PATH, 'denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const target = safeReturn(form.get('returnTo'));

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) return backTo(target, 'invalid');

  const input = {
    nameBn: form.get('nameBn'),
    nameEn: form.get('nameEn'),
    slug: form.get('slug') ?? undefined,
  };

  const imageFile = form.get('image');
  let asset: UploadedAsset | undefined;
  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      asset = await saveUpload(imageFile, 'square');
    } catch {
      return backTo(operation === 'create' ? `${BRANDS_PATH}/new` : target, 'imageInvalid');
    }
  }
  const selectedImageKey = form.get('imageKey');
  const removeImage = form.get('removeImage') === 'true';

  const saveImage = async (tx: Transaction, brandId: number): Promise<void> => {
    if (asset !== undefined) {
      await setBrandImage(tx, actor, { brandId, imageKey: asset.key, asset });
    } else if (typeof selectedImageKey === 'string' && selectedImageKey !== '') {
      await setBrandImage(tx, actor, { brandId, imageKey: selectedImageKey });
    } else if (removeImage) {
      await setBrandImage(tx, actor, { brandId, imageKey: '' });
    }
  };

  try {
    if (operation === 'create') {
      const created = await withTransaction(async (tx) => {
        const brand = await createBrand(tx, actor, input);
        await saveImage(tx, brand.brandId);
        return brand;
      });
      invalidateStorefrontCatalog();
      return backTo(`${BRANDS_PATH}/${created.brandId}`, 'created');
    }

    await withTransaction(async (tx) => {
      await updateBrand(tx, actor, form.get('brandId'), input);
      const id = Number.parseInt(String(form.get('brandId') ?? ''), 10);
      if (Number.isFinite(id)) await saveImage(tx, id);
    });
    invalidateStorefrontCatalog();
    return backTo(target, 'updated');
  } catch (error) {
    if (error instanceof ValidationError) return backTo(target, 'invalid');
    if (error instanceof ConflictError) return backTo(target, 'conflict');
    if (error instanceof AuthorizationError) return backTo(target, 'denied');
    throw error;
  }
}
