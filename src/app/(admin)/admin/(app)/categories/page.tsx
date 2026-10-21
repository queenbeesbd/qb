import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/admin-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { CATEGORY_PAGE_SIZE, getCategoryForAdmin, listCategoriesForAdmin } from '@/server/catalog/service';
import { CategoriesView, type CategoriesNotice, type CategoryVisibilityFilter } from './CategoriesView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CategoriesNotice[] = [
  'created',
  'updated',
  'archived',
  'denied',
  'conflict',
  'invalid',
];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): CategoriesNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CategoriesNotice) : null;
}

function readVisibility(value: string): CategoryVisibilityFilter {
  return value === 'visible' || value === 'hidden' ? value : 'all';
}

/**
 * Categories.
 *
 * Requires `catalog.write`. The product count per category is shown so the owner can see what an
 * archive would be refused for, rather than discovering it by attempting the deletion. `?new=1`
 * reveals the create form; `?edit=<id>` opens one category above the list.
 *
 * Search, the visibility filter, the page and the page size are applied in SQL and carried in the
 * URL. The edit id is resolved against the **live** rows the service returns, so a hand-crafted id
 * cannot open an archived category.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const editId = single(params.edit);
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

    // The edit target is read directly by id, not scanned out of the current page: the owner may
    // have searched for one category and then opened another from a link they followed earlier.
    const editing = editId === '' ? null : await getCategoryForAdmin(tx, editId);

    return { list, editing, page, pageCount };
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
        productCount: category.productCount,
      }))}
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
              sortOrder: data.editing.sortOrder,
              isVisible: data.editing.isVisible,
            }
      }
      notice={readNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      csrfToken={principal.csrfToken}
      creating={single(params.new) === '1'}
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
