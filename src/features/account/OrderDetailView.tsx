'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAreaName } from '@/lib/delivery-areas';
import type { Locale } from '@/lib/types';
import { ClearCart } from '@/features/checkout/ClearCart';
import { methodLabel, paymentLabel, statusLabel } from './order-labels';
import styles from '@/app/account.module.css';

function formatWhen(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export type OrderDetail = {
  orderNumber: string;
  status: string;
  paymentState: string;
  codState: string;
  paymentMethod: string;
  totalMinor: number;
  itemsSubtotalMinor: number;
  shippingMinor: number;
  placedAt: string;
  recipientName: string;
  districtCode: string | null;
  recipientPhone: string;
  addressLine: string;
  area: string;
  city: string;
  postcode: string | null;
  deliveryNote: string | null;
  items: readonly {
    name: string;
    sku: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }[];
};

/**
 * One of the customer's own orders.
 *
 * The page is only reachable by the customer who owns the order: the query filters on the session's
 * `customer_id`, so another customer's order number yields the not-found surface - there is no 403 that
 * would confirm the order exists.
 *
 * On a fresh placement (`placed`) it clears the browser cart, and only then: revisiting an older order
 * must never wipe a cart that belongs to a new one.
 */
export function OrderDetailView({ order, placed }: { order: OrderDetail; placed: boolean }) {
  const { t, price, locale } = useTranslation();

  return (
    <div className={styles.page}>
      {placed && <ClearCart />}

      {placed && (
        <section className={styles.placed} role="status">
          <h1>{t('orders.placedTitle')}</h1>
          <p>{t('orders.placedBody')}</p>
        </section>
      )}

      <header className={styles.header}>
        {!placed && <h1>{t('orders.title')}</h1>}
        <p className={styles.orderNumber}>
          {t('orders.orderNumber')} <strong>{order.orderNumber}</strong>
        </p>
        <p className={styles.muted}>{formatWhen(order.placedAt, locale)}</p>
      </header>

      <section className={styles.card} aria-labelledby="order-status">
        <h2 id="order-status">{t('orders.status')}</h2>
        <dl className={styles.facts}>
          <div>
            <dt>{t('orders.status')}</dt>
            <dd>{t(statusLabel(order.status))}</dd>
          </div>
          <div>
            <dt>{t('orders.method')}</dt>
            <dd>{t(methodLabel(order.paymentMethod))}</dd>
          </div>
          <div>
            <dt>{t('orders.payment')}</dt>
            <dd>{t(paymentLabel(order.paymentMethod, order.paymentState, order.codState))}</dd>
          </div>
        </dl>
        <p className={styles.muted}>
          {order.paymentMethod === 'cod' ? t('orders.codNote') : t('orders.legacyPaymentNote')}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="order-items">
        <h2 id="order-items">{t('orders.itemsTitle')}</h2>
        <ul className={styles.itemList}>
          {order.items.map((item, index) => (
            <li key={`${item.sku}-${index}`} className={styles.itemRow}>
              <div className={styles.itemBody}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={styles.itemMeta}>
                  {item.sku} · {price(item.unitPriceMinor)} × {item.quantity}
                </span>
              </div>
              <span className={styles.itemTotal}>{price(item.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>{t('cart.subtotal')}</dt>
            <dd>{price(order.itemsSubtotalMinor)}</dd>
          </div>
          <div>
            <dt>{t('cart.delivery')}</dt>
            <dd className={order.districtCode === null ? styles.muted : undefined}>
              {order.districtCode === null
                ? t('orders.deliveryPending')
                : price(order.shippingMinor)}
            </dd>
          </div>
          <div className={styles.totalRow}>
            <dt>{t('orders.total')}</dt>
            <dd>{price(order.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="order-contact">
        <h2 id="order-contact">{t('orders.contactTitle')}</h2>
        <p>{order.recipientName}</p>
        <p className={styles.muted}>{order.recipientPhone}</p>
        <p className={styles.muted}>
          {order.addressLine}
          {order.districtCode === null ? '' : `, ${deliveryAreaName(order.districtCode, locale)}`}, {order.area},{' '}
          {order.city}
          {order.postcode ? ` ${order.postcode}` : ''}
        </p>
        {order.deliveryNote && <p className={styles.muted}>{order.deliveryNote}</p>}
      </section>

      <div className={styles.actions}>
        <Link className={styles.secondaryAction} href="/account/orders">
          {t('orders.backToOrders')}
        </Link>
        <Link className={styles.primaryAction} href="/products">
          {t('cart.continueShopping')}
        </Link>
      </div>
    </div>
  );
}
