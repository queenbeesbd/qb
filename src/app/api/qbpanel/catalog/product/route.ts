/**
 * POST /api/qbpanel/catalog/product - create, update or archive a product.
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

import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { withTransaction } from '@/db/client';
import { MAX_PRODUCT_IMAGES } from '@/lib/upload-limits';
import { CATALOG_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { archiveProduct, attachImage, createProduct, updateProduct } from '@/server/catalog/service';
import { saveUpload, type UploadedAsset } from '@/server/catalog/uploads';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['create', 'update', 'archive'] as const;

/**
 * The photographs chosen in the editor.
 *
 * One repeated `images` field carries all of them, in the order the owner arranged. A file input
 * that submitted nothing posts no entry at all, so an empty list is the ordinary "no photographs"
 * case rather than an error.
 */
function imageFiles(form: FormData): File[] {
  return form.getAll('images').filter((value): value is File => value instanceof File && value.size > 0);
}

/**
 * Stores the chosen photographs before the database transaction, so a file that cannot be decoded
 * refuses the save instead of creating a product whose photographs silently went missing.
 *
 * The key, dimensions, type and byte size come from the decoded bytes (`saveUpload`), never from the
 * request.
 */
async function storeImages(files: readonly File[]): Promise<UploadedAsset[]> {
  const assets: UploadedAsset[] = [];
  for (const file of files) assets.push(await saveUpload(file, 'product'));
  return assets;
}

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

  const images = imageFiles(form);
  const rawName = form.get('nameEn');
  const altEn = typeof rawName === 'string' ? rawName.trim() : '';

  /*
   * A refusal during creation returns to the create form, not the list: the product was not made, and
   * the list is not where the owner's unfinished work is. An edit returns to the product being edited.
   */
  const back = (notice: string): Response =>
    operation === 'create'
      ? redirectTo(`${CATALOG_PATH}/new?notice=${notice}`)
      : backToProduct(productId, notice);

  if (images.length > MAX_PRODUCT_IMAGES) return back('imageLimit');

  let assets: UploadedAsset[];
  try {
    assets = await storeImages(images);
  } catch {
    // `saveUpload` throws a plain Error for bytes that are not a readable image, or a file over the cap.
    return back('imageInvalid');
  }

  try {
    if (operation === 'create') {
      const created = await withTransaction(async (tx) => {
        const row = await createProduct(tx, actor, fields);
        for (const [index, asset] of assets.entries()) {
          // The first photograph becomes the card image automatically (`attachImage`), and alt text
          // starts as the product name the owner just typed; both can be changed after saving.
          await attachImage(tx, actor, {
            productId: row.productId,
            key: asset.key,
            altEn,
            sortOrder: index,
            asset,
          });
        }
        return row;
      });
      invalidateStorefrontCatalog();
      // Straight to the product's edit screen, where its gallery is now visible.
      return redirectTo(`${CATALOG_PATH}/${created.productId}?notice=created`);
    }

    if (operation === 'update') {
      await withTransaction(async (tx) => {
        await updateProduct(tx, actor, form.get('productId'), fields);
        for (const asset of assets) {
          await attachImage(tx, actor, { productId, key: asset.key, altEn, asset });
        }
      });
      invalidateStorefrontCatalog();
      return backToProduct(productId, 'updated');
    }

    await withTransaction((tx) => archiveProduct(tx, actor, form.get('productId')));
    invalidateStorefrontCatalog();
    return redirectTo(`${CATALOG_PATH}?notice=archived`);
  } catch (error) {
    if (error instanceof ValidationError) return back('invalid');
    if (error instanceof ConflictError) return back('conflict');
    if (error instanceof AuthorizationError) return back('denied');
    throw error;
  }
}
