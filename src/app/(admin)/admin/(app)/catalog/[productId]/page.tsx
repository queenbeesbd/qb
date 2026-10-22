import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import { getProductForAdmin, listBrands, listCategoriesForAdmin } from '@/server/catalog/service';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { ProductForm } from '../../../_ui/ProductForm';
import { ProductMediaPanel } from '../../../_ui/ProductMediaPanel';

export const dynamic = 'force-dynamic';

/**
 * The notices this page can receive. Mapped to copy here rather than echoed: a redirect carries a
 * fixed code, never a submitted value, so a refusal cannot reflect attacker-controlled text.
 */
const NOTICE_KEYS = {
  created: 'admin.catalog.notice.created',
  updated: 'admin.catalog.notice.updated',
  availability: 'admin.catalog.notice.availability',
  imageAttached: 'admin.catalog.notice.imageAttached',
  imageUpdated: 'admin.catalog.notice.imageUpdated',
  imageRemoved: 'admin.catalog.notice.imageRemoved',
  imageReordered: 'admin.catalog.notice.imageReordered',
  denied: 'admin.catalog.notice.denied',
  conflict: 'admin.catalog.notice.conflict',
  invalid: 'admin.catalog.notice.invalid',
} as const;

const NOTICE_ERRORS: readonly string[] = ['denied', 'conflict', 'invalid'];

/**
 * Edit one product.
 *
 * A route of its own rather than `?edit=<id>` on the list, for the same reasons the create screen is:
 * editing is a different task from scanning, it needs the whole viewport, and a refresh on a filtered
 * list should not silently drop the product being edited.
 *
 * The id is resolved by the service, which returns `null` for anything that is not a live product - so
 * a hand-typed id cannot disclose an archived row, and a stale link is a **404** rather than an empty
 * form that would save over nothing.
 *
 * Images live below the form rather than inside it: they are separate guarded posts against a separate
 * endpoint, and nesting one form in another is invalid HTML.
 */
export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const { productId } = await params;
  const query = await searchParams;
  const rawNotice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const notice = rawNotice !== undefined && rawNotice in NOTICE_KEYS ? (rawNotice as keyof typeof NOTICE_KEYS) : null;

  const data = await withTransaction(async (tx) => {
    const product = await getProductForAdmin(tx, productId);
    if (product === null) return null;
    const [categories, brands] = await Promise.all([
      listCategoriesForAdmin(tx, { limit: 100 }),
      listBrands(tx),
    ]);
    return { product, categories: categories.rows, brands };
  });

  if (data === null) notFound();

  // The asset inventory is read from the server's own filesystem, never from the request.
  const assets = await listAssetKeys();
  const canManage = hasPermission(principal, PERMISSIONS.catalogWrite);

  return (
    <>
      <PageHeader
        title={data.product.nameEn}
        description={translate('admin.catalog.editBody')}
      />

      {notice !== null && (
        <Notice tone={NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>{translate(NOTICE_KEYS[notice])}</Notice>
      )}

      <ProductForm
        mode="edit"
        productId={data.product.id}
        values={{
          slug: data.product.slug,
          nameBn: data.product.nameBn,
          nameEn: data.product.nameEn,
          shortDescription: data.product.shortDescription,
          descriptionBn: data.product.descriptionBn,
          descriptionEn: data.product.descriptionEn,
          packSize: data.product.packSize,
          categoryId: data.product.categoryId,
          brandId: data.product.brandId,
          priceMinor: data.product.priceMinor,
          compareAtPriceMinor: data.product.compareAtPriceMinor,
          sku: data.product.sku,
          availability: data.product.availability,
          isPublished: data.product.isPublished,
        }}
        categories={data.categories.map((category) => ({
          id: category.id,
          nameEn: category.nameEn,
          productCount: category.productCount,
        }))}
        brands={data.brands.map((brand) => ({ id: brand.id, nameEn: brand.nameEn }))}
        csrfToken={principal.csrfToken}
        cancelHref="/admin/catalog"
      />

      <ProductMediaPanel
        productId={data.product.id}
        images={data.product.images}
        assets={assets}
        csrfToken={principal.csrfToken}
        canManage={canManage}
      />

      {!canManage ? (
        <Notice tone="error">{translate('admin.catalog.readOnly')}</Notice>
      ) : null}
    </>
  );
}
