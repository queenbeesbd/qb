import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/admin-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { BRAND_PAGE_SIZE, listBrandsForAdmin } from '@/server/catalog/service';
import { BrandsView } from './BrandsView';
import { readBrandNotice } from './notices';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * Brands - the list.
 *
 * Requires `catalog.write`, because the only thing the row leads to is an image association and the
 * page states which marks the shop does and does not own.
 *
 * **This page exists because a brand now has a picture.** Until the homepage brand rail was a circle
 * of logos, `brand.logo_key` was written only by the asset pipeline, so there was nothing to edit;
 * now the owner needs a place to say which mark a brand shows, and to replace one that is wrong.
 * The list is a list - the association itself lives on `/admin/catalog/brands/[brandId]`, which is
 * the editor pattern every other catalog module uses.
 */
export default async function AdminBrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const search = single(params.q).slice(0, 80);
  const size = readPageSize(single(params.size), BRAND_PAGE_SIZE);

  const data = await withTransaction(async (tx) => {
    const first = await listBrandsForAdmin(tx, { search, limit: size, offset: 0 });
    // The page number is resolved against the real total before the page is read, so a hand-typed
    // `?page=9999` shows the last page rather than an empty list with no explanation.
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(readPageNumber(single(params.page)), pageCount);
    const list =
      page === 1
        ? first
        : await listBrandsForAdmin(tx, { search, limit: size, offset: (page - 1) * size });

    return { list, page, pageCount };
  });

  return (
    <BrandsView
      brands={data.list.rows}
      notice={readBrandNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      search={search}
      total={data.list.total}
      page={data.page}
      pageCount={data.pageCount}
      size={size}
      defaultSize={BRAND_PAGE_SIZE}
      clearHref={buildQueryHref('/admin/catalog/brands', { size: size === BRAND_PAGE_SIZE ? null : size })}
    />
  );
}
