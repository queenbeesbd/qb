'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import styles from '../qbpanel.module.css';

/**
 * The date-range filter (Phase 30).
 *
 * Two native `type="date"` inputs in a `GET` form, so the range is applied **in SQL by the server**
 * and the result is a URL - never a client-side filter over one page of rows, which would quietly
 * report the wrong total for any list longer than a page.
 *
 * Deliberate choices:
 *
 * - The form carries the other active filters as hidden fields, so submitting a range does not drop
 *   the search or the status tab. It deliberately carries **no** page number, so a new range starts
 *   at page 1.
 * - Both dates are optional. One alone is a half-open range ("everything since", "everything up to"),
 *   which is what the fields actually say - the server applies exactly that.
 * - "Clear dates" only appears when a date is set, and it preserves the other filters.
 */
export function DateRangeFilter({
  action,
  idPrefix,
  from,
  to,
  hidden,
  clearHref,
  /** What the range is applied to, so the control says what it filters rather than "from/to". */
  label,
}: {
  action: string;
  idPrefix: string;
  from: string;
  to: string;
  hidden?: Readonly<Record<string, string | undefined>>;
  clearHref: string;
  label: string;
}) {
  const { t } = useTranslation();
  const active = from !== '' || to !== '';

  /*
   * A disclosure, not a row of controls.
   *
   * Two native date inputs plus a submit button took 263px of a 390px phone - a third of the screen
   * before a single order row, beside a status rail and a search field. Behind a control-sized summary
   * the toolbar stays one band, and the range is one tap away; the summary states the range when one
   * is applied, so a hidden filter can never be forgotten.
   */
  return (
    <details className={styles.dateDisclosure} data-active={active ? 'true' : undefined}>
      <summary className={styles.dateSummary}>
        {t('admin.common.dateRangeLabel')}
        {active ? `: ${from || '…'} – ${to || '…'}` : ''}
      </summary>
    <form className={styles.dateRange} action={action} method="get" role="group" aria-label={label}>
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value === undefined || value === '' ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      <div className={styles.dateField}>
        <label className={styles.dateLabel} htmlFor={`${idPrefix}-from`}>
          {t('admin.common.dateFrom')}
        </label>
        <input
          id={`${idPrefix}-from`}
          className={styles.input}
          type="date"
          name="from"
          defaultValue={from}
          max={to === '' ? undefined : to}
        />
      </div>
      <div className={styles.dateField}>
        <label className={styles.dateLabel} htmlFor={`${idPrefix}-to`}>
          {t('admin.common.dateTo')}
        </label>
        <input
          id={`${idPrefix}-to`}
          className={styles.input}
          type="date"
          name="to"
          defaultValue={to}
          min={from === '' ? undefined : from}
        />
      </div>
      <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
        {t('admin.common.applyDates')}
      </button>
      {active && (
        <Link className={styles.recordLink} href={clearHref}>
          {t('admin.common.clearDates')}
        </Link>
      )}
    </form>
    </details>
  );
}

/**
 * The chip row for filters that are currently applied.
 *
 * A filter that is in force but invisible is a filter the owner will forget, then misread the list
 * as "everything". Each chip names its own value and links to the list without it; "Clear all"
 * appears only when there is more than one thing to clear.
 */
export function ActiveFilters({
  label,
  chips,
  clearAllHref,
}: {
  label: string;
  chips: readonly { readonly key: string; readonly text: string; readonly removeHref: string }[];
  clearAllHref: string;
}) {
  const { t } = useTranslation();
  if (chips.length === 0) return null;

  return (
    <div className={styles.activeFilters} role="group" aria-label={label}>
      <span className={styles.activeFiltersLabel}>{t('admin.common.activeFilters')}</span>
      {chips.map((chip) => (
        <Link key={chip.key} className={styles.filterChip} href={chip.removeHref} data-admin-filter-chip="">
          <span>{chip.text}</span>
          <AdminIcon name="close" width={12} height={12} />
          <span className="sr-only">{t('admin.common.removeFilter')}</span>
        </Link>
      ))}
      {chips.length > 1 && (
        <Link className={styles.recordLink} href={clearAllHref}>
          {t('admin.common.clear')}
        </Link>
      )}
    </div>
  );
}
