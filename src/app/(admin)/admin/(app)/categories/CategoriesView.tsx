'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { buildQueryHref } from '@/lib/admin-query';
import { AdminIcon } from '../../_ui/icons';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill } from '../../_ui/StatusPill';
import styles from '../../admin.module.css';
import { CATEGORY_NOTICE_ERRORS, CATEGORY_NOTICE_KEYS, type CategoryNotice } from './notices';

export type CategoryRow = {
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isVisible: boolean;
  parentId: number | null;
  parentNameEn: string | null;
  productCount: number;
  subcategoryCount: number;
};

/** The visibility filter. `all` is the unfiltered list, not a third state on a category. */
export type CategoryVisibilityFilter = 'all' | 'visible' | 'hidden';

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
  visibility,
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
  visibility: CategoryVisibilityFilter;
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  clearHref: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && CATEGORY_NOTICE_ERRORS.includes(notice);
  const filtering = search !== '' || visibility !== 'all';

  /*
   * Every list link is built from the same state and none of them carries `page`, so changing what is
   * shown returns to page 1 rather than an empty later page.
   */
  const href = (next: { q?: string; visibility?: string }): string =>
    buildQueryHref('/admin/categories', {
      q: next.q ?? search,
      visibility: (next.visibility ?? visibility) === 'all' ? '' : (next.visibility ?? visibility),
      size: size === defaultSize ? '' : size,
    });

  return (
    <>
      <PageHeader
        title={t('admin.categories.title')}
        actions={
          <Link className={styles.button} href="/admin/categories/new">
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
          <FilterTabs
            label={t('admin.categories.filterLabel')}
            active={visibility}
            options={[
              { value: 'all', label: t('admin.common.all'), href: href({ visibility: 'all' }) },
              { value: 'visible', label: t('admin.categories.visible'), href: href({ visibility: 'visible' }) },
              { value: 'hidden', label: t('admin.categories.hidden'), href: href({ visibility: 'hidden' }) },
            ]}
          />

          <ListSearch
            action="/admin/categories"
            id="category-search"
            label={t('admin.categories.searchLabel')}
            placeholder={t('admin.categories.searchPlaceholder')}
            value={search}
            hidden={{
              visibility: visibility === 'all' ? '' : visibility,
              size: size === defaultSize ? '' : String(size),
            }}
            clearHref={clearHref}
            dirty={filtering}
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
                <Link className={styles.button} href="/admin/categories/new">
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
                  <StatusPill tone={category.isVisible ? 'success' : 'neutral'}>
                    {category.isVisible ? t('admin.categories.visible') : t('admin.categories.hidden')}
                  </StatusPill>
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/admin/categories/${category.id}`}>
                      {t('admin.categories.edit')}
                    </Link>
                    {canManage && (
                      <ConfirmSubmit
                        action="/api/admin/catalog/category"
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
            basePath="/admin/categories"
            query={{
              q: search,
              visibility: visibility === 'all' ? '' : visibility,
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
