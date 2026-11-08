'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { orderDiscountMinor } from '@/lib/money';
import { ClearCart } from '@/features/checkout/ClearCart';
import { ContactLink } from '@/components/ContactLink';
import { methodLabel, paymentLabel, statusLabel } from './order-labels';
import styles from '@/app/account.module.css';
import { INTL_LOCALE } from '@/i18n/config';

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * The one line a customer needs after placing an order: what the store does next.
 *
 * Every branch is a statement about a stored state. A cancelled order says nothing about a refund
 * because a cancellation and a refund are separate facts, and a completed order says nothing about
 * cash reconciliation because the storefront cannot observe it.
 */
function nextStepKey(order: { status: string; codState: string; paymentMethod: string }): TranslationKey {
  if (order.status === 'cancelled') return 'orders.next.cancelled';
  if (order.status === 'returned') return 'orders.next.returned';
  if (order.paymentMethod === 'cod') {
    if (order.codState === 'cod_pending_approval') return 'orders.next.codAwaitingApproval';
    if (order.codState === 'cod_failed') return 'orders.next.codFailed';
  }
  if (order.status === 'pending') return 'orders.next.reviewing';
  /*
    Each branch is a fact the order row already holds. A dispatched order is not said to be delivered,
    and cash is only ever described as received once cod_collected was recorded - never because the
    parcel moved.
  */
  if (order.status === 'shipped') return 'orders.next.dispatched';
  if (order.status === 'delivered') return 'orders.next.delivered';
  if (order.status === 'completed') return 'orders.next.completed';
  if (order.codState === 'cod_collected') return 'orders.next.cashReceived';
  return 'orders.next.confirmed';
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
export function OrderDetailView({
  order,
  placed,
  guest,
  claimable = false,
  claimed = false,
  csrfToken = null,
}: {
  order: OrderDetail;
  placed: boolean;
  /**
   * True when no session resolved for this request. A guest has no order list and no account, so the
   * page must not offer either - and must say plainly that this link is the only way back, because the
   * shop publishes no self-service order lookup (an unanswered product question, OD-2).
   */
  guest: boolean;
  /**
   * Signed in, and this receipt belongs to no account yet (ADR 0032). The owner's request: ask the
   * customer whether they want the order in an account, and let them attach it if they do.
   */
  claimable?: boolean;
  /** The order was just claimed - say so once, instead of silently changing the page's owner. */
  claimed?: boolean;
  csrfToken?: string | null;
}) {
  const { t, price } = useTranslation();
  const receipt = `/orders/${order.orderNumber}`;

  return (
    <div className={styles.page}>
      {placed && <ClearCart />}

      {placed && (
        <section className={styles.placed} role="status">
          <h1>{t('orders.placedTitle')}</h1>
          <p>{t('orders.placedBody')}</p>
        </section>
      )}

      {/*
        ADR 0032. Three states, each a fact about this order's owner rather than a prompt:
        a signed-out guest is asked once whether they want an account (and told what it does);
        a signed-in customer is offered the claim for an order that is still a guest order;
        and a completed claim is confirmed instead of being left to be inferred.
        Nothing here promises a delivery price - the repeat-customer rule may be switched off by the
        owner, so the copy speaks about history, not about money.
      */}
      {claimed && (
        <section className={styles.card} role="status">
          <h2>{t('orders.claim.doneTitle')}</h2>
          <p className={styles.muted}>{t('orders.claim.doneBody')}</p>
          <Link className={styles.primaryAction} href="/account/orders">
            {t('orders.claim.viewOrders')}
          </Link>
        </section>
      )}

      {guest && (
        <section className={styles.card} aria-labelledby="order-claim">
          <h2 id="order-claim">{t('orders.claim.title')}</h2>
          <p className={styles.muted}>{t('orders.claim.body')}</p>
          <div className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={`/account/login?next=${encodeURIComponent(receipt)}`}
            >
              {t('account.signIn')}
            </Link>
            <Link
              className={styles.secondaryAction}
              href={`/account/register?next=${encodeURIComponent(receipt)}`}
            >
              {t('account.register')}
            </Link>
          </div>
        </section>
      )}

      {claimable && csrfToken !== null && (
        <section className={styles.card} aria-labelledby="order-claim">
          <h2 id="order-claim">{t('orders.claim.claimableTitle')}</h2>
          <p className={styles.muted}>{t('orders.claim.claimableBody')}</p>
          <form className={styles.inlineForm} method="post" action="/api/account/orders/claim">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button type="submit" className={styles.primaryAction}>
              {t('orders.claim.action')}
            </button>
          </form>
        </section>
      )}

      <header className={styles.header}>
        {!placed && <h1>{guest ? t('orders.guestTitle') : t('orders.title')}</h1>}
        <p className={styles.orderNumber}>
          {t('orders.orderNumber')} <strong>{order.orderNumber}</strong>
        </p>
        <p className={styles.muted}>{formatWhen(order.placedAt)}</p>
        {guest && <p className={styles.muted}>{t('orders.guestKeepLink')}</p>}
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
        {/*
          Owner direction, 2026-11-09: the cash-on-delivery sentence ("the owner approves the order
          before dispatch, and courier cash is reconciled separately") is gone from the order page. It
          described the shop's internal process on a page the customer reads, and the two facts that
          matter to them are already stated above and in what happens next. The legacy note stays,
          because it describes a historical order's own payment method rather than our process.
        */}
        {order.paymentMethod !== 'cod' && (
          <p className={styles.muted}>
            {t('orders.legacyPaymentNote')} <ContactLink />
          </p>
        )}
        {/*
          What happens next is read from the stored order state, never from a policy guess. There is no
          delivery deadline here because the store publishes none, and no cash-collection claim because
          only the owner's real-world action can establish that.
        */}
        <p className={styles.nextStep}>
          {t(nextStepKey(order))}
          {/*
            Three stored states leave something to settle with a person: a failed delivery, a
            cancellation, and a returned parcel. The sentence states the fact; the link is the route that
            used to be missing.
          */}
          {(order.status === 'cancelled' ||
            order.status === 'returned' ||
            (order.paymentMethod === 'cod' && order.codState === 'cod_failed')) && (
            <>
              {' '}
              <ContactLink />
            </>
          )}
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
          {orderDiscountMinor(order.itemsSubtotalMinor, order.shippingMinor, order.totalMinor) > 0 && (
            <div>
              <dt>{t('orders.discount')}</dt>
              <dd>
                −{price(orderDiscountMinor(order.itemsSubtotalMinor, order.shippingMinor, order.totalMinor))}
              </dd>
            </div>
          )}
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
          {order.districtCode === null ? '' : `, ${deliveryAreaName(order.districtCode)}`}, {order.area},{' '}
          {order.city}
          {order.postcode ? ` ${order.postcode}` : ''}
        </p>
        {order.deliveryNote && <p className={styles.muted}>{order.deliveryNote}</p>}
      </section>

      <div className={styles.actions}>
        {/*
          A guest has no order list: `/account/orders` would send them to sign in for an account they do
          not have. Only the customer sees the way back to their own orders.
        */}
        {!guest && (
          <Link className={styles.secondaryAction} href="/account/orders">
            {t('orders.backToOrders')}
          </Link>
        )}
        <Link className={styles.primaryAction} href="/products">
          {t('cart.continueShopping')}
        </Link>
      </div>
    </div>
  );
}
