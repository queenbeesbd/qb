'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../admin.module.css';

/**
 * Page navigation for a bounded list.
 *
 * Two things it deliberately does:
 *
 * 1. **It is links, not buttons.** Every page is a real URL, so a page can be bookmarked, opened in a
 *    new tab and reached with the back button - and the list is filtered by the server, never by the
 *    browser.
 * 2. **It preserves the filters it was given.** `query` is passed through unchanged, so paging never
 *    silently drops a search term.
 *
 * When there is only one page it renders the count line and nothing else, so a short list has no dead
 * controls.
 */
export function Pagination({
  basePath,
  query,
  page,
  pageCount,
  shown,
  total,
}: {
  basePath: string;
  /** Current filters (`q`, `filter`, ...), re-applied to every link. Never includes `page`. */
  query: Readonly<Record<string, string>>;
  /** 1-based. */
  page: number;
  pageCount: number;
  shown: number;
  total: number;
}) {
  const { t } = useTranslation();

  const href = (target: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== '') params.set(key, value);
    }
    if (target > 1) params.set('page', String(target));
    const search = params.toString();
    return search === '' ? basePath : `${basePath}?${search}`;
  };

  return (
    <div className={styles.pagination}>
      <p className={styles.toolbarMeta}>{t('admin.common.showing', { shown, total })}</p>
      {pageCount > 1 && (
        <nav className={styles.pagerNav} aria-label={t('admin.common.paginationLabel')}>
          {page > 1 ? (
            <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={href(page - 1)} rel="prev">
              {t('admin.common.previousPage')}
            </Link>
          ) : null}
          <span className={styles.toolbarMeta}>{t('admin.common.pageOf', { page, pages: pageCount })}</span>
          {page < pageCount ? (
            <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={href(page + 1)} rel="next">
              {t('admin.common.nextPage')}
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}
