'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { buildQueryHref } from '@/lib/qbpanel-query';
import { imageVariantPath } from '@/lib/images';
import { formatMoney } from '@/lib/money';
import { AdminIcon } from '../../_ui/icons';
import { AvailabilitySwitch } from '../../_ui/AvailabilitySwitch';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import styles from '../../qbpanel.module.css';

export type CatalogProductRow = {
  id: number;
  slug: string;
  nameBn: string | null;
  nameEn: string;
  categoryNameEn: string;
  brandNameEn: string;
  availability: string;
  isPublished: boolean;
  priceMinor: number | null;
  imageCount: number;
  primaryImageKey: string | null;
};

export type CatalogBrandOption = { id: number; nameEn: string };

export type CatalogNotice =
  | 'created'
  | 'updated'
  | 'availability'
  | 'archived'
  | 'brandCreated'
  | 'denied'
  | 'conflict'
  | 'invalid';

const NOTICE_KEYS: Record<CatalogNotice, TranslationKey> = {
  created: 'admin.catalog.notice.created',
  updated: 'admin.catalog.notice.updated',
  availability: 'admin.catalog.notice.availability',
  archived: 'admin.catalog.notice.archived',
  brandCreated: 'admin.catalog.notice.brandCreated',
  denied: 'admin.catalog.notice.denied',
  conflict: 'admin.catalog.notice.conflict',
  invalid: 'admin.catalog.notice.invalid',
};

const ERROR_NOTICES: readonly CatalogNotice[] = ['denied', 'conflict', 'invalid'];

/**
 * Products - the list.
 *
 * The create and edit forms used to live on this page behind `?new=1` and `?edit=<id>`. They are now
 * their own routes (`/qbpanel/catalog/new` and `/qbpanel/catalog/[productId]`), which is what the reference
 * does and what this page needed: a filtered, paginated list and a full-height editor are different
 * tasks, and sharing a URL meant a refresh could lose whichever one you were in.
 *
 * What is left here is a list, and only a list: search, the availability filter, pagination, and per-row
 * actions. Availability stays a switch on the row because it is the field the owner changes most often,
 * and making it a trip to the edit screen would be a regression in the one workflow this page is for.
 */
export function CatalogView({
  products,
  notice,
  canManage,
  csrfToken,
  search,
  stock,
  total,
  page,
  pageCount,
  size,
  defaultSize,
  clearHref,
}: {
  products: readonly CatalogProductRow[];
  notice: CatalogNotice | null;
  canManage: boolean;
  csrfToken: string;
  search: string;
  stock: 'all' | 'in_stock' | 'out_of_stock';
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  clearHref: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);
  const filtering = search !== '' || stock !== 'all';

  /*
   * Every list link is built from the same state, and none of them carries `page`: changing what is
   * shown returns to page 1 instead of landing on an empty later page.
   */
  const withQuery = (next: { stock?: string; q?: string }): string =>
    buildQueryHref('/qbpanel/catalog', {
      q: next.q ?? search,
      stock: (next.stock ?? stock) === 'all' ? '' : (next.stock ?? stock),
      size: size === defaultSize ? '' : size,
    });

  return (
    <>
      <PageHeader
        title={t('admin.catalog.title')}
        actions={
          <Link className={styles.button} href="/qbpanel/catalog/new">
            <AdminIcon name="plus" width={15} height={15} />
            {t('admin.catalog.newProduct')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={noticeIsError ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-label={t('admin.catalog.title')}>
        <ListToolbar>
          <FilterTabs
            label={t('admin.catalog.filterLabel')}
            active={stock}
            options={[
              { value: 'all', label: t('admin.common.all'), href: withQuery({ stock: 'all' }) },
              { value: 'in_stock', label: t('admin.catalog.inStock'), href: withQuery({ stock: 'in_stock' }) },
              {
                value: 'out_of_stock',
                label: t('admin.catalog.outOfStock'),
                href: withQuery({ stock: 'out_of_stock' }),
              },
            ]}
          />

          <ListSearch
            action="/qbpanel/catalog"
            id="catalog-search"
            label={t('admin.catalog.searchLabel')}
            placeholder={t('admin.catalog.searchPlaceholder')}
            value={search}
            hidden={{ stock: stock === 'all' ? '' : stock, size: size === defaultSize ? '' : String(size) }}
            clearHref={clearHref}
            dirty={filtering}
            live
          />
        </ListToolbar>

        {products.length === 0 ? (
          <EmptyState
            icon={filtering ? 'search' : 'package'}
            title={filtering ? t('admin.catalog.emptyFilteredTitle') : t('admin.catalog.emptyTitle')}
            body={filtering ? t('admin.catalog.emptyFilteredBody') : t('admin.catalog.emptyBody')}
            action={
              filtering ? (
                <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                  {t('admin.common.clear')}
                </Link>
              ) : (
                <Link className={styles.button} href="/qbpanel/catalog/new">
                  {t('admin.catalog.newProduct')}
                </Link>
              )
            }
          />
        ) : (
          <ul className={styles.recordList} data-admin-list="">
            {/*
              No monogram. It printed the name's first character, so a catalogue full of vendor names
              starting with a digit showed 1,1,2,2,3,3 down the list and every row read as a row
              number. The title gets the space instead.
            */}
            {products.map((product) => (
              <li className={`${styles.record} ${styles.recordProduct}`} key={product.id}>
                {/*
                  The product's own photograph, small, so the owner recognises a row by sight rather
                  than by reading a 40-character vendor name. Decorative here: the row's title is the
                  name, and an alt repeating it would make every row announce twice.
                */}
                <span className={styles.recordPhoto} aria-hidden="true">
                  {product.primaryImageKey !== null && (
                    <img
                      src={imageVariantPath(product.primaryImageKey)}
                      alt=""
                      width={48}
                      height={64}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>
                    <Link
                      className={`${styles.recordLink} ${styles.recordTitleLink}`}
                      href={`/qbpanel/catalog/${product.id}`}
                    >
                      {product.nameEn}
                    </Link>
                  </span>
                  <span className={styles.recordMeta}>
                    <span>{product.categoryNameEn}</span>
                    <span>{product.brandNameEn}</span>
                    <span className={`${styles.mono} ${styles.recordSlug}`}>{product.slug}</span>
                    {!product.isPublished && <span className={styles.tagMuted}>{t('admin.catalog.unpublished')}</span>}
                    {product.imageCount === 0 && <span className={styles.tagWarn}>{t('admin.catalog.noImagesBadge')}</span>}
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <span className={styles.recordPrice}>
                    {product.priceMinor === null ? '—' : formatMoney(product.priceMinor)}
                  </span>
                  <AvailabilitySwitch
                    productId={product.id}
                    productName={product.nameEn}
                    availability={product.availability}
                    csrfToken={csrfToken}
                    canManage={canManage}
                  />
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/qbpanel/catalog/${product.id}`}>
                      {t('admin.catalog.edit')}
                    </Link>
                    {canManage && (
                      <ConfirmSubmit
                        action="/api/qbpanel/catalog/product"
                        csrfToken={csrfToken}
                        fields={{ operation: 'archive', productId: product.id }}
                        triggerLabel={t('admin.catalog.archive')}
                        triggerVariant="ghost"
                        title={t('admin.catalog.archive')}
                        body={t('admin.catalog.archiveConfirm')}
                        confirmLabel={t('admin.catalog.archive')}
                        cancelLabel={t('admin.common.cancel')}
                        pendingLabel={t('admin.common.working')}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {products.length > 0 && (
          <Pagination
            basePath="/qbpanel/catalog"
            query={{
              q: search,
              stock: stock === 'all' ? '' : stock,
              size: size === defaultSize ? '' : String(size),
            }}
            page={page}
            pageCount={pageCount}
            shown={products.length}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        )}
      </section>

      {canManage && (
        <section className={styles.section} aria-label={t('admin.catalog.brandTitle')}>
          <div className={`${styles.panel} ${styles.brandCta}`}>
            <div className={styles.formCardHead}>
              <h2 className={styles.panelTitle}>{t('admin.catalog.brandTitle')}</h2>
              <p>{t('admin.catalog.brandBody')}</p>
            </div>
            <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/qbpanel/catalog/brands/new">
              <AdminIcon name="plus" width={15} height={15} />
              {t('admin.catalog.brandSubmit')}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
