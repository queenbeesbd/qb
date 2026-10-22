'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { buildQueryHref } from '@/lib/admin-query';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { ActiveFilters, DateRangeFilter } from '../../_ui/ListFilters';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { EmptyState } from '../../_ui/EmptyState';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill, type PillTone } from '../../_ui/StatusPill';
import styles from '../../admin.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type OrdersFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned';

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
};

/** The filter state a list link carries. `page` is deliberately absent: a filter change resets it. */
export type OrdersQuery = {
  q: string;
  filter: string;
  from: string;
  to: string;
  size: number;
};

function tone(status: string): PillTone {
  if (status === 'cancelled' || status === 'returned') return 'danger';
  if (status === 'pending') return 'warning';
  if (status === 'confirmed' || status === 'shipped') return 'info';
  return 'success';
}

/**
 * The order history.
 *
 * Every order the store has ever taken, newest first, searchable by the three things the owner has in
 * hand when a customer calls - order number, name, phone - filterable by the states the current model
 * actually uses, and narrowable to a date range. Rows link to the order detail, which is the only
 * place an action is offered.
 *
 * The footer is the only place the list states its size. A count repeated in the header and the
 * toolbar is how a screen ends up showing three different totals.
 */
export function AdminOrdersView({
  rows,
  search,
  filter,
  from,
  to,
  baseQuery,
  clearHref,
  total,
  page,
  pageCount,
  shown,
  size,
  defaultSize,
}: {
  rows: readonly AdminOrderListRow[];
  search: string;
  filter: OrdersFilter;
  from: string;
  to: string;
  baseQuery: OrdersQuery;
  clearHref: string;
  total: number;
  page: number;
  pageCount: number;
  shown: number;
  size: number;
  defaultSize: number;
}) {
  const { t, price } = useTranslation();
  const when = (iso: string): string =>
    new Intl.DateTimeFormat(INTL_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const href = (next: Partial<OrdersQuery>): string => buildQueryHref('/admin/orders', { ...baseQuery, ...next });
  const dated = from !== '' || to !== '';
  const filtering = search !== '' || filter !== 'all' || dated;

  return (
    <>
      <PageHeader
        title={t('admin.orders.title')}
        description={t('admin.orders.body')}
      />

      <ListToolbar>
        <FilterTabs
          label={t('admin.orders.filterLabel')}
          active={filter}
          options={(Object.keys(FILTER_KEYS) as OrdersFilter[]).map((key) => ({
            value: key,
            label: t(FILTER_KEYS[key]),
            href: href({ filter: key === 'all' ? '' : key }),
          }))}
        />

        <ListSearch
          action="/admin/orders"
          id="orders-search"
          label={t('admin.orders.searchLabel')}
          placeholder={t('admin.orders.searchPlaceholder')}
          value={search}
          hidden={{ filter: filter === 'all' ? '' : filter, from, to, size: size === defaultSize ? '' : String(size) }}
          clearHref={clearHref}
          dirty={filtering}
        />

        <DateRangeFilter
          action="/admin/orders"
          idPrefix="orders"
          label={t('admin.common.dateRangeLabel')}
          from={from}
          to={to}
          hidden={{
            q: search,
            filter: filter === 'all' ? '' : filter,
            size: size === defaultSize ? '' : String(size),
          }}
          clearHref={href({ from: '', to: '' })}
        />
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
          ...(filter === 'all'
            ? []
            : [
                {
                  key: 'filter',
                  text: t(FILTER_KEYS[filter]),
                  removeHref: href({ filter: '' }),
                },
              ]),
          ...(dated
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
        filtering ? (
          <EmptyState
            icon="search"
            title={t('admin.orders.searchEmptyTitle')}
            body={t('admin.orders.searchEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.orders.emptyTitle')} body={t('admin.orders.emptyBody')} icon="orders" />
        )
      ) : (
        <>
          <ul className={styles.recordList} data-admin-list="">
            {rows.map((row) => (
              <li className={styles.record} key={row.orderNumber}>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>
                    <Link className={styles.recordLink} href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}>
                      <span className={styles.mono}>{row.orderNumber}</span>
                    </Link>
                  </span>
                  <span className={styles.recordMeta}>
                    <span>{when(row.placedAt)}</span>
                    <span>
                      {row.recipientName} · <a href={`tel:${row.recipientPhone}`}>{row.recipientPhone}</a>
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
            basePath="/admin/orders"
            query={{
              q: search,
              filter: filter === 'all' ? '' : filter,
              from,
              to,
              size: size === defaultSize ? '' : String(size),
            }}
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
