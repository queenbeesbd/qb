'use client';

import Link from 'next/link';

import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { orderReceiptPath } from '@/lib/order-paths';
import { statusLabel } from '../order-labels';
import styles from '@/app/account-dashboard.module.css';
import type { DashboardOrder } from './types';

/** The one date format these screens print: a medium date and the time the order was placed. */
export function formatOrderWhen(iso: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * One order in a list.
 *
 * The row is a rule and an alignment, not a card: the number and the amount on one line, the stored
 * facts under it. Every value is a database fact - a state, a count, a frozen total - so two rows can
 * never disagree with the receipt each links to.
 */
export function OrderRow({
  order,
  showBreakdown = false,
}: {
  order: DashboardOrder;
  /** The full list adds what the order was made of; the overview's short list does not. */
  showBreakdown?: boolean;
}) {
  const { t, price } = useTranslation();

  return (
    <li className={styles.row}>
      <Link className={styles.rowLink} href={orderReceiptPath(order.orderNumber)}>
        {order.orderNumber}
      </Link>
      <span className={styles.rowAmount}>{price(order.totalMinor)}</span>
      <p className={styles.rowMeta}>
        <span>{formatOrderWhen(order.placedAt)}</span>
        <span>
          {t(order.itemCount === 1 ? 'account.itemsCountOne' : 'account.itemsCount', {
            count: order.itemCount,
          })}
        </span>
        <span className={styles.rowState}>{t(statusLabel(order.status))}</span>
        {showBreakdown && (
          <span>
            {t('cart.subtotal')} {price(order.itemsSubtotalMinor)} · {t('cart.delivery')}{' '}
            {order.districtCode === null ? t('orders.deliveryPending') : price(order.shippingMinor)}
          </span>
        )}
      </p>
    </li>
  );
}
