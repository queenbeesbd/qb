'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TranslationKey } from '@/i18n/dictionaries';
import { quoteDelivery } from '@/lib/delivery';
import { DELIVERY_AREAS } from '@/lib/delivery-areas';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import styles from './CheckoutForm.module.css';

const REFUSAL_KEYS: Record<string, TranslationKey> = {
  invalid: 'checkout.notice.invalid',
  unavailable: 'checkout.notice.unavailable',
  banned: 'checkout.notice.banned',
  empty_cart: 'checkout.notice.emptyCart',
  idempotency_conflict: 'checkout.notice.conflict',
  invalid_district: 'checkout.notice.invalidDistrict',
  delivery_unconfigured: 'checkout.notice.deliveryUnconfigured',
};

/**
 * The checkout form.
 *
 * It submits **ids, quantities and delivery contact** and nothing else. There is still no price field
 * the server trusts, and **no payment-method field at all**: Cash on Delivery is the only method this
 * release accepts (Phase 17), so the method is not a choice the browser can make and the route does not
 * read one. The payment section states the method and what happens next - the owner calls to confirm
 * before dispatch - rather than offering a method that does not exist.
 *
 * The form element - and therefore the session-bound CSRF token and the submission key - is always
 * rendered, even with an empty cart. That is deliberate: the cart lives in the browser, so an empty
 * cart here means "this browser has no lines", not "this visitor may not submit", and the token is
 * derived from the session the visitor already holds. An empty cart shows the empty state in place of
 * the fields and no submit button.
 *
 * Delivery is priced from the owner's configuration (Phase 19): an active district override, otherwise
 * the required default. The preview below is convenience only - the route recomputes it from database
 * state inside the order transaction, and a missing default refuses the order rather than charging zero.
 */
export function CheckoutForm({
  csrfToken,
  idempotencyKey,
  notice,
  customerEmail,
  delivery,
}: {
  csrfToken: string;
  idempotencyKey: string;
  notice: string | null;
  customerEmail: string;
  delivery: { defaultMinor: number | null; overrides: Record<string, number> };
}) {
  const { t, pick, price, locale } = useTranslation();
  const cart = useCart();
  const [districtCode, setDistrictCode] = useState('');
  const rates = {
    defaultMinor: delivery.defaultMinor,
    overrides: new Map(Object.entries(delivery.overrides)),
  };
  const quote = districtCode === '' ? null : quoteDelivery(rates, districtCode);
  const deliveryConfigured = delivery.defaultMinor !== null;
  /**
   * A line whose product is not in stock right now. Availability comes from the same catalog snapshot
   * the cart is built from, and the server refuses such an order anyway - so the form says so here
   * instead of letting the customer fill in an address for an order that cannot be placed.
   */
  const unavailableCount = cart.entries.filter((entry) => entry.product.availability !== 'in_stock').length;
  const previewTotal = quote?.ok === true ? cart.subtotalMinor + quote.quote.chargeMinor : null;

  const refusal = notice === null ? null : (REFUSAL_KEYS[notice] ?? 'checkout.notice.invalid');
  const lines = JSON.stringify(
    cart.entries.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity })),
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('checkout.title')}</h1>
        <p className={styles.muted}>{t('checkout.signedInAs', { email: customerEmail })}</p>
      </header>

      {refusal && (
        <p className={styles.notice} role="alert">
          {t(refusal)}
        </p>
      )}

      <form className={styles.layout} action="/api/checkout/order" method="post">
        <input type="hidden" name="csrf" value={csrfToken} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="lines" value={lines} />

        {cart.isEmpty ? (
          <section className={styles.card} aria-labelledby="checkout-empty">
            <h2 id="checkout-empty">{t('cart.emptyTitle')}</h2>
            <p className={styles.muted}>{t('cart.emptyBody')}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/products">
                {t('cart.continueShopping')}
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.card} aria-labelledby="checkout-contact">
              <h2 id="checkout-contact">{t('checkout.contactTitle')}</h2>
              <label className={styles.field}>
                <span>{t('checkout.field.recipientName')}</span>
                <input type="text" name="recipientName" required minLength={2} maxLength={120} autoComplete="name" />
              </label>
              <label className={styles.field}>
                <span>{t('checkout.field.recipientPhone')}</span>
                <input
                  type="tel"
                  name="recipientPhone"
                  required
                  inputMode="numeric"
                  pattern="01[3-9][0-9]{8}"
                  placeholder="01XXXXXXXXX"
                  maxLength={11}
                />
                <small>{t('checkout.field.recipientPhoneHelp')}</small>
              </label>
              <label className={styles.field}>
                <span>{t('checkout.field.addressLine')}</span>
                <input
                  type="text"
                  name="addressLine"
                  required
                  minLength={5}
                  maxLength={300}
                  autoComplete="street-address"
                />
              </label>
              <label className={styles.field}>
                <span>{t('checkout.field.district')}</span>
                <select
                  name="districtCode"
                  required
                  value={districtCode}
                  onChange={(event) => setDistrictCode(event.target.value)}
                >
                  <option value="">{t('checkout.field.districtPrompt')}</option>
                  {DELIVERY_AREAS.map((area) => (
                    <option key={area.code} value={area.code}>
                      {locale === 'bn' ? area.nameBn : area.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>{t('checkout.field.area')}</span>
                  <input type="text" name="area" required maxLength={80} />
                </label>
                <label className={styles.field}>
                  <span>{t('checkout.field.city')}</span>
                  <input type="text" name="city" required maxLength={80} autoComplete="address-level2" />
                </label>
              </div>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>
                    {t('checkout.field.postcode')} <em>{t('common.optional')}</em>
                  </span>
                  <input type="text" name="postcode" maxLength={20} autoComplete="postal-code" />
                </label>
                <label className={styles.field}>
                  <span>
                    {t('checkout.field.deliveryNote')} <em>{t('common.optional')}</em>
                  </span>
                  <input type="text" name="deliveryNote" maxLength={300} />
                </label>
              </div>
            </section>

            <section className={styles.card} aria-labelledby="checkout-payment">
              <h2 id="checkout-payment">{t('checkout.paymentTitle')}</h2>
              <p className={styles.methodOnly}>{t('checkout.method.cod')}</p>
              <p className={styles.muted}>{t('checkout.methodCodNote')}</p>
              <p className={styles.muted}>{t('checkout.paymentMethodOnly')}</p>
            </section>

            <aside className={styles.summary} aria-labelledby="checkout-summary">
              <h2 id="checkout-summary">{t('checkout.summary')}</h2>
              <ul className={styles.lines}>
                {cart.entries.map((entry) => (
                  <li key={entry.product.id}>
                    <span>{pick(entry.product.name)}</span>
                    <span className={styles.lineMeta}>&times; {entry.quantity}</span>
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
                  <dd className={quote?.ok === true ? undefined : styles.muted}>
                    {!deliveryConfigured
                      ? t('checkout.deliveryUnconfigured')
                      : quote === null
                        ? t('checkout.field.districtPrompt')
                        : quote.ok
                          ? price(quote.quote.chargeMinor)
                          : t('checkout.notice.invalidDistrict')}
                  </dd>
                </div>
                <div className={styles.totalRow}>
                  <dt>{t('cart.total')}</dt>
                  <dd>{previewTotal === null ? '—' : price(previewTotal)}</dd>
                </div>
              </dl>
              {previewTotal !== null && (
                <p className={styles.muted}>
                  {quote?.ok === true && quote.quote.source === 'district'
                    ? t('checkout.deliveryDistrictNote')
                    : t('checkout.deliveryDefaultNote')}
                </p>
              )}
              {!deliveryConfigured && (
                <p className={styles.notice} role="alert">
                  {t('checkout.deliveryUnconfigured')}
                </p>
              )}
              {unavailableCount > 0 && (
                <p className={styles.notice} role="alert">
                  {t('checkout.unavailableNotice')}
                </p>
              )}
              <button
                type="submit"
                className={styles.primaryAction}
                disabled={!deliveryConfigured || unavailableCount > 0}
              >
                {t('checkout.submit')}
              </button>
              <Link className={styles.secondaryAction} href="/cart">
                {t('checkout.backToCart')}
              </Link>
            </aside>
          </>
        )}
      </form>
    </div>
  );
}
