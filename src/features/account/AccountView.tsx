'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { INTL_LOCALE } from '@/i18n/config';
import { orderReceiptPath } from '@/lib/order-paths';
import styles from '@/app/account.module.css';
import { statusLabel } from './order-labels';
import type { OrderListItem } from './OrdersView';

/**
 * The account hub.
 *
 * **Rebuilt 2026-11-05** as one tinted frame and one white sheet, after the app-screen direction
 * (`framed-sheet`, seed 1922153422). The move is kept: the chrome is a flat lavender frame, the work
 * sits on a white sheet separated by a tone step and one hairline - no shadow, no card grid.
 *
 * The screen answers one question first: **"where are my orders?"** The three most recent orders
 * (with the real number, date, item count, state and total the database holds) are the largest block,
 * the order count sits in the frame, and the primary action is the shop rather than another card.
 * Identity and password help are secondary, in their own band under the sheet. A customer with no
 * orders gets the honest empty state and the same way in.
 *
 * Nothing is derived here. Every order value comes from the server's customer-scoped query, and the
 * session supplies the only identity the page shows.
 */
export function AccountView({
  customer,
  csrfToken,
  recentOrders,
  orderCount,
}: {
  customer: { email: string; displayName: string | null } | null;
  /** Present only when signed in; the sign-out form is the only mutation on this page. */
  csrfToken: string | null;
  /** The customer's own orders, newest first, already capped for this screen. */
  recentOrders: readonly OrderListItem[];
  orderCount: number;
}) {
  const { t, price } = useTranslation();

  /*
   * Signed out, the page keeps the same two-panel frame as sign-in: it is the same decision being
   * made, and a customer arriving from the account icon should not have to learn a second layout.
   */
  if (customer === null) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authShell}>
          <aside className={styles.authAside}>
            <Link href="/" className={styles.authBrand} aria-label={t('common.brand')}>
              <span className={styles.authBrandMark} aria-hidden="true">
                <img
                  src="/brand/logo-round-192.jpeg"
                  srcSet="/brand/logo-round-96.jpeg 96w, /brand/logo-round-192.jpeg 192w"
                  sizes="48px"
                  alt=""
                  width={48}
                  height={48}
                />
              </span>
            </Link>
            <h2 className={styles.authAsideTitle}>{t('account.authSignInAside')}</h2>
          </aside>
          <section className={styles.authPanel} aria-labelledby="account-signed-out">
            <header className={styles.authHeader}>
              <h1 id="account-signed-out">{t('account.notSignedInTitle')}</h1>
              <p className={styles.muted}>{t('account.notSignedInBody')}</p>
            </header>
            <div className={styles.authChoice}>
              <Link className={styles.primaryAction} href="/account/login?next=/account">
                {t('account.signIn')}
              </Link>
              <Link className={styles.secondaryAction} href="/account/register?next=/account">
                {t('account.register')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const name = customer.displayName ?? customer.email;
  const when = new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className={styles.hub}>
      <aside className={styles.hubFrame}>
        <Link href="/" className={styles.hubBrand} aria-label={t('common.brand')}>
          <span className={styles.hubMark} aria-hidden="true">
            <img
              src="/brand/logo-round-192.jpeg"
              srcSet="/brand/logo-round-96.jpeg 96w, /brand/logo-round-192.jpeg 192w"
              sizes="40px"
              alt=""
              width={40}
              height={40}
            />
          </span>
          <span className={styles.hubBrandText}>
            <span className={styles.hubKicker}>{t('account.title')}</span>
            <span className={styles.hubName}>{name}</span>
          </span>
        </Link>

        <p className={styles.hubEmail}>{customer.email}</p>

        <nav className={styles.hubNav} aria-label={t('account.navLabel')}>
          <Link className={styles.hubNavCurrent} href="/account" aria-current="page">
            <span>{t('account.overview')}</span>
          </Link>
          <Link className={styles.hubNavLink} href="/account/orders">
            <span>{t('account.orders')}</span>
            <span className={styles.hubNavCount}>
              {orderCount === 1
                ? t('account.ordersCountOne')
                : t('account.ordersCount', { count: orderCount })}
            </span>
          </Link>
          <Link className={styles.hubNavLink} href="/account/recover">
            <span>{t('account.passwordTitle')}</span>
            <span className={styles.hubNavNote}>{t('account.recoverTitle')}</span>
          </Link>
          <Link className={styles.hubNavLink} href="/products">
            <span>{t('account.shopNow')}</span>
          </Link>
        </nav>

        <div className={styles.hubFrameFoot}>
          <p className={styles.hubSession}>{t('account.sessionBody')}</p>
          {csrfToken !== null && (
            <form action="/api/account/logout" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <button type="submit" className={styles.hubSignOut}>
                {t('account.signOut')}
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className={styles.hubSheet}>
        <header className={styles.hubHeader}>
          <div className={styles.hubHeaderText}>
            <p className={styles.hubKicker}>{t('account.signedInAs')}</p>
            <h1>{t('account.welcomeBack', { name })}</h1>
            <p className={styles.hubBody}>{t('account.overviewBody')}</p>
          </div>
          <Link className={styles.hubPrimary} href="/products">
            {t('account.shopNow')}
          </Link>
        </header>

        <section className={styles.hubOrders} aria-labelledby="account-recent-orders">
          <div className={styles.hubSectionHead}>
            <h2 id="account-recent-orders">{t('account.recentOrders')}</h2>
            {orderCount > 0 && (
              <Link className={styles.hubTextLink} href="/account/orders">
                {t('account.allOrders')}
              </Link>
            )}
          </div>

          {recentOrders.length === 0 ? (
            <div className={styles.hubEmpty}>
              <p className={styles.hubEmptyTitle}>{t('account.noOrdersTitle')}</p>
              <p className={styles.hubBody}>{t('account.noOrdersBody')}</p>
              <Link className={styles.hubSecondary} href="/products">
                {t('account.shopNow')}
              </Link>
            </div>
          ) : (
            <ul className={styles.hubOrderList}>
              {recentOrders.map((order) => (
                <li key={order.orderNumber}>
                  <Link className={styles.hubOrderRow} href={orderReceiptPath(order.orderNumber)}>
                    <span className={styles.hubOrderIdentity}>
                      <span className={styles.hubOrderNumber}>{order.orderNumber}</span>
                      <span className={styles.hubOrderWhen}>{when.format(new Date(order.placedAt))}</span>
                    </span>
                    <span className={styles.hubOrderItems}>
                      {order.itemCount === 1
                        ? t('account.orderItemsOne')
                        : t('account.orderItems', { count: order.itemCount })}
                    </span>
                    <span className={styles.hubOrderStatus} data-status={order.status}>
                      {t(statusLabel(order.status))}
                    </span>
                    <span className={styles.hubOrderTotal}>{price(order.totalMinor)}</span>
                    <span className={styles.hubOrderArrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.hubColumns}>
          <section className={styles.hubCard} aria-labelledby="account-details">
            <h2 id="account-details">{t('account.detailsTitle')}</h2>
            <dl className={styles.hubFacts}>
              {customer.displayName !== null && (
                <div>
                  <dt>{t('account.displayName')}</dt>
                  <dd>{customer.displayName}</dd>
                </div>
              )}
              <div>
                <dt>{t('account.email')}</dt>
                <dd>{customer.email}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.hubCard} aria-labelledby="account-password">
            <h2 id="account-password">{t('account.noRecoveryTitle')}</h2>
            <p className={styles.hubBody}>{t('account.noRecoveryBody')}</p>
            <p className={styles.hubNote}>{t('account.recoveryContactNote')}</p>
            <Link className={styles.hubTextLink} href="/account/recover">
              {t('account.recoverTitle')}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
