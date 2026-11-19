'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from '../../_ui/icons';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import styles from '../../qbpanel.module.css';
import { CATEGORY_NOTICE_ERRORS, CATEGORY_NOTICE_KEYS, type CategoryNotice } from './notices';

export type CategoryRow = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  parentId: number | null;
  parentNameEn: string | null;
  productCount: number;
  subcategoryCount: number;
};

/**
 * The category list.
 *
 * The list only: creating and editing are their own routes, so this page has one job and no form to
 * lose on a refresh.
 *
 * Archiving is refused while a category still has live products or subcategories, so both counts are
 * shown in the row - the owner can see what is in the way before trying, instead of learning it from a
 * refusal. The refusal itself happens on the server, in the same transaction as the read that decides
 * it.
 */
export function CategoriesView({
  categories,
  notice,
  canManage,
  csrfToken,
  search,
  total,
  page,
  pageCount,
  size,
  defaultSize,
  clearHref,
}: {
  categories: readonly CategoryRow[];
  notice: CategoryNotice | null;
  canManage: boolean;
  csrfToken: string;
  search: string;
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  clearHref: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && CATEGORY_NOTICE_ERRORS.includes(notice);
  const filtering = search !== '';

  /*
   * Every list link is built from the same state and none of them carries `page`, so changing what is
   * shown returns to page 1 rather than an empty later page.
   */

  return (
    <>
      <PageHeader
        title={t('admin.categories.title')}
        actions={
          <Link className={styles.button} href="/qbpanel/categories/new">
            <AdminIcon name="plus" width={15} height={15} />
            {t('admin.categories.create')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={noticeIsError ? 'error' : 'success'}>{t(CATEGORY_NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-label={t('admin.categories.title')}>
        <ListToolbar>
          {/*
            One search field and no state filter: a category is always visible (owner direction,
            2026-11-19), so a "visible / hidden" pair would be a control over a state nothing can set.
            Archiving is what removes a category, and the list already excludes archived rows.
          */}
          <ListSearch
            action="/qbpanel/categories"
            id="category-search"
            label={t('admin.categories.searchLabel')}
            placeholder={t('admin.categories.searchPlaceholder')}
            value={search}
            hidden={{ size: size === defaultSize ? '' : String(size) }}
            clearHref={clearHref}
            dirty={filtering}
            live
          />
        </ListToolbar>

        {categories.length === 0 ? (
          <EmptyState
            icon={filtering ? 'search' : 'categories'}
            title={filtering ? t('admin.categories.searchEmptyTitle') : t('admin.categories.emptyTitle')}
            body={filtering ? t('admin.categories.searchEmptyBody') : t('admin.categories.emptyBody')}
            action={
              filtering ? (
                <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                  {t('admin.common.clear')}
                </Link>
              ) : (
                <Link className={styles.button} href="/qbpanel/categories/new">
                  {t('admin.categories.emptyAction')}
                </Link>
              )
            }
          />
        ) : (
          <ul className={styles.recordList} data-admin-list="">
            {categories.map((category) => (
              <li className={styles.record} key={category.id}>
                <span
                  className={styles.recordThumb}
                  data-subcategory={category.parentId === null ? undefined : 'true'}
                  aria-hidden="true"
                >
                  {category.nameEn.slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{category.nameEn}</span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{category.slug}</span>
                    {category.parentNameEn !== null && (
                      <span>{t('admin.categories.inParent', { name: category.parentNameEn })}</span>
                    )}
                    <span>{t('admin.categories.productCountValue', { count: category.productCount })}</span>
                    <span>
                      {t('admin.categories.subcategoryCountValue', { count: category.subcategoryCount })}
                    </span>
                    <span>{t('admin.categories.orderValue', { count: category.sortOrder })}</span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/qbpanel/categories/${category.id}`}>
                      {t('admin.categories.edit')}
                    </Link>
                    {canManage && (
                      <ConfirmSubmit
                        action="/api/qbpanel/catalog/category"
                        csrfToken={csrfToken}
                        fields={{ operation: 'archive', categoryId: category.id }}
                        triggerLabel={t('admin.categories.archive')}
                        triggerVariant="ghost"
                        title={t('admin.categories.archive')}
                        body={t('admin.categories.archiveConfirm')}
                        confirmLabel={t('admin.categories.archive')}
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

        {categories.length > 0 && (
          <Pagination
            basePath="/qbpanel/categories"
            query={{
              q: search,
              size: size === defaultSize ? '' : String(size),
            }}
            page={page}
            pageCount={pageCount}
            shown={categories.length}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        )}
      </section>
    </>
  );
}
