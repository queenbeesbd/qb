'use client';

import Link from 'next/link';

import { PAGE_SIZE_OPTIONS, buildQueryHref } from '@/lib/admin-query';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '../admin.module.css';

/**
 * The footer of every admin list (Phase 30).
 *
 * Three things it deliberately does:
 *
 * 1. **It is links, not buttons.** Every page and every page size is a real URL, so a page can be
 *    bookmarked, opened in a new tab and reached with the back button - and the list is filtered by
 *    the server, never by the browser.
 * 2. **It preserves the filters it was given.** `query` is passed through unchanged, so paging never
 *    silently drops a search term or a date range.
 * 3. **It states the size of the list exactly once.** This is the only place a list says how many
 *    records it holds; repeating the count in the header and the toolbar is how one screen ends up
 *    showing three different totals.
 *
 * Changing the page size drops `page` and returns to the first page: page 4 of 25-row pages is not a
 * meaningful place to be after switching to 100-row pages.
 */
export function Pagination({
  basePath,
  query,
  page,
  pageCount,
  shown,
  total,
  size,
  sizeOptions = PAGE_SIZE_OPTIONS,
  defaultSize,
}: {
  basePath: string;
  /** Current filters (`q`, `filter`, `size`, ...). Never includes `page`. */
  query: Readonly<Record<string, string>>;
  /** 1-based. */
  page: number;
  pageCount: number;
  shown: number;
  total: number;
  /** The page size in force, and the choices offered. Omit to hide the control. */
  size?: number;
  sizeOptions?: readonly number[];
  /** The list's own default, omitted from the URL so the clean path stays clean. */
  defaultSize?: number;
}) {
  const { t } = useTranslation();

  const href = (target: number): string =>
    buildQueryHref(basePath, { ...query, page: target > 1 ? target : null });

  return (
    <div className={styles.pagination}>
      <p className={styles.toolbarMeta}>{t('admin.common.showing', { shown, total })}</p>

      <div className={styles.pagerGroup}>
        {size !== undefined && sizeOptions.length > 1 && (
          <div className={styles.pageSize}>
            <span className={styles.pageSizeLabel}>{t('admin.common.pageSizeLabel')}</span>
            <div className={styles.pageSizeOptions} role="group" aria-label={t('admin.common.pageSizeLabel')}>
              {sizeOptions.map((option) => (
                <Link
                  key={option}
                  href={buildQueryHref(basePath, {
                    ...query,
                    size: option === defaultSize ? null : option,
                  })}
                  className={
                    option === size
                      ? `${styles.pageSizeOption} ${styles.pageSizeOptionActive}`
                      : styles.pageSizeOption
                  }
                  aria-current={option === size ? 'true' : undefined}
                >
                  {option}
                </Link>
              ))}
            </div>
          </div>
        )}

        {pageCount > 1 && (
          <nav className={styles.pagerNav} aria-label={t('admin.common.paginationLabel')}>
            {page > 1 ? (
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href={href(page - 1)}
                rel="prev"
              >
                {t('admin.common.previousPage')}
              </Link>
            ) : null}
            <span className={styles.toolbarMeta}>{t('admin.common.pageOf', { page, pages: pageCount })}</span>
            {page < pageCount ? (
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href={href(page + 1)}
                rel="next"
              >
                {t('admin.common.nextPage')}
              </Link>
            ) : null}
          </nav>
        )}
      </div>
    </div>
  );
}
