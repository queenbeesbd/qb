import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import { getCategoryForAdmin, listCategoriesForAdmin } from '@/server/catalog/service';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { CategoryForm } from '../CategoryForm';
import { CATEGORY_NOTICE_ERRORS, CATEGORY_NOTICE_KEYS, readCategoryNotice } from '../notices';

export const dynamic = 'force-dynamic';

/**
 * Edit one category.
 *
 * A route of its own rather than `?edit=<id>` on the list. The id is resolved by the service, which
 * returns `null` for anything that is not a live category - an archived row, an unknown id or a
 * malformed one - so a hand-typed id cannot disclose an archived record and a stale link is a **404**
 * rather than an empty form that would save over nothing.
 *
 * The two counts are read, not stored, and they are the same two `archiveCategory` refuses on, so the
 * editor can state what is in the way before the owner presses Archive on the list.
 */
export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const { categoryId } = await params;

  const [data, assetKeys] = await Promise.all([
    withTransaction(async (tx) => {
      const category = await getCategoryForAdmin(tx, categoryId);
      if (category === null) return null;
      const { rows } = await listCategoriesForAdmin(tx, { limit: 100 });
      return { category, rows };
    }),
    listAssetKeys(),
  ]);
  if (data === null) notFound();
  const { category, rows } = data;

  /*
   * A parent must be a live root and cannot be this category. When this category already has live
   * children it must stay a root, so no picker is offered at all - the form states why instead.
   */
  const parentLocked = category.subcategoryCount > 0;
  const parentOptions = parentLocked
    ? []
    : rows
        .filter((row) => row.parentId === null && row.id !== category.id)
        .map((row) => ({ id: row.id, nameEn: row.nameEn }));

  const query = await searchParams;
  const notice = readCategoryNotice(query.notice);

  return (
    <>
      <PageHeader title={category.nameEn} />

      {notice !== null && (
        <Notice tone={CATEGORY_NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>
          {translate(CATEGORY_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <CategoryForm
        mode="edit"
        categoryId={category.id}
        values={{
          slug: category.slug,
          nameEn: category.nameEn,
          nameBn: category.nameBn,
          descriptionEn: category.descriptionEn,
          descriptionBn: category.descriptionBn,
          sortOrder: category.sortOrder,
          isVisible: category.isVisible,
          tagline: category.tagline,
          imageKey: category.imageKey,
          parentId: category.parentId,
        }}
        /*
         * The whole asset inventory, offered as the category's photograph. The list is the server's own
         * directory (plus keys already recorded), not a client-supplied path, so every entry names a
         * complete image the shop actually owns.
         */
        assetKeys={assetKeys}
        usage={{
          productCount: category.productCount,
          subcategoryCount: category.subcategoryCount,
        }}
        csrfToken={principal.csrfToken}
        cancelHref="/admin/categories"
        parentOptions={parentOptions}
        parentLocked={parentLocked}
      />
    </>
  );
}
