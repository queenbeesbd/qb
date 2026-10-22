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
  promo_invalid: 'checkout.promo.invalid',
};

/** Every reason the promotion endpoint can answer with, as a sentence rather than a code. */
const PROMO_REASON_KEYS: Record<string, TranslationKey> = {
  unknown: 'checkout.promo.unknown',
  inactive: 'checkout.promo.unavailable',
  not_started: 'checkout.promo.unavailable',
  expired: 'checkout.promo.unavailable',
  below_minimum: 'checkout.promo.belowMinimum',
  exhausted: 'checkout.promo.exhausted',
  no_benefit: 'checkout.promo.noBenefit',
  unavailable: 'checkout.notice.unavailable',
  invalid_cart: 'checkout.promo.failed',
  network: 'checkout.promo.failed',
};

type AppliedPromo = {
  readonly code: string;
  readonly discountMinor: number;
  /** The subtotal the code was quoted against. A different subtotal means the quote is stale. */
  readonly subtotalMinor: number;
};

/**
 * The checkout form.
 *
 * It submits **ids, quantities, delivery contact and at most one promotion code**. There is still no
 * price field the server trusts, and **no payment-method field at all**: Cash on Delivery is the only
 * method this release accepts (Phase 17), so the method is not a choice the browser can make and the
 * route does not read one.
 *
 * The promotion code is applied by asking the server, never by computing the discount here: the preview
 * endpoint prices the cart with the same resolver order creation uses, so the number on screen is the
 * number the order receives. If the cart changes afterwards the quote is treated as stale and the code
 * must be applied again - an old discount must never ride along with a new basket.
 *
 * The form element - and therefore the session-bound CSRF token and the submission key - is always
 * rendered, even with an empty cart.
 */
export function CheckoutForm({
  csrfToken,
  idempotencyKey,
  notice,
  customerEmail,
  delivery,
}: {
  /** Null for a guest: there is no session to bind a token to, and the route checks the origin. */
  csrfToken: string | null;
  idempotencyKey: string;
  notice: string | null;
  /** Null for a guest: nothing is signed in, and the page does not claim otherwise. */
  customerEmail: string | null;
  delivery: { defaultMinor: number | null; overrides: Record<string, number> };
}) {
  const { t, pick, price } = useTranslation();
  const cart = useCart();
  const [districtCode, setDistrictCode] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoReason, setPromoReason] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

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

  // Derived, not stored: the cart is the source of truth, so a quote from an older basket simply stops
  // counting the moment the basket changes. No effect and no second copy of the total.
  const promoIsCurrent = promo !== null && promo.subtotalMinor === cart.subtotalMinor;
  const discountMinor = promoIsCurrent && promo !== null ? promo.discountMinor : 0;
  const previewTotal =
    quote?.ok === true ? cart.subtotalMinor - discountMinor + quote.quote.chargeMinor : null;

  const refusal = notice === null ? null : (REFUSAL_KEYS[notice] ?? 'checkout.notice.invalid');
  const promoMessage =
    promoReason === null ? null : (PROMO_REASON_KEYS[promoReason] ?? 'checkout.promo.failed');
  const lines = JSON.stringify(
    cart.entries.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity })),
  );

  async function applyPromotion() {
    if (promoInput.trim() === '' || promoBusy) return;
    setPromoBusy(true);
    setPromoReason(null);
    const payload = new FormData();
    if (csrfToken !== null) payload.set('csrf', csrfToken);
    payload.set('lines', lines);
    payload.set('promoCode', promoInput);
    try {
      const response = await fetch('/api/checkout/promo', { method: 'POST', body: payload });
      const result: { ok?: boolean; code?: string; discountMinor?: number; reason?: string } =
        await response.json();
      if (result.ok === true && typeof result.discountMinor === 'number') {
        setPromo({
          code: result.code ?? promoInput.trim().toUpperCase(),
          discountMinor: result.discountMinor,
          subtotalMinor: cart.subtotalMinor,
        });
        setPromoInput('');
      } else {
        setPromo(null);
        setPromoReason(result.reason ?? 'unknown');
      }
    } catch {
      setPromo(null);
      setPromoReason('network');
    } finally {
      setPromoBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('checkout.title')}</h1>
        {customerEmail !== null && (
          <p className={styles.muted}>{t('checkout.signedInAs', { email: customerEmail })}</p>
        )}
      </header>

      {refusal && (
        <p className={styles.notice} role="alert">
          {t(refusal)}
        </p>
      )}

      <form className={styles.layout} action="/api/checkout/order" method="post">
        {csrfToken !== null && <input type="hidden" name="csrf" value={csrfToken} />}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="lines" value={lines} />
        {discountMinor > 0 && promo !== null && (
          <input type="hidden" name="promoCode" value={promo.code} />
        )}

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
                      {area.name}
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

              <div className={styles.promo}>
                <label className={styles.promoLabel} htmlFor="promoCode">
                  {t('checkout.promo.label')}
                </label>
                {promoIsCurrent && promo !== null ? (
                  <div className={styles.promoApplied}>
                    <span className={styles.promoChip}>
                      {promo.code}
                      <span className={styles.promoAmount}>&minus;{price(promo.discountMinor)}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.promoRemove}
                      onClick={() => {
                        setPromo(null);
                        setPromoReason(null);
                      }}
                    >
                      {t('checkout.promo.remove')}
                    </button>
                  </div>
                ) : (
                  <div className={styles.promoRow}>
                    <input
                      id="promoCode"
                      name="promoCodeEntry"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={32}
                      placeholder={t('checkout.promo.placeholder')}
                      value={promoInput}
                      aria-describedby="promo-help"
                      onChange={(event) => {
                        setPromoInput(event.target.value.toUpperCase());
                        setPromoReason(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void applyPromotion();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className={styles.promoApply}
                      onClick={() => void applyPromotion()}
                      disabled={promoBusy || promoInput.trim() === ''}
                    >
                      {promoBusy ? t('checkout.promo.applying') : t('checkout.promo.apply')}
                    </button>
                  </div>
                )}
                <p id="promo-help" className={promoMessage === null ? styles.promoHint : styles.promoError} role="status">
                  {promoMessage !== null
                    ? t(promoMessage)
                    : promo !== null && !promoIsCurrent
                      ? t('checkout.promo.stale')
                      : t('checkout.promo.hint')}
                </p>
              </div>

              <dl className={styles.totals}>
                <div>
                  <dt>{t('cart.subtotal')}</dt>
                  <dd>{price(cart.subtotalMinor)}</dd>
                </div>
                {discountMinor > 0 && promo !== null && (
                  <div className={styles.discountRow}>
                    <dt>{t('checkout.promo.discountLine', { code: promo.code })}</dt>
                    <dd>&minus;{price(discountMinor)}</dd>
                  </div>
                )}
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
                disabled={!deliveryConfigured || unavailableCount > 0 || promoBusy}
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
