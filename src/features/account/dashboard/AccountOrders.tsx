'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account-dashboard.module.css';
import { ORDER_GROUPS, type OrderGroup } from './groups';
import { OrderRow } from './OrderRow';
import type { DashboardOrder } from './types';

/**
 * Every order on the account, newest first, grouped by where it stands.
 *
 * **The screen's one question** is "what did I order and which of it is still coming?" - answered by
 * the rows, with the four counts above them acting as the filter. The counts are computed from the
 * same rows the list draws, so a count and the rows behind it cannot disagree.
 */
export function AccountOrders({
  orders,
  group,
}: {
  orders: readonly DashboardOrder[];
  group: OrderGroup;
}) {
  const { t } = useTranslation();

  const active = ORDER_GROUPS.find((entry) => entry.id === group) ?? ORDER_GROUPS[0];
  const shown = orders.filter((order) => active.match(order));

  return (
    <>
      <header className={styles.canvasHead}>
        <h1>{t('orders.title')}</h1>
        <p className={styles.canvasLead}>
          {orders.length === 0
            ? t('account.lead.noOrders')
            : t('account.ordersPage.lead', { count: orders.length })}
        </p>
      </header>

      <div className={styles.counts}>
        {ORDER_GROUPS.map((entry) => {
          const count = orders.filter((order) => entry.match(order)).length;
          const selected = entry.id === active.id;
          return (
            <Link
              key={entry.id}
              className={styles.count}
              href={entry.id === 'all' ? '/account/orders' : `/account/orders?state=${entry.id}`}
              data-active={selected ? 'true' : 'false'}
              aria-current={selected ? 'true' : undefined}
            >
              <span className={styles.countLabel}>{t(entry.label)}</span>
              <span className={styles.countValue}>{count}</span>
            </Link>
          );
        })}
      </div>

      <section className={styles.panel} aria-labelledby="orders-list">
        <div className={styles.panelHead}>
          <h2 id="orders-list" className={styles.panelTitle}>
            {t(active.label)}
          </h2>
          <p className={styles.panelMeta}>
            {t('account.ordersPage.showing', { count: shown.length })}
          </p>
        </div>
        {shown.length === 0 ? (
          <div className={styles.empty}>
            <p>{orders.length === 0 ? t('orders.empty') : t('account.filter.empty')}</p>
            {orders.length === 0 && (
              <Link className={styles.ghostButton} href="/products">
                {t('cart.continueShopping')}
              </Link>
            )}
          </div>
        ) : (
          <ul className={styles.rows}>
            {shown.map((order) => (
              <OrderRow key={order.orderNumber} order={order} showBreakdown />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
