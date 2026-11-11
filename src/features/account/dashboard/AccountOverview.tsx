'use client';

import Link from 'next/link';

import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { methodLabel, statusLabel } from '../order-labels';
import styles from '@/app/account-dashboard.module.css';
import { OrderRow, formatOrderWhen } from './OrderRow';
import { dueOnDeliveryMinor, orderProgress, recordedPaidMinor } from './progress';
import type { DashboardCustomer, DashboardOrder } from './types';

/**
 * The account home: where the newest order stands, what it will cost at the door, and how the account
 * itself is set up.
 *
 * **The screen's one question** is "where is my order, and what do I owe when it arrives?" - so the
 * newest order is the largest block and the money strip answers the second half. **The finding** is
 * the sentence under the title: a stored state in plain words, never a promise about a courier.
 *
 * Figures are derived from the rows on this page, so the strip can never disagree with the list: the
 * amount due is the sum of the totals of orders still open, and the paid figure is the sum of the
 * orders the shop has marked complete.
 *
 * An account with no orders states that once. Saying it three times - in the strip, the latest-order
 * panel and the recent list - was what the first build did, and it read as an empty template rather
 * than as a shop waiting for its first order.
 */
export function AccountOverview({
  customer,
  orders,
}: {
  customer: DashboardCustomer;
  orders: readonly DashboardOrder[];
}) {
  const { t, price } = useTranslation();

  const newest = orders[0];
  const progress = newest === undefined ? null : orderProgress(newest);
  const due = dueOnDeliveryMinor(orders);
  const paid = recordedPaidMinor(orders);
  const recent = orders.slice(0, 4);
  const memberSince =
    customer.memberSince === null
      ? null
      : new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'long' }).format(
          new Date(customer.memberSince),
        );

  const details = (
    <section className={styles.panel} aria-labelledby="account-details">
      <div className={styles.panelHead}>
        <h2 id="account-details" className={styles.panelTitle}>
          {t('account.details.title')}
        </h2>
      </div>
      <dl className={styles.facts}>
        {customer.displayName !== null && (
          <div>
            <dt>{t('account.displayName')}</dt>
            <dd>{customer.displayName}</dd>
          </div>
        )}
        {customer.phone !== null && (
          <div>
            <dt>{t('account.phone')}</dt>
            <dd>
              {customer.phone}
              {!customer.phoneVerified && (
                <span className={styles.factNote}> {t('account.phoneUnverifiedShort')}</span>
              )}
            </dd>
          </div>
        )}
        {customer.email !== null && (
          <div>
            <dt>{t('account.email')}</dt>
            <dd>
              {customer.email}
              {!customer.emailVerified && (
                <span className={styles.factNote}> {t('account.emailUnverifiedShort')}</span>
              )}
            </dd>
          </div>
        )}
        {memberSince !== null && (
          <div>
            <dt>{t('account.details.memberSince')}</dt>
            <dd>{memberSince}</dd>
          </div>
        )}
      </dl>
      <div className={styles.panelFoot}>
        <Link className={styles.panelLink} href="/account/security">
          {t('account.details.securityLink')}
        </Link>
      </div>
    </section>
  );

  return (
    <>
      <header className={styles.canvasHead}>
        <h1>{t('account.title')}</h1>
        {/*
          The finding, and nothing repeated: the order it describes is named by the panel directly
          below, so printing its number here as well spent a phone's first screen on the same 16
          characters twice.
        */}
        <p className={styles.canvasLead}>
          {newest === undefined || progress === null
            ? t('account.lead.noOrders')
            : t(progress.nextKey)}
        </p>
      </header>

      <div className={styles.strip}>
        <div className={styles.fact}>
          <p className={styles.factLabel}>{t('account.fact.orders')}</p>
          <p className={styles.factValue} data-zero={orders.length === 0 ? 'true' : 'false'}>
            {orders.length}
          </p>
          <p className={styles.factNote}>{t('account.fact.ordersNote')}</p>
        </div>
        <div className={styles.fact}>
          <p className={styles.factLabel}>{t('account.fact.due')}</p>
          <p className={styles.factValue} data-zero={due === 0 ? 'true' : 'false'}>
            {price(due)}
          </p>
          <p className={styles.factNote}>{t('account.fact.dueNote')}</p>
        </div>
        <div className={styles.fact}>
          <p className={styles.factLabel}>{t('account.fact.paid')}</p>
          <p className={styles.factValue} data-zero={paid === 0 ? 'true' : 'false'}>
            {price(paid)}
          </p>
          <p className={styles.factNote}>{t('account.fact.paidNote')}</p>
        </div>
      </div>

      {newest === undefined || progress === null ? (
        /* One statement of the empty state, with the way out of it, beside the account's own facts. */
        <div className={styles.pair}>
          <section className={styles.panel} aria-labelledby="account-first">
            <div className={styles.panelHead}>
              <h2 id="account-first" className={styles.panelTitle}>
                {t('account.empty.title')}
              </h2>
            </div>
            <p className={styles.panelMeta}>{t('account.empty.body')}</p>
            <div>
              <Link className={styles.ghostButton} href="/products">
                {t('cart.continueShopping')}
              </Link>
            </div>
          </section>
          {details}
        </div>
      ) : (
        <>
          <div className={styles.pair}>
            <section className={styles.panel} aria-labelledby="account-current">
              <div className={styles.panelHead}>
                <h2 id="account-current" className={styles.panelTitle}>
                  {t('account.current.title')}
                </h2>
              </div>

              <div className={styles.orderTop}>
                <div>
                  <p className={styles.orderNumber}>{newest.orderNumber}</p>
                  <p className={styles.orderWhen}>
                    {t('orders.placedAt')} {formatOrderWhen(newest.placedAt)} ·{' '}
                    {t(statusLabel(newest.status))}
                  </p>
                </div>
                <div className={styles.orderAmount}>
                  <span className={styles.orderAmountValue}>{price(newest.totalMinor)}</span>
                  <span className={styles.orderAmountLabel}>
                    {newest.status === 'completed'
                      ? t('account.current.paidLabel')
                      : t('account.current.amountLabel')}
                  </span>
                </div>
              </div>

              {/*
                The track is drawn only for an order that can still move. A cancelled or returned order
                has no next step, and drawing four grey marks under it would imply one exists.
              */}
              {!progress.terminal && (
                <ol className={styles.steps} aria-label={t('account.track.label')}>
                  {progress.steps.map((step) => (
                    <li key={step.key} className={styles.step} data-state={step.state}>
                      <span className={styles.stepDot} aria-hidden="true" />
                      <p className={styles.stepLabel}>{t(step.key)}</p>
                    </li>
                  ))}
                </ol>
              )}

              {/*
                The three stored facts the panel exists to state, after where the parcel is: where it is
                going, what it holds and how it is paid. They are the values the receipt prints, so the
                two screens cannot disagree.
              */}
              <dl className={styles.orderFacts}>
                <div>
                  <dt>{t('account.current.delivery')}</dt>
                  <dd>
                    {newest.districtCode === null
                      ? t('orders.deliveryPending')
                      : deliveryAreaName(newest.districtCode)}
                  </dd>
                </div>
                <div>
                  <dt>{t('account.current.items')}</dt>
                  <dd>
                    {t(newest.itemCount === 1 ? 'account.itemsCountOne' : 'account.itemsCount', {
                      count: newest.itemCount,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t('account.current.payment')}</dt>
                  <dd>{t(methodLabel(newest.paymentMethod))}</dd>
                </div>
              </dl>

              {/* The panel's one action, pinned to its foot: the card is as tall as the one beside it. */}
              <div className={styles.panelFoot}>
                <Link className={styles.panelLink} href={`/orders/${newest.orderNumber}`}>
                  {t('account.current.view')}
                </Link>
              </div>
            </section>

            {details}
          </div>

          <section className={styles.panel} aria-labelledby="account-recent">
            <div className={styles.panelHead}>
              <h2 id="account-recent" className={styles.panelTitle}>
                {t('account.recent.title')}
              </h2>
              <Link className={styles.panelLink} href="/account/orders">
                {t('account.recent.all')}
              </Link>
            </div>
            <ul className={styles.rows}>
              {recent.map((order) => (
                <OrderRow key={order.orderNumber} order={order} />
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
