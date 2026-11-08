import Link from 'next/link';

import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listAssetKeys } from '@/server/catalog/assets';
import { Notice } from '../../../../_ui/Notice';
import { PageHeader } from '../../../../_ui/PageHeader';
import { BrandForm } from '../BrandForm';
import { BRAND_NOTICE_ERRORS, BRAND_NOTICE_KEYS, readBrandNotice } from '../notices';
import styles from '../../../../qbpanel.module.css';

export const dynamic = 'force-dynamic';

/**
 * New brand.
 *
 * A route of its own, not a disclosure under the product list: a brand is a prerequisite for a
 * product and has a mark, a name and an address, which is a form, not a footnote. The photograph can
 * be uploaded before the brand exists - the write route stores it and creates the row together.
 */
export default async function NewBrandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.catalogWrite);
  const query = await searchParams;
  const notice = readBrandNotice(query.notice);

  const assetKeys = await listAssetKeys();
  const ordered = [
    ...assetKeys.filter((key) => key.startsWith('brand-logo-')),
    ...assetKeys.filter((key) => !key.startsWith('brand-logo-')),
  ];

  return (
    <>
      <PageHeader
        title={translate('admin.brands.createTitle')}
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
        mode="create"
        values={{}}
        assetKeys={ordered}
        csrfToken={principal.csrfToken}
        cancelHref="/qbpanel/catalog/brands"
      />
    </>
  );
}
