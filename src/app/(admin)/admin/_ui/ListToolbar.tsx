'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import styles from '../admin.module.css';

/**
 * The one toolbar shape for an admin list (Phase 30).
 *
 * Order is fixed across every list: **the coarse filter first, then the search field, then whatever
 * else the page needs**. The filter is what an owner reaches for when the list is long ("show me the
 * ones waiting"), the search is what they reach for when they know which record they want, and
 * keeping the same order on every list is what makes the panel feel like one product instead of six.
 *
 * The count is deliberately **not** here. It lives in the pagination footer, once, because a list
 * that states its size in the header, the toolbar and the footer is how the reference ended up
 * showing three different totals on one screen.
 */
export function ListToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.toolbar} data-admin-toolbar="">
      {children}
    </div>
  );
}

/**
 * The search form for a list.
 *
 * It is a real `GET` form, so it works without JavaScript and the result is a URL. The filters that
 * are already active travel as hidden fields, and the **page number never does** - narrowing a list
 * returns to its first page instead of landing on an empty page 4.
 */
export function ListSearch({
  action,
  id,
  label,
  placeholder,
  value,
  hidden,
  clearHref,
  dirty,
}: {
  action: string;
  /** Unique per page: two lists on one route must not share a label target. */
  id: string;
  label: string;
  placeholder: string;
  value: string;
  hidden?: Readonly<Record<string, string | undefined>>;
  /** The unfiltered list, so "Clear" resets every filter rather than only the search box. */
  clearHref: string;
  /** True when anything is narrowing the list, which is what makes "Clear" meaningful. */
  dirty: boolean;
}) {
  const { t } = useTranslation();

  return (
    <form className={styles.searchForm} action={action} method="get" role="search">
      {Object.entries(hidden ?? {}).map(([name, hiddenValue]) =>
        hiddenValue === undefined || hiddenValue === '' ? null : (
          <input key={name} type="hidden" name={name} value={hiddenValue} />
        ),
      )}
      <div className={styles.searchField}>
        <AdminIcon name="search" width={16} height={16} />
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className={styles.input}
          type="search"
          name="q"
          defaultValue={value}
          placeholder={placeholder}
          maxLength={80}
        />
      </div>
      <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
        {t('admin.common.search')}
      </button>
      {dirty && (
        <Link className={styles.recordLink} href={clearHref}>
          {t('admin.common.clear')}
        </Link>
      )}
    </form>
  );
}

export type FilterTabOption = {
  readonly value: string;
  readonly label: string;
  readonly href: string;
  /** An optional real count beside the label. Never a decoration: omit it when it is not counted. */
  readonly count?: number;
};

/**
 * A segmented filter, rendered as links.
 *
 * Links, not buttons: every filtered view is a URL, so it can be bookmarked, shared and reached with
 * the back button, and the filtering itself happens on the server. The active tab carries
 * `aria-current="page"`, which is what makes the state available to a screen reader without relying
 * on the fill colour.
 */
export function FilterTabs({
  label,
  active,
  options,
}: {
  label: string;
  active: string;
  options: readonly FilterTabOption[];
}) {
  return (
    <div className={styles.filterTabs} role="group" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          className={active === option.value ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
          aria-current={active === option.value ? 'page' : undefined}
        >
          {option.label}
          {option.count !== undefined && <span className={styles.filterCount}>{option.count}</span>}
        </Link>
      ))}
    </div>
  );
}
