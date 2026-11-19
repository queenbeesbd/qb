'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { buildQueryHref } from '@/lib/qbpanel-query';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { CodOrderCard, type CodOrderRow } from '../../_ui/CodOrderCard';
import { ActiveFilters, DateRangeFilter } from '../../_ui/ListFilters';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { EmptyState } from '../../_ui/EmptyState';
import { ItemPhoto } from '../../_ui/ItemPhoto';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill, type PillTone } from '../../_ui/StatusPill';
import styles from '../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

/** The lifecycle status filter. It applies to the full history; a waiting order is waiting. */
export type OrdersFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned';

/** The screen's discriminator: the whole history, or one of the two COD worklists. */
export type OrdersView = 'all' | 'waiting' | 'decided';

export type OrdersNotice =
  | 'approved'
  | 'approvedBooked'
  | 'approvedBookingFailed'
  | 'rejected'
  | 'denied'
  | 'conflict'
  | 'invalid';

const FILTER_KEYS: Record<OrdersFilter, TranslationKey> = {
  all: 'admin.orders.filter.all',
  pending: 'admin.orders.filter.pending',
  confirmed: 'admin.orders.filter.confirmed',
  shipped: 'admin.orders.filter.shipped',
  delivered: 'admin.orders.filter.delivered',
  completed: 'admin.orders.filter.completed',
  cancelled: 'admin.orders.filter.cancelled',
  returned: 'admin.orders.filter.returned',
};

const NOTICE_KEYS: Record<OrdersNotice, TranslationKey> = {
  approved: 'admin.cod.notice.approved',
  approvedBooked: 'admin.cod.notice.approvedBooked',
  approvedBookingFailed: 'admin.cod.notice.approvedBookingFailed',
  rejected: 'admin.cod.notice.rejected',
  denied: 'admin.cod.notice.denied',
  conflict: 'admin.cod.notice.conflict',
  invalid: 'admin.cod.notice.invalid',
};

const ERROR_NOTICES: readonly OrdersNotice[] = ['denied', 'conflict', 'invalid', 'approvedBookingFailed'];

export type AdminOrderListRow = {
  orderNumber: string;
  placedAt: string;
  status: string;
  codState: string;
  paymentMethod: string;
  recipientName: string;
  recipientPhone: string;
  districtCode: string | null;
  totalMinor: number;
  shippingMinor: number;
  itemCount: number;
  firstItemImageKey: string | null;
  firstItemName: string;
};

/** A COD card row: the waiting worklist's shape, or the same row read-only once decided. */
export type AdminCodListRow = CodOrderRow & {
  decision?: 'approved' | 'rejected';
  decidedAt?: string;
};

/** The filter state a list link carries. `page` is deliberately absent: a filter change resets it. */
export type OrdersQuery = {
  view: string;
  q: string;
  filter: string;
  from: string;
  to: string;
  size: string;
};

function tone(status: string): PillTone {
  if (status === 'cancelled' || status === 'returned') return 'danger';
  if (status === 'pending') return 'warning';
  if (status === 'confirmed' || status === 'shipped') return 'info';
  return 'success';
}

/**
 * The orders screen: the full history and the COD worklist behind one set of filters.
 *
 * The history (`view=all`) is every order the store has ever taken, newest first, searchable by the
 * three things the owner has in hand when a customer calls - order number, name, phone - and
 * filterable by the states the current model actually uses. The worklist views show the COD orders
 * that are waiting on a call (`view=waiting`) or were decided today (`view=decided`) as full cards with
 * the decision inline, using the same guarded endpoint as before.
 *
 * Two rules are load-bearing:
 *
 * 1. **Every filter is a URL.** The tabs, the search and the date range are links and a real GET form,
 *    so the server applies them, the back button works and a filtered page is linkable.
 * 2. **The lifecycle statuses are always reachable.** They are a second tab row rather than a control
 *    hidden inside one view; choosing one returns to the history with that status applied, so a
 *    waiting order can always be followed to its record.
 *
 * The footer is the only place the list states its size. A count repeated in the header and the
 * toolbar is how a screen ends up showing three different totals.
 */
export function AdminOrdersView({
  view,
  historyRows,
  codRows,
  waitingCount,
  search,
  filter,
  from,
  to,
  notice,
  baseQuery,
  clearHref,
  total,
  page,
  pageCount,
  shown,
  size,
  defaultSize,
  nowIso,
  csrfToken,
  canApprove,
  canCancel,
}: {
  view: OrdersView;
  historyRows: readonly AdminOrderListRow[];
  codRows: readonly AdminCodListRow[];
  waitingCount: number;
  search: string;
  filter: OrdersFilter;
  from: string;
  to: string;
  notice: OrdersNotice | null;
  baseQuery: OrdersQuery;
  clearHref: string;
  total: number;
  page: number;
  pageCount: number;
  shown: number;
  size: number;
  defaultSize: number;
  nowIso: string;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const { t, price } = useTranslation();
  const when = (iso: string): string =>
    new Intl.DateTimeFormat(INTL_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const href = (next: Partial<OrdersQuery>): string => buildQueryHref('/qbpanel/orders', { ...baseQuery, ...next });
  const dated = from !== '' || to !== '';
  const history = view === 'all';
  // The status filter and the date range narrow the record, not a worklist: a waiting order is waiting
  // and was placed when it was placed. Their values are still carried on the view links so returning
  // to the history finds it exactly as it was left.
  const filtering = search !== '' || (history && (filter !== 'all' || dated));
  const rows = history ? historyRows : codRows;
  const sizeParam = size === defaultSize ? '' : String(size);

  return (
    <>
      <PageHeader title={t('admin.orders.title')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <ListToolbar>
        <FilterTabs
          label={t('admin.cod.filterLabel')}
          active={view}
          options={[
            { value: 'all', label: t('admin.nav.orders'), href: href({ view: '', filter: '' }) },
            {
              value: 'waiting',
              label: t('admin.cod.tabWaiting'),
              href: href({ view: 'waiting' }),
              count: waitingCount,
            },
            { value: 'decided', label: t('admin.cod.tabDecided'), href: href({ view: 'decided' }) },
          ]}
        />

        <FilterTabs
          label={t('admin.orders.filterLabel')}
          active={history ? filter : ''}
          options={(Object.keys(FILTER_KEYS) as OrdersFilter[]).map((key) => ({
            value: key,
            label: t(FILTER_KEYS[key]),
            // Any status belongs to the record, so choosing one leaves a worklist for the history.
            href: href({ view: '', filter: key === 'all' ? '' : key }),
          }))}
        />

        <ListSearch
          action="/qbpanel/orders"
          id="orders-search"
          label={t('admin.orders.searchLabel')}
          placeholder={t('admin.orders.searchPlaceholder')}
          value={search}
          hidden={{
            view: view === 'all' ? '' : view,
            filter: history && filter !== 'all' ? filter : '',
            from: history ? from : '',
            to: history ? to : '',
            size: sizeParam,
          }}
          clearHref={clearHref}
          dirty={filtering}
        />

        {history && (
          <DateRangeFilter
            action="/qbpanel/orders"
            idPrefix="orders"
            label={t('admin.common.dateRangeLabel')}
            from={from}
            to={to}
            hidden={{
              q: search,
              filter: filter === 'all' ? '' : filter,
              size: sizeParam,
            }}
            clearHref={href({ from: '', to: '' })}
          />
        )}
      </ListToolbar>

      <ActiveFilters
        label={t('admin.common.activeFilters')}
        clearAllHref={clearHref}
        chips={[
          ...(search === ''
            ? []
            : [
                {
                  key: 'q',
                  text: t('admin.common.chipSearch', { query: search }),
                  removeHref: href({ q: '' }),
                },
              ]),
          ...(history && filter !== 'all'
            ? [
                {
                  key: 'filter',
                  text: t(FILTER_KEYS[filter]),
                  removeHref: href({ filter: '' }),
                },
              ]
            : []),
          ...(history && dated
            ? [
                {
                  key: 'dates',
                  text:
                    from !== '' && to !== ''
                      ? t('admin.common.chipDates', { from, to })
                      : from !== ''
                        ? t('admin.common.chipSince', { from })
                        : t('admin.common.chipUntil', { to }),
                  removeHref: href({ from: '', to: '' }),
                },
              ]
            : []),
        ]}
      />

      {rows.length === 0 ? (
        search !== '' ? (
          <EmptyState
            icon="search"
            title={t(history ? 'admin.orders.searchEmptyTitle' : 'admin.cod.searchEmptyTitle')}
            body={t(history ? 'admin.orders.searchEmptyBody' : 'admin.cod.searchEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : view === 'decided' ? (
          <EmptyState title={t('admin.cod.decidedEmptyTitle')} body={t('admin.cod.decidedEmptyBody')} icon="orders" />
        ) : view === 'waiting' ? (
          <EmptyState title={t('admin.cod.emptyTitle')} body={t('admin.cod.emptyBody')} icon="orders" />
        ) : (
          <EmptyState title={t('admin.orders.emptyTitle')} body={t('admin.orders.emptyBody')} icon="orders" />
        )
      ) : history ? (
        <>
          <ul className={styles.recordList} data-admin-list="">
            {historyRows.map((row) => (
              <li className={styles.record} key={row.orderNumber} style={{ position: 'relative' }}>
                <Link
                  aria-label={`${t('admin.cod.viewOrder')} ${row.orderNumber}`}
                  href={`/qbpanel/orders/${encodeURIComponent(row.orderNumber)}?from=orders`}
                  style={{ position: 'absolute', inset: 0, zIndex: 0, outlineOffset: '-2px' }}
                />
                {/*
                  The recorded first line, drawn above the stretched link because the photograph is a
                  `<button>` that enlarges the picture - two controls cannot be the same tap target.
                  It is the existing `ItemPhoto`, so the history, the worklist and the detail all read
                  a snapshot the same way, and a line that stored none draws no tile.
                */}
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
                  <ItemPhoto imageKey={row.firstItemImageKey} name={row.firstItemName} size="compact" />
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>
                    <span className={styles.mono}>{row.orderNumber}</span>
                  </span>
                  <span className={styles.recordMeta}>
                    <span>{when(row.placedAt)}</span>
                    <span>
                      {row.recipientName} ·{' '}
                      <a
                        href={`tel:${row.recipientPhone}`}
                        style={{ position: 'relative', zIndex: 1 }}
                      >
                        {row.recipientPhone}
                      </a>
                    </span>
                    <span>
                      {row.districtCode === null ? t('orders.deliveryPending') : deliveryAreaName(row.districtCode)}
                    </span>
                    <span>{t('admin.orders.itemCountValue', { count: row.itemCount })}</span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <StatusPill tone={tone(row.status)}>{t(statusLabel(row.status))}</StatusPill>
                  <span className={styles.recordMeta}>
                    {t(paymentLabel(row.paymentMethod, '', row.codState))}
                  </span>
                  <span className={styles.recordAmount}>
                    <span className={styles.recordPrice}>{price(row.totalMinor)}</span>
                    {/*
                      The delivery charge is the snapshot the order was placed with (ADR 0016). It is
                      shown as a sub-line of the total, never added to it - the total already contains
                      it, and a second sum would misstate what the customer owes.
                    */}
                    <span className={styles.recordMeta}>
                      {t('admin.orders.deliveryLine', { amount: price(row.shippingMinor) })}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            basePath="/qbpanel/orders"
            query={{
              q: search,
              filter: filter === 'all' ? '' : filter,
              from,
              to,
              size: sizeParam,
            }}
            page={page}
            pageCount={pageCount}
            shown={shown}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        </>
      ) : (
        <>
          <div className={styles.worklist} data-admin-cod-list="">
            {codRows.map((row) =>
              row.decision !== undefined && row.decidedAt !== undefined ? (
                <CodOrderCard
                  key={row.orderId}
                  nowIso={nowIso}
                  row={row}
                  csrfToken={csrfToken}
                  canApprove={canApprove}
                  canCancel={canCancel}
                  decided={{ decision: row.decision, decidedAt: row.decidedAt }}
                />
              ) : (
                <CodOrderCard
                  key={row.orderId}
                  nowIso={nowIso}
                  row={row}
                  csrfToken={csrfToken}
                  canApprove={canApprove}
                  canCancel={canCancel}
                />
              ),
            )}
          </div>
          <Pagination
            basePath="/qbpanel/orders"
            query={{ q: search, view, from, to, size: sizeParam }}
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
