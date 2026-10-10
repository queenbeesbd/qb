'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import { InfoIcon } from '@/components/icons';
import styles from './CheckoutPreview.module.css';

/**
 * Simulated checkout preview. This component is intentionally inert: it has no
 * inputs, no network calls and no submit handler, so there is no code path that
 * could create an order, take a payment or transmit customer data.
 */
export function CheckoutPreview() {
  const { t, pick, price } = useTranslation();
  const cart = useCart();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.demoBadge}>{t('checkout.demoOnly')}</span>
        <h1>{t('checkout.title')}</h1>
      </header>

      <p className={styles.banner} role="note">
        <InfoIcon width={18} height={18} />
        {t('checkout.banner')}
      </p>

      <div className={styles.layout}>
        <section className={styles.summary} aria-labelledby="preview-summary">
          <h2 id="preview-summary">{t('checkout.summary')}</h2>
          {cart.isEmpty ? (
            <>
              <p className={styles.emptyText}>{t('cart.emptyTitle')}</p>
              <Link className={styles.secondaryAction} href="/products">
                {t('checkout.continueShopping')}
              </Link>
            </>
          ) : (
            <>
              <ul className={styles.lines}>
                {cart.entries.map((entry) => (
                  <li key={entry.product.id}>
                    <span>{pick(entry.product.name)}</span>
                    <span className={styles.lineMeta}>× {entry.quantity}</span>
                    <span className={styles.lineTotal}>{price(entry.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
              <dl className={styles.totals}>
                <div>
                  <dt>{t('cart.subtotal')}</dt>
                  <dd>{price(cart.subtotalMinor)}</dd>
                </div>
                <div>
                  <dt>{t('cart.delivery')}</dt>
                  <dd className={styles.muted}>{t('cart.deliveryUnknown')}</dd>
                </div>
                <div className={styles.totalRow}>
                  <dt>{t('cart.total')}</dt>
                  <dd>{price(cart.subtotalMinor)}</dd>
                </div>
              </dl>
              <p className={styles.note}>{t('cart.totalNote')}</p>
            </>
          )}
        </section>

        <section className={styles.notices} aria-labelledby="preview-notices">
          <h2 id="preview-notices">{t('checkout.nextStepTitle')}</h2>

          <div className={styles.notice}>
            <h3>{t('checkout.noPaymentTitle')}</h3>
            <p>{t('checkout.noPaymentBody')}</p>
          </div>
          <div className={styles.notice}>
            <h3>{t('checkout.noOrderTitle')}</h3>
            <p>{t('checkout.noOrderBody')}</p>
          </div>
          <div className={styles.notice}>
            <h3>{t('checkout.nextStepTitle')}</h3>
            <p>{t('checkout.nextStepBody')}</p>
          </div>

          <div className={styles.actions}>
            <Link className={styles.secondaryAction} href="/cart">
              {t('checkout.backToCart')}
            </Link>
            <Link className={styles.primaryAction} href="/products">
              {t('checkout.continueShopping')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
