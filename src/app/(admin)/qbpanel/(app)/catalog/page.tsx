import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/qbpanel-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listBrands, listProductsForAdmin, PRODUCT_PAGE_SIZE } from '@/server/catalog/service';
import { CatalogView, type CatalogNotice } from './CatalogView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CatalogNotice[] = [
  'created',
  'updated',
  'availability',
  'archived',
  'brandCreated',
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
 * **The forms moved to their own routes** (`/qbpanel/catalog/new`, `/qbpanel/catalog/[productId]`), so this
 * page is only the list. `?edit=` and `?new=` are gone rather than left as dead aliases: a stale link
 * should reach the list, not a half-rendered form.
 *
 * Search and the availability filter are applied in SQL over the live rows only, and the list is paged
 * with an exact total so the footer cannot disagree with the rows it describes.
 */
export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const search = single(params.q).slice(0, 80);
  const stock = single(params.stock);
  const availability = stock === 'in_stock' || stock === 'out_of_stock' ? stock : undefined;
  const size = readPageSize(single(params.size), PRODUCT_PAGE_SIZE);

  const data = await withTransaction(async (tx) => {
    const [first, brands] = await Promise.all([
      listProductsForAdmin(tx, { search, availability, limit: size, offset: 0 }),
      listBrands(tx),
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

    return { products, brands, page, pageCount };
  });

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
      notice={readNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      csrfToken={principal.csrfToken}
      search={search}
      stock={availability ?? 'all'}
      total={data.products.total}
      page={data.page}
      pageCount={data.pageCount}
      size={size}
      defaultSize={PRODUCT_PAGE_SIZE}
      clearHref={buildQueryHref('/qbpanel/catalog', { size: size === PRODUCT_PAGE_SIZE ? null : size })}
    />
  );
}
