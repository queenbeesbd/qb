'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { EmptyState } from '../../../_ui/EmptyState';
import { ListSearch, ListToolbar } from '../../../_ui/ListToolbar';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { Pagination } from '../../../_ui/Pagination';
import styles from '../../../admin.module.css';
import { BRAND_NOTICE_ERRORS, BRAND_NOTICE_KEYS, type BrandNotice } from './notices';

export type BrandRow = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  logoKey: string | null;
  productCount: number;
};

/**
 * The brand list.
 *
 * The logo preview is the point of the row: the owner is here to check that each brand shows the mark
 * it should, so the picture sits where a letter tile used to. A brand with no logo says so in words -
 * the storefront draws its initials, and the row should not look broken because the shop chose that.
 */
export function BrandsView({
  brands,
  notice,
  canManage,
  search,
  total,
  page,
  pageCount,
  size,
  defaultSize,
  clearHref,
}: {
  brands: readonly BrandRow[];
  notice: BrandNotice | null;
  canManage: boolean;
  search: string;
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  clearHref: string;
}) {
  const { t } = useTranslation();
  const filtering = search !== '';

  return (
    <>
      <PageHeader title={t('admin.brands.title')} />

      {notice !== null && (
        <Notice tone={BRAND_NOTICE_ERRORS.includes(notice) ? 'error' : 'success'}>
          {t(BRAND_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <section className={styles.section} aria-label={t('admin.brands.title')}>
        <ListToolbar>
          <ListSearch
            action="/admin/catalog/brands"
            id="brand-search"
            label={t('admin.brands.searchLabel')}
            placeholder={t('admin.brands.searchPlaceholder')}
            value={search}
            hidden={{ size: size === defaultSize ? '' : String(size) }}
            clearHref={clearHref}
            dirty={filtering}
          />
        </ListToolbar>

        {brands.length === 0 ? (
          <EmptyState
            icon={filtering ? 'search' : 'tag'}
            title={filtering ? t('admin.brands.searchEmptyTitle') : t('admin.brands.emptyTitle')}
            body={filtering ? t('admin.brands.searchEmptyBody') : t('admin.brands.emptyBody')}
            action={
              filtering ? (
                <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                  {t('admin.common.clear')}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className={styles.recordList} data-admin-list="">
            {brands.map((brand) => (
              <li className={styles.record} key={brand.id}>
                <span className={styles.recordThumb} aria-hidden="true">
                  {brand.logoKey === null ? (
                    brand.nameEn.slice(0, 1).toUpperCase()
                  ) : (
                    <img className={styles.recordThumbLogo} src={imageVariantPath(brand.logoKey)} alt="" width={40} height={40} />
                  )}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{brand.nameEn}</span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{brand.slug}</span>
                    <span>{t('admin.brands.productCountValue', { count: brand.productCount })}</span>
                    {brand.logoKey === null && <span>{t('admin.brands.noLogo')}</span>}
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/admin/catalog/brands/${brand.id}`}>
                      {canManage ? t('admin.brands.editLogo') : t('admin.brands.viewLogo')}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {brands.length > 0 && (
          <Pagination
            basePath="/admin/catalog/brands"
            query={{ q: search, size: size === defaultSize ? '' : String(size) }}
            page={page}
            pageCount={pageCount}
            shown={brands.length}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        )}
      </section>
    </>
  );
}
