import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/admin-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import {
  getProductForAdmin,
  listBrands,
  listCategoriesForAdmin,
  listProductsForAdmin,
  PRODUCT_PAGE_SIZE,
} from '@/server/catalog/service';
import { CatalogView, type CatalogNotice } from './CatalogView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CatalogNotice[] = [
  'created',
  'updated',
  'availability',
  'archived',
  'brandCreated',
  'imageAttached',
  'imageUpdated',
  'imageRemoved',
  'denied',
  'conflict',
  'invalid',
];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): CatalogNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CatalogNotice) : null;
}

/**
 * Products.
 *
 * Requires `catalog.write` to view: this page discloses prices, unpublished rows and archive state, so it
 * is not readable by a principal that cannot change them. Every control posts to a route that re-checks
 * the permission server-side.
 *
 * `?edit=<id>` opens one product; `?new=1` reveals the create form. The id is validated by the service,
 * which returns `null` for anything that is not a live product, so a hand-crafted id cannot disclose an
 * archived row. Search and the availability filter are applied in SQL over the live rows only.
 */
export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const editId = single(params.edit);
  const search = single(params.q).slice(0, 80);
  const stock = single(params.stock);
  const availability = stock === 'in_stock' || stock === 'out_of_stock' ? stock : undefined;
  const size = readPageSize(single(params.size), PRODUCT_PAGE_SIZE);

  const data = await withTransaction(async (tx) => {
    const [first, categories, brands, editing] = await Promise.all([
      listProductsForAdmin(tx, { search, availability, limit: size, offset: 0 }),
      // The category form needs every category, not the page of them the list happens to show.
      listCategoriesForAdmin(tx, { limit: 100 }),
      listBrands(tx),
      editId === '' ? Promise.resolve(null) : getProductForAdmin(tx, editId),
    ]);

    // The page number is resolved against the real total before the page is read, so a hand-typed
    // `?page=9999` shows the last page rather than an empty list with no explanation.
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(readPageNumber(single(params.page)), pageCount);
    const products =
      page === 1
        ? first
        : await listProductsForAdmin(tx, {
            search,
            availability,
            limit: size,
            offset: (page - 1) * size,
          });

    return { products, categories: categories.rows, brands, editing, page, pageCount };
  });

  // The asset inventory is read from the server's own filesystem, not from the request, and the file
  // metadata behind each key is derived from the bytes at attach time.
  const assets = await listAssetKeys();

  return (
    <CatalogView
      products={data.products.rows.map((product) => ({
        id: product.id,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        categoryNameEn: product.categoryNameEn,
        brandNameEn: product.brandNameEn,
        availability: product.availability,
        isPublished: product.isPublished,
        priceMinor: product.priceMinor,
        imageCount: product.imageCount,
        primaryImageKey: product.primaryImageKey,
      }))}
      categories={data.categories.map((category) => ({ id: category.id, nameEn: category.nameEn }))}
      brands={data.brands.map((brand) => ({ id: brand.id, nameEn: brand.nameEn }))}
      assets={assets}
      editing={
        data.editing === null
          ? null
          : {
              id: data.editing.id,
              slug: data.editing.slug,
              nameBn: data.editing.nameBn,
              nameEn: data.editing.nameEn,
              descriptionBn: data.editing.descriptionBn,
              descriptionEn: data.editing.descriptionEn,
              packSize: data.editing.packSize,
              categoryId: data.editing.categoryId,
              brandId: data.editing.brandId,
              availability: data.editing.availability,
              isPublished: data.editing.isPublished,
              priceMinor: data.editing.priceMinor,
              compareAtPriceMinor: data.editing.compareAtPriceMinor,
              sku: data.editing.sku,
              images: data.editing.images,
            }
      }
      notice={readNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      csrfToken={principal.csrfToken}
      search={search}
      stock={availability ?? 'all'}
      creating={single(params.new) === '1'}
      total={data.products.total}
      page={data.page}
      pageCount={data.pageCount}
      size={size}
      defaultSize={PRODUCT_PAGE_SIZE}
      clearHref={buildQueryHref('/admin/catalog', { size: size === PRODUCT_PAGE_SIZE ? null : size })}
    />
  );
}
