import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listCategoriesForAdmin } from '@/server/catalog/service';
import { CategoriesView, type CategoriesNotice } from './CategoriesView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CategoriesNotice[] = [
  'created',
  'updated',
  'archived',
  'denied',
  'conflict',
  'invalid',
];

function readNotice(value: string | string[] | undefined): CategoriesNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CategoriesNotice) : null;
}

/**
 * Categories.
 *
 * Requires `catalog.write`. The product count per category is shown so the owner can see what an archive
 * would be refused for, rather than discovering it by attempting the deletion.
 */
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const params = await searchParams;

  const rawEdit = params.edit;
  const editId = Array.isArray(rawEdit) ? rawEdit[0] : rawEdit;

  const categories = await withTransaction((tx) => listCategoriesForAdmin(tx));
  const editing =
    editId === undefined
      ? null
      : (categories.find((category) => String(category.id) === String(editId)) ?? null);

  return (
    <CategoriesView
      categories={categories.map((category) => ({
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
        editing === null
          ? null
          : {
              id: editing.id,
              slug: editing.slug,
              nameBn: editing.nameBn,
              nameEn: editing.nameEn,
              descriptionBn: editing.descriptionBn,
              descriptionEn: editing.descriptionEn,
              sortOrder: editing.sortOrder,
              isVisible: editing.isVisible,
            }
      }
      notice={readNotice(params.notice)}
      canManage={hasPermission(principal, PERMISSIONS.catalogWrite)}
      csrfToken={principal.csrfToken}
    />
  );
}
