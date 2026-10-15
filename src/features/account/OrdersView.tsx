'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { methodLabel, paymentLabel, statusLabel } from './order-labels';
import styles from '@/app/account.module.css';

export type OrderListItem = {
  orderNumber: string;
  status: string;
  paymentState: string;
  codState: string;
  paymentMethod: string;
  totalMinor: number;
  placedAt: string;
  itemCount: number;
};

/** The customer's own order list. Amounts and states are database facts; nothing here is derived. */
export function OrdersView({ orders }: { orders: readonly OrderListItem[] }) {
  const { t, price, locale } = useTranslation();
  const when = (iso: string): string =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  if (orders.length === 0) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>{t('orders.title')}</h1>
        </header>
        <div className={styles.card}>
          <p className={styles.muted}>{t('orders.empty')}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/products">
              {t('cart.continueShopping')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('orders.title')}</h1>
      </header>
      <ul className={styles.orderList}>
        {orders.map((order) => (
          <li key={order.orderNumber} className={styles.orderRow}>
            <div className={styles.orderHead}>
              <Link className={styles.orderLink} href={`/account/orders/${order.orderNumber}`}>
                {order.orderNumber}
              </Link>
              <span className={styles.orderTotal}>{price(order.totalMinor)}</span>
            </div>
            <dl className={styles.orderMeta}>
              <div>
                <dt>{t('orders.placedAt')}</dt>
                <dd>{when(order.placedAt)}</dd>
              </div>
              <div>
                <dt>{t('orders.itemCount')}</dt>
                <dd>{order.itemCount}</dd>
              </div>
              <div>
                <dt>{t('orders.status')}</dt>
                <dd>{t(statusLabel(order.status))}</dd>
              </div>
              <div>
                <dt>{t('orders.payment')}</dt>
                <dd>{t(paymentLabel(order.paymentMethod, order.paymentState, order.codState))}</dd>
              </div>
              <div>
                <dt>{t('orders.method')}</dt>
                <dd>{t(methodLabel(order.paymentMethod))}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
