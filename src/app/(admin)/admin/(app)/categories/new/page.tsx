import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import { listCategoriesForAdmin } from '@/server/catalog/service';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { CategoryForm } from '../CategoryForm';
import { CATEGORY_NOTICE_ERRORS, CATEGORY_NOTICE_KEYS, readCategoryNotice } from '../notices';

export const dynamic = 'force-dynamic';

/**
 * New category.
 *
 * A route of its own rather than `?new=1` on the list, for the same reason the product and promo
 * editors have one: scanning a filtered list and filling in a full-height form are different tasks,
 * and sharing a URL lets a refresh lose whichever one the owner was in.
 *
 * Nothing is read from the database here. A category has no dependencies to resolve before it can be
 * created - no parent to choose, no brand to pick - so the form is complete on its own.
 *
 * A **refused** create returns to this route with a notice code, so the page has to render one:
 * otherwise the owner is sent back to an identical-looking form with nothing said about the refusal.
 */
export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const query = await searchParams;
  const notice = readCategoryNotice(query.notice);

  /*
   * Only live **roots** are offered as parents. The catalog is read here rather than in the client so
   * the form cannot offer a category that has since been archived, and so the one-level rule is not a
   * fact the browser decides.
   */
  const [parentOptions, assetKeys] = await Promise.all([
    withTransaction(async (tx) => {
      const { rows } = await listCategoriesForAdmin(tx, { limit: 100 });
      return rows
        .filter((row) => row.parentId === null)
        .map((row) => ({ id: row.id, nameEn: row.nameEn }));
    }),
    listAssetKeys(),
  ]);

  return (
    <>
      <PageHeader
        title={translate('admin.categories.createTitle')}
      />

      {notice !== null && (
        <Notice tone={CATEGORY_NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>
          {translate(CATEGORY_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <CategoryForm
        mode="create"
        values={{}}
        csrfToken={principal.csrfToken}
        cancelHref="/admin/categories"
        parentOptions={parentOptions}
        assetKeys={assetKeys}
      />
    </>
  );
}
