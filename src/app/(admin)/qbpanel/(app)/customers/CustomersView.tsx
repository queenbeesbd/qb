'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { buildQueryHref } from '@/lib/qbpanel-query';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill } from '../../_ui/StatusPill';
import styles from '../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type CustomerRow = {
  customerId: number;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: string;
  createdAt: string;
  orderCount: number;
  lastOrderAt: string | null;
  flagged: boolean;
  /** The reason the latest suspension recorded; null for an active account or one never suspended. */
  suspendedReason: string | null;
  suspendedAt: string | null;
};

export type CustomerNotice = 'suspended' | 'restored' | 'denied' | 'conflict' | 'invalid';

/** The list's standing filter. `flagged` is a raised review flag, not a third status. */
export type CustomerFilter = 'all' | 'active' | 'suspended' | 'flagged';

const NOTICE_KEYS: Record<CustomerNotice, TranslationKey> = {
  suspended: 'admin.customers.notice.suspended',
  restored: 'admin.customers.notice.restored',
  denied: 'admin.customers.notice.denied',
  conflict: 'admin.customers.notice.conflict',
  invalid: 'admin.customers.notice.invalid',
};

const FILTER_KEYS: Record<CustomerFilter, TranslationKey> = {
  all: 'admin.customers.filter.all',
  active: 'admin.customers.filter.active',
  suspended: 'admin.customers.filter.suspended',
  flagged: 'admin.customers.filter.flagged',
};

/**
 * The avatar is a monogram, never a photograph: a customer account has no image, and two letters are
 * what makes a column of accounts scannable. The display name gives the initials; an account without
 * one falls back to the start of the phone number or the email, which are the only identifiers the
 * list holds.
 */
function monogram(row: CustomerRow): string {
  const name = row.displayName?.trim() ?? '';
  if (name !== '') {
    const words = name.split(/\s+/).filter((word) => word !== '');
    const first = words[0] ?? '';
    const second = words[1] ?? '';
    const letters = second === '' ? first.slice(0, 2) : first.slice(0, 1) + second.slice(0, 1);
    return letters === '' ? '?' : letters.toUpperCase();
  }
  const fallback = (row.phone ?? row.email ?? '').slice(0, 2).toUpperCase();
  return fallback === '' ? '?' : fallback;
}

/**
 * The one line that names the account.
 *
 * A phone-first account may hold only a number, and the list used to print that number twice - once as
 * the row's title and once in its metadata - because the title fell back to the identifier while the
 * metadata printed both identifiers unconditionally. The title is the name when there is one, otherwise
 * the identifier itself; and the metadata then omits whichever identifier the title already states, so
 * no row repeats itself.
 */
function identity(row: CustomerRow): { title: string; identifiers: string[] } {
  const name = row.displayName?.trim() ?? '';
  const identifiers = [row.phone, row.email].filter((value): value is string => value !== null && value !== '');
  if (name !== '') return { title: name, identifiers };
  const [first, ...rest] = identifiers;
  return { title: first ?? '?', identifiers: rest };
}

/** "3 days ago" for a recent order, the date for an older one, "Never" when there is none. */
function lastOrderLabel(row: CustomerRow, t: (key: TranslationKey, values?: Record<string, string | number>) => string): string {
  if (row.lastOrderAt === null) return t('admin.customers.neverOrdered');
  return `${t('admin.customers.lastOrdered')} ${new Intl.DateTimeFormat(INTL_LOCALE, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(row.lastOrderAt))}`;
}

/**
 * Customer moderation, phone-first.
 *
 * The page exists for two jobs, in this order: **find an account**, and **act on its standing**. It is
 * not a CRM and not a role surface (D10), so nothing else is offered here.
 *
 * Three composition decisions, each from a measured defect rather than a preference:
 *
 * - **A row is one line on a phone.** It was 180px tall - a 92px identity block, a status pill and a
 *   full-width action row underneath - so three accounts filled a 844px screen. The identity and its
 *   identifiers wrap on the left; the standing and the money sit on the right; the reasoned control
 *   is a 40px icon-sized trigger in that right column. It is 80px, and five accounts fit.
 * - **Standing is a filter, not a sentence to scan.** All / Active / Suspended / Flagged are links with
 *   their own counts, so a suspended account is found by asking for suspended ones instead of reading
 *   every row. A flag is a review flag that blocks nothing (D20) and the copy says so.
 * - **The suspension explanation lives in the dialog, not under the title.** The page header carried
 *   one sentence of policy at the top of every visit; the dialog that asks for the decision states the
 *   same consequence where the decision is actually made.
 *
 * Each row is one whole-row overlay anchor with its reasoned controls raised above it, the pattern
 * every admin list uses. The forms are siblings of the anchor, never children, so each keeps its own
 * activation and its own dialog's focus trap.
 */
export function CustomersView({
  rows,
  notice,
  csrfToken,
  canSuspend,
  search,
  query,
  clearHref,
  total,
  page,
  pageCount,
  shown,
  size,
  defaultSize,
  filter,
  counts,
}: {
  rows: readonly CustomerRow[];
  notice: CustomerNotice | null;
  csrfToken: string;
  canSuspend: boolean;
  search: string;
  /** The filter and size in force, for every link this page builds. */
  query: { readonly q: string; readonly filter: string; readonly size: string };
  /** The unfiltered list, so "Clear" resets the search and keeps a non-default page size. */
  clearHref: string;
  total: number;
  page: number;
  pageCount: number;
  shown: number;
  size: number;
  defaultSize: number;
  filter: CustomerFilter;
  counts: Record<CustomerFilter, number>;
}) {
  const { t } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });
  const filtered = search !== '' || filter !== 'all';

  /** Every link keeps the search and the size, changes one thing, and drops the page number. */
  const href = (next: { q?: string; filter?: CustomerFilter }): string =>
    buildQueryHref('/qbpanel/customers', {
      q: next.q ?? query.q,
      filter: (next.filter ?? (filter === 'all' ? '' : filter)) as string,
      size: query.size,
    });

  return (
    <>
      <PageHeader title={t('admin.customers.title')} />

      {notice !== null && (
        <Notice tone={notice === 'suspended' ? 'success' : 'error'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <ListToolbar>
        <FilterTabs
          label={t('admin.customers.filterLabel')}
          active={filter}
          options={(Object.keys(FILTER_KEYS) as CustomerFilter[]).map((key) => ({
            value: key,
            label: t(FILTER_KEYS[key]),
            href: href({ filter: key === 'all' ? 'all' : key }),
            count: counts[key],
          }))}
        />

        <ListSearch
          action="/qbpanel/customers"
          id="customer-search"
          label={t('admin.customers.searchLabel')}
          placeholder={t('admin.customers.searchPlaceholder')}
          value={search}
          hidden={{
            filter: filter === 'all' ? '' : filter,
            size: size === defaultSize ? '' : String(size),
          }}
          clearHref={clearHref}
          dirty={search !== ''}
        />
      </ListToolbar>

      {/*
        One sentence, and only where it prevents a wrong reading: a review flag is not a suspension and
        blocks nothing (D20). It sits under the filter because that is where the word appears, and it is
        omitted on the flagged view itself - there the rows state the fact directly.
      */}
      {counts.flagged > 0 && filter !== 'flagged' && rows.length > 0 && (
        <p className={styles.toolbarMeta}>{t('admin.customers.flagCaveat', { count: counts.flagged })}</p>
      )}

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon="search"
            title={search === '' ? t('admin.customers.filterEmptyTitle') : t('admin.customers.searchEmptyTitle')}
            body={
              search === ''
                ? t('admin.customers.filterEmptyBody', { filter: t(FILTER_KEYS[filter]).toLowerCase() })
                : t('admin.customers.searchEmptyBody')
            }
            action={
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href="/qbpanel/customers"
              >
                {t('admin.customers.showAll')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.customers.emptyTitle')} body={t('admin.customers.emptyBody')} icon="customers" />
        )
      ) : (
        <>
          <ul className={styles.recordList} data-admin-list="">
            {rows.map((row) => {
              const active = row.status === 'active';
              const { title, identifiers } = identity(row);
              return (
                <li
                  className={`${styles.record} ${styles.recordCustomer} ${styles.recordWithOverlay}`}
                  key={row.customerId}
                >
                  <Link
                    aria-label={`${t('admin.customers.view')} ${title}`}
                    className={styles.recordOverlay}
                    href={`/qbpanel/customers/${row.customerId}`}
                  />
                  <span className={styles.recordThumb} aria-hidden="true">
                    {monogram(row)}
                  </span>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>{title}</span>
                    <span className={styles.recordMeta}>
                      {identifiers.map((identifier) => (
                        <span key={identifier}>{identifier}</span>
                      ))}
                      <span>{lastOrderLabel(row, t)}</span>
                    </span>
                  </div>
                  <div className={styles.recordSide}>
                    <span className={styles.customerStanding}>
                      <StatusPill tone={active ? 'success' : 'danger'}>
                        {active ? t('admin.customers.active') : t('admin.customers.suspended')}
                      </StatusPill>
                      {row.flagged && <StatusPill tone="warning">{t('admin.customers.flagged')}</StatusPill>}
                    </span>
                    <div className={`${styles.recordActions} ${styles.recordRaised}`}>
                      {canSuspend && active && (
                        <ConfirmSubmit
                          action="/api/qbpanel/customers"
                          csrfToken={csrfToken}
                          fields={{ customerId: row.customerId, operation: 'ban', returnTo: '/qbpanel/customers' }}
                          triggerLabel={t('admin.customers.suspend')}
                          small
                          title={t('admin.customers.suspendTitle')}
                          body={t('admin.customers.suspendBody')}
                          confirmLabel={t('admin.customers.suspend')}
                          cancelLabel={t('admin.common.cancel')}
                          pendingLabel={t('admin.common.working')}
                          reason={{
                            label: t('admin.customers.reasonLabel'),
                            placeholder: t('admin.customers.reasonPlaceholder'),
                            minLength: 10,
                            maxLength: 500,
                            required: true,
                          }}
                        />
                      )}
                      {canSuspend && !active && (
                        <ConfirmSubmit
                          action="/api/qbpanel/customers"
                          csrfToken={csrfToken}
                          fields={{ customerId: row.customerId, operation: 'restore', returnTo: '/qbpanel/customers' }}
                          triggerLabel={t('admin.customers.restore')}
                          triggerVariant="secondary"
                          small
                          title={t('admin.customers.restoreTitle')}
                          body={t('admin.customers.restoreBody')}
                          confirmLabel={t('admin.customers.restore')}
                          cancelLabel={t('admin.common.cancel')}
                          pendingLabel={t('admin.common.working')}
                          reason={{
                            label: t('admin.customers.reasonLabel'),
                            placeholder: t('admin.customers.restoreReasonPlaceholder'),
                            minLength: 10,
                            maxLength: 500,
                            required: true,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  {/*
                    Why the account stands as it does (intent critique, 2026-11-21). A suspended row
                    said "Suspended" and asked for an irreversible restore with no memory of the
                    finding; the reason was only on the audit screen. It is the same record the
                    suspension wrote, read for its own row, on a line of its own - reading it inside the
                    identity column wrapped a sentence into a 197px slot and tripled the row's height.
                  */}
                  {!active && row.suspendedReason !== null && (
                    <span className={styles.customerReason}>
                      {t('admin.customers.suspendedWhy', {
                        reason: row.suspendedReason,
                        date:
                          row.suspendedAt === null ? '' : dateFormat.format(new Date(row.suspendedAt)),
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <Pagination
            basePath="/qbpanel/customers"
            query={query}
            page={page}
            pageCount={pageCount}
            shown={shown}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        </>
      )}
    </>
  );
}