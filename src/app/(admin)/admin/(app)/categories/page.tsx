import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/admin-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { CATEGORY_PAGE_SIZE, listCategoriesForAdmin } from '@/server/catalog/service';
import { CategoriesView, type CategoryVisibilityFilter } from './CategoriesView';
import type { CategoryNotice } from './notices';

export const dynamic = 'force-dynamic';

/**
 * `created` and `updated` belong to the editor routes; only the archive reports back here, so the list
 * refuses to render a message about an act that did not happen on this page.
 */
const NOTICES: readonly CategoryNotice[] = ['archived', 'denied', 'conflict', 'invalid'];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): CategoryNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CategoryNotice) : null;
}

function readVisibility(value: string): CategoryVisibilityFilter {
  return value === 'visible' || value === 'hidden' ? value : 'all';
}

/**
 * Categories.
 *
 * Requires `catalog.write`. **The forms moved to their own routes** (`/admin/categories/new`,
 * `/admin/categories/[categoryId]`), so this page is only the list, and `?new=1` and `?edit=` are gone
 * rather than left as dead aliases: a stale link should reach the list, not a half-rendered form.
 *
 * The product and subcategory counts are shown per row because together they are exactly what an
 * archive is refused for - both are derived in SQL, so neither can disagree with the catalog and the
 * owner can see what is in the way before pressing the button.
 *
 * Search, the visibility filter, the page and the page size are applied in SQL and carried in the
 * URL. The count and the rows run over the same predicate, so the footer cannot disagree with them.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const search = single(params.q).slice(0, 80);
  const visibility = readVisibility(single(params.visibility));
  const size = readPageSize(single(params.size), CATEGORY_PAGE_SIZE);

  const data = await withTransaction(async (tx) => {
    const first = await listCategoriesForAdmin(tx, {
      search,
      visibility: visibility === 'all' ? undefined : visibility,
      limit: size,
      offset: 0,
    });
    // The page number is resolved against the real total before the page is read, so a hand-typed
    // `?page=9999` shows the last page rather than an empty list with no explanation.
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(readPageNumber(single(params.page)), pageCount);
    const list =
      page === 1
        ? first
        : await listCategoriesForAdmin(tx, {
            search,
            visibility: visibility === 'all' ? undefined : visibility,
            limit: size,
            offset: (page - 1) * size,
          });

    return { list, page, pageCount };
  });

  return (
    <CategoriesView
      categories={data.list.rows.map((category) => ({
        id: category.id,
        slug: category.slug,
        nameBn: category.nameBn,
        nameEn: category.nameEn,
        descriptionBn: category.descriptionBn,
        descriptionEn: category.descriptionEn,
        sortOrder: category.sortOrder,
        isVisible: category.isVisible,
        parentId: category.parentId,
        parentNameEn: category.parentNameEn,
        productCount: category.productCount,
        subcategoryCount: category.subcategoryCount,
      }))}
      notice={readNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      csrfToken={principal.csrfToken}
      search={search}
      visibility={visibility}
      total={data.list.total}
      page={data.page}
      pageCount={data.pageCount}
      size={size}
      defaultSize={CATEGORY_PAGE_SIZE}
      clearHref={buildQueryHref('/admin/categories', { size: size === CATEGORY_PAGE_SIZE ? null : size })}
    />
  );
}
