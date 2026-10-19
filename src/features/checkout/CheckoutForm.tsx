'use client';

import Link from 'next/link';
import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import styles from './CheckoutForm.module.css';

const REFUSAL_KEYS: Record<string, TranslationKey> = {
  invalid: 'checkout.notice.invalid',
  unavailable: 'checkout.notice.unavailable',
  banned: 'checkout.notice.banned',
  empty_cart: 'checkout.notice.emptyCart',
  idempotency_conflict: 'checkout.notice.conflict',
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
 * Delivery charges are not configured, so shipping stays "arranged on confirmation" rather than
 * invented, and the items subtotal is shown as the payable amount.
 */
export function CheckoutForm({
  csrfToken,
  idempotencyKey,
  notice,
  customerEmail,
}: {
  csrfToken: string;
  idempotencyKey: string;
  notice: string | null;
  customerEmail: string;
}) {
  const { t, pick, price } = useTranslation();
  const cart = useCart();

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
                  <dd className={styles.muted}>{t('orders.deliveryPending')}</dd>
                </div>
                <div className={styles.totalRow}>
                  <dt>{t('cart.total')}</dt>
                  <dd>{price(cart.subtotalMinor)}</dd>
                </div>
              </dl>
              <p className={styles.muted}>{t('checkout.totalNote')}</p>
              <button type="submit" className={styles.primaryAction}>
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
