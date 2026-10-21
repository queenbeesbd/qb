'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
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
 * hand when a customer calls - order number, name, phone - and filterable by the states the current
 * model actually uses. Rows link to the order detail, which is the only place an action is offered.
 *
 * The count line is not decoration: it is how the owner knows a list is a page rather than the whole
 * table, so "not found" never means "not on this page".
 */
export function AdminOrdersView({
  rows,
  search,
  filter,
  total,
  page,
  pageCount,
  shown,
}: {
  rows: readonly AdminOrderListRow[];
  search: string;
  filter: OrdersFilter;
  total: number;
  page: number;
  pageCount: number;
  shown: number;
}) {
  const { t, price } = useTranslation();
  const when = (iso: string): string =>
    new Intl.DateTimeFormat(INTL_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const filterHref = (next: OrdersFilter): string => {
    const params = new URLSearchParams();
    if (next !== 'all') params.set('filter', next);
    if (search !== '') params.set('q', search);
    const query = params.toString();
    return query === '' ? '/admin/orders' : `/admin/orders?${query}`;
  };

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.commerce')}
        title={t('admin.orders.title')}
        description={t('admin.orders.body')}
      />

      <div className={styles.toolbar}>
        <div className={styles.filterTabs} role="group" aria-label={t('admin.orders.filterLabel')}>
          {(Object.keys(FILTER_KEYS) as OrdersFilter[]).map((key) => (
            <Link
              key={key}
              href={filterHref(key)}
              className={filter === key ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
              aria-current={filter === key ? 'page' : undefined}
            >
              {t(FILTER_KEYS[key])}
            </Link>
          ))}
        </div>

        <form className={styles.searchForm} action="/admin/orders" method="get" role="search">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <div className={styles.searchField}>
            <label className="sr-only" htmlFor="orders-search">
              {t('admin.orders.searchLabel')}
            </label>
            <input
              id="orders-search"
              className={styles.input}
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t('admin.orders.searchPlaceholder')}
              maxLength={80}
            />
          </div>
          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
            {t('admin.common.search')}
          </button>
          {(search !== '' || filter !== 'all') && (
            <Link className={styles.recordLink} href="/admin/orders">
              {t('admin.common.clear')}
            </Link>
          )}
        </form>
        <span className={styles.toolbarMeta}>{t('admin.orders.resultCount', { count: total })}</span>
      </div>

      {rows.length === 0 ? (
        search !== '' || filter !== 'all' ? (
          <EmptyState
            icon="search"
            title={t('admin.orders.searchEmptyTitle')}
            body={t('admin.orders.searchEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/admin/orders">
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.orders.emptyTitle')} body={t('admin.orders.emptyBody')} icon="orders" />
        )
      ) : (
        <>
          <ul className={styles.recordList}>
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
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <StatusPill tone={tone(row.status)}>{t(statusLabel(row.status))}</StatusPill>
                  <span className={styles.recordMeta}>
                    {t(paymentLabel(row.paymentMethod, '', row.codState))}
                  </span>
                  <span className={styles.recordPrice}>{price(row.totalMinor)}</span>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            basePath="/admin/orders"
            query={{ q: search, filter: filter === 'all' ? '' : filter }}
            page={page}
            pageCount={pageCount}
            shown={shown}
            total={total}
          />
        </>
      )}
    </>
  );
}
