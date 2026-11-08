import Link from 'next/link';
import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import { getBrandForAdmin } from '@/server/catalog/service';
import { Notice } from '../../../../_ui/Notice';
import { PageHeader } from '../../../../_ui/PageHeader';
import { BrandForm } from '../BrandForm';
import { BRAND_NOTICE_ERRORS, BRAND_NOTICE_KEYS, readBrandNotice } from '../notices';
import styles from '../../../../qbpanel.module.css';

export const dynamic = 'force-dynamic';

/**
 * Edit one brand: its name, address and mark, in one form.
 *
 * The id is resolved by the service, which returns `null` for anything that is not a live brand, so a
 * stale link is a **404** rather than an editor that would save over nothing. The mark can be
 * uploaded locally or chosen from the shop's inventory; the route writes the row and the image in one
 * transaction.
 */
export default async function EditBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const { brandId } = await params;

  const [brand, assetKeys] = await Promise.all([
    withTransaction((tx) => getBrandForAdmin(tx, brandId)),
    listAssetKeys(),
  ]);
  if (brand === null) notFound();

  const query = await searchParams;
  const notice = readBrandNotice(query.notice);

  const ordered = [
    ...assetKeys.filter((key) => key.startsWith('brand-logo-')),
    ...assetKeys.filter((key) => !key.startsWith('brand-logo-')),
  ];

  return (
    <>
      <PageHeader
        title={brand.nameEn}
        description={translate('admin.brands.editorBody')}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/qbpanel/catalog/brands">
            {translate('admin.brandLogo.back')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={BRAND_NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>
          {translate(BRAND_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <BrandForm
        mode="edit"
        brandId={brand.id}
        values={{
          nameEn: brand.nameEn,
          nameBn: brand.nameBn,
          slug: brand.slug,
          logoKey: brand.logoKey,
        }}
        productCount={brand.productCount}
        assetKeys={ordered}
        csrfToken={principal.csrfToken}
        cancelHref="/qbpanel/catalog/brands"
      />
    </>
  );
}
