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
import { BrandLogoForm } from './BrandLogoForm';
import { BRAND_NOTICE_ERRORS, BRAND_NOTICE_KEYS, readBrandNotice } from '../notices';
import styles from '../../../../admin.module.css';

export const dynamic = 'force-dynamic';

/**
 * Edit one brand's logo.
 *
 * A route of its own rather than a picker on the list, for the reason every other catalog module
 * settled on: a filtered list and a full-height editor are different tasks. The id is resolved by the
 * service, which returns `null` for anything that is not a live brand, so a stale link is a **404**
 * rather than an editor that would save over nothing.
 *
 * The asset list is the server's own inventory, with the brand-logo family first: the owner is here to
 * pick a mark, and the 240 logos the shop already owns should not be buried under product photography.
 * Any catalog image may still be chosen - a category photograph used as a brand mark is the owner's
 * call, not the service's.
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
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/admin/catalog/brands">
            {translate('admin.brandLogo.back')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={BRAND_NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>
          {translate(BRAND_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <BrandLogoForm
        brandId={brand.id}
        brandName={brand.nameEn}
        logoKey={brand.logoKey}
        csrfToken={principal.csrfToken}
        assetKeys={ordered}
      />
    </>
  );
}
