'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import styles from '../qbpanel.module.css';

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
 *
 * `live` turns it into a **search-as-you-type** field: a third of a second after typing stops, the
 * form's own values are written into the URL with `replace`, so the list narrows without pressing
 * Search. It is opt-in because each live search is a server render: the products list is the one that
 * benefits from it (the owner is looking for one row in a long catalog), while an order list is read
 * once rather than scanned. The button stays for Enter and for a browser without JavaScript.
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
  live,
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
  /** Narrow the list while typing. Off by default; see the note above. */
  live?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastSearchRef = useRef(value);

  useEffect(() => {
    lastSearchRef.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function schedule() {
    if (!live) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const form = formRef.current;
      if (!form) return;
      const params = new URLSearchParams();
      for (const [name, entry] of new FormData(form)) {
        if (typeof entry === 'string' && entry.trim() !== '') params.set(name, entry);
      }
      const term = params.get('q') ?? '';
      if (term === lastSearchRef.current) return;
      lastSearchRef.current = term;
      const search = params.toString();
      router.replace(search === '' ? action : `${action}?${search}`, { scroll: false });
    }, 300);
  }

  return (
    <form
      ref={formRef}
      className={styles.searchForm}
      action={action}
      method="get"
      role="search"
      onChange={schedule}
    >
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
  const activeOption = options.find((option) => option.value === active) ?? options[0];

  return (
    <>
      {/*
       * Two renderings of one filter, and only one of them is ever displayed.
       *
       * Above 720px the segmented row stays: it shows every option at once, which is what a wide screen
       * is for. Below 720px that row becomes a disclosure, because eight order statuses cannot be a
       * segmented control on a phone. It used to be a horizontal rail with an edge fade, which hid four
       * statuses behind a gesture nobody could see, never scrolled an active filter into view, and dimmed
       * the last reachable tab until it read as disabled - the owner's verdict was "hard to use".
       *
       * A disclosure answers all three: it costs one 40px row instead of three, the closed control names
       * the filter that is in force (so a filter can never be applied invisibly), and it opens into a
       * vertical list where every status is a 40px row - no gesture, no clipping, no stranded last chip.
       */}
      <div className={`${styles.filterTabs} ${styles.filterSegmented}`} role="group" aria-label={label}>
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

      <details className={styles.filterDisclosure}>
        <summary className={styles.filterSummary}>
          <span className={styles.filterSummaryLabel}>{label}</span>
          {activeOption !== undefined && <span className={styles.filterSummaryValue}>{activeOption.label}</span>}
        </summary>
        <div className={styles.filterList}>
          {options.map((option) => (
            <Link
              key={option.value}
              href={option.href}
              className={
                active === option.value ? `${styles.filterOption} ${styles.filterOptionActive}` : styles.filterOption
              }
              aria-current={active === option.value ? 'page' : undefined}
            >
              <span>{option.label}</span>
              {option.count !== undefined && <span className={styles.filterOptionCount}>{option.count}</span>}
            </Link>
          ))}
        </div>
      </details>
    </>
  );
}
