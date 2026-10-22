
import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listBrands, listCategoriesForAdmin } from '@/server/catalog/service';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { ProductForm } from '../../../_ui/ProductForm';

export const dynamic = 'force-dynamic';

/**
 * New product.
 *
 * A route of its own, not `?new=1` on the list. The reference opens a full page for this form, and it
 * is right to: creating a product is a different task from scanning the catalog, it needs the whole
 * viewport, and it should not share a URL with a filtered list where a refresh can silently lose it.
 *
 * Requires `catalog.write` - the same permission the list requires and the write route re-checks. A
 * brand and a category are both required by the schema, so if either list is empty the form is not
 * rendered at all: showing a form whose required selects have no options is a dead end dressed up as
 * an affordance.
 */
export default async function NewProductPage() {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);

  const data = await withTransaction(async (tx) => {
    const [categories, brands] = await Promise.all([
      // Every category, not a page of them: the form's select must offer all of them.
      listCategoriesForAdmin(tx, { limit: 100 }),
      listBrands(tx),
    ]);
    return { categories: categories.rows, brands };
  });

  const canManage = hasPermission(principal, PERMISSIONS.catalogWrite);
  const ready = data.categories.length > 0 && data.brands.length > 0;

  return (
    <>
      <PageHeader
        title={translate('admin.catalog.createTitle')}
        description={translate('admin.catalog.createBody')}
      />

      {!ready ? (
        <Notice tone="warning">
          {translate('admin.catalog.createBlocked', {
            categories: data.categories.length,
            brands: data.brands.length,
          })}
        </Notice>
      ) : null}

      {canManage && ready ? (
        <ProductForm
          mode="create"
          values={{}}
          categories={data.categories.map((category) => ({
            id: category.id,
            nameEn: category.nameEn,
            productCount: category.productCount,
          }))}
          brands={data.brands.map((brand) => ({ id: brand.id, nameEn: brand.nameEn }))}
          csrfToken={principal.csrfToken}
          cancelHref="/admin/catalog"
        />
      ) : null}
    </>
  );
}
