'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import type { TranslationKey } from '@/i18n/dictionaries';
import {
  contactProblems,
  type ContactFieldName,
  type ContactValues,
} from '@/lib/checkout-fields';
import {
  customDeliveryMinor,
  quoteOrderDelivery,
  repeatDiscountMinor,
  type DeliveryRates,
} from '@/lib/delivery';
import { DELIVERY_AREAS } from '@/lib/delivery-areas';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import { resolveCartLines } from '@/features/cart/cart-lines';
import { useCartProjection } from '@/features/cart/useCartProjection';
import { ContactLink } from '@/components/ContactLink';
import type { CartProduct } from '@/features/cart/cart-product';
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
  // A session that ended while the form was open. Reachable once guest ordering is off.
  unauthenticated: 'checkout.promo.signInRequired',
};

/**
 * One sentence per field the shared checkout rules can refuse.
 *
 * The rules live in `src/lib/checkout-fields.ts` and are the same ones the order route applies, so the
 * summary can never name a field the server would accept, or stay silent about one it would refuse.
 */
const FIELD_PROBLEM_KEYS: Record<ContactFieldName, TranslationKey> = {
  recipientName: 'checkout.problem.recipientName',
  recipientPhone: 'checkout.problem.recipientPhone',
  addressLine: 'checkout.problem.addressLine',
  districtCode: 'checkout.problem.district',
  area: 'checkout.problem.area',
  city: 'checkout.problem.city',
  postcode: 'checkout.problem.postcode',
  deliveryNote: 'checkout.problem.deliveryNote',
};

/** Reads the contact block as plain strings. Missing values become empty strings, never `undefined`. */
function readContactValues(form: HTMLFormElement): ContactValues {
  const data = new FormData(form);
  const text = (name: ContactFieldName): string => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
  return {
    recipientName: text('recipientName'),
    recipientPhone: text('recipientPhone'),
    addressLine: text('addressLine'),
    districtCode: text('districtCode'),
    area: text('area'),
    city: text('city'),
    postcode: text('postcode'),
    deliveryNote: text('deliveryNote'),
  };
}

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
 * route does not read one. The payment card prints the owner's advance-payment instructions (ADR 0029)
 * - where to send money and under which threshold - which is copy, not a method: the order is still
 * written as COD and the owner confirms the transfer on the phone.
 *
 * The delivery charge and the automatic repeat-customer discount are previewed with the same pure
 * resolver the order transaction uses, and the promotion code is applied by asking the server: the preview
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
  pricing,
  customer,
  payment,
  products,
}: {
  /** Null for a guest: there is no session to bind a token to, and the route checks the origin. */
  csrfToken: string | null;
  idempotencyKey: string;
  notice: string | null;
  /** Null for a guest: nothing is signed in, and the page does not claim otherwise. */
  customerEmail: string | null;
  /** The whole pricing configuration: the default rule and the three optional rules (ADR 0029). */
  pricing: {
    defaultMinor: number | null;
    overrides: Record<string, number>;
    conditional: NonNullable<DeliveryRates['conditional']>;
    repeat: NonNullable<DeliveryRates['repeat']>;
    repeatDiscount: NonNullable<DeliveryRates['repeatDiscount']>;
  };
  /** Read by the server from the session and the order history; the preview only mirrors it. */
  customer: { authenticated: boolean; repeatCustomer: boolean };
  /** The owner's published payment instructions. An instruction, never a payment method. */
  payment: {
    instructions: string;
    bkashNumber: string | null;
    /** The owner's switch: off draws no number block even when a number is stored. */
    bkashVisible: boolean;
    sendMoneyNote: string | null;
    advanceThresholdMinor: number;
  };
  /** The compact catalog projection, supplied by the server page because this route draws lines. */
  products: readonly CartProduct[];
}) {
  const { t, price } = useTranslation();
  const cart = useCart();
  const resolved = useMemo(() => resolveCartLines(cart.lines, products), [cart.lines, products]);
  const projection = useCartProjection(cart.lines, products);
  const [districtCode, setDistrictCode] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoReason, setPromoReason] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [bkashCopied, setBkashCopied] = useState(false);
  /**
   * The fields the last submit attempt would be refused for, or `null` before the first attempt.
   *
   * `null` matters: the summary must not appear on a page the customer has not tried to submit yet, and
   * an empty array is the "tried, and everything is fine" state - it keeps the summary mounted long
   * enough to clear itself rather than flashing.
   */
  const [problems, setProblems] = useState<readonly ContactFieldName[] | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const invalid = (field: ContactFieldName): true | undefined =>
    problems?.includes(field) === true ? true : undefined;

  const rates: DeliveryRates = {
    defaultMinor: pricing.defaultMinor,
    overrides: new Map(Object.entries(pricing.overrides)),
    conditional: pricing.conditional,
    repeat: pricing.repeat,
    repeatDiscount: pricing.repeatDiscount,
  };
  /*
   * The same hierarchy the order transaction applies, previewed with the same function. `customer` is
   * the server's answer about this session - the browser cannot make itself a repeat customer, and a
   * guest's context always takes the default path.
   */
  const pricingContext = {
    subtotalMinor: resolved.subtotalMinor,
    authenticated: customer.authenticated,
    repeatCustomer: customer.repeatCustomer,
  };
  /*
   * A product's own delivery charge (owner decision, 2026-11-10). The preview resolves it from the same
   * cart projection the order transaction reads, so the charge shown and the charge stored cannot
   * disagree; the server still recomputes it inside the order.
   */
  const productChargeMinor = customDeliveryMinor(
    resolved.entries.map((entry) => entry.product.deliveryMinor),
    districtCode,
  );
  const quote =
    districtCode === ''
      ? null
      : quoteOrderDelivery(rates, districtCode, pricingContext, productChargeMinor);
  // A configured default, or a product that states its own charge, is enough to price the order.
  const deliveryConfigured = pricing.defaultMinor !== null || productChargeMinor !== null;
  /**
   * A line whose product is not in stock right now. Availability comes from the same catalog snapshot
   * the cart is built from, and the server refuses such an order anyway - so the form says so here
   * instead of letting the customer fill in an address for an order that cannot be placed.
   */
  const unavailableCount = resolved.entries.filter((entry) => entry.product.availability !== 'in_stock').length;

  // Derived, not stored: the cart is the source of truth, so a quote from an older basket simply stops
  // counting the moment the basket changes. No effect and no second copy of the total.
  const promoIsCurrent = promo !== null && promo.subtotalMinor === resolved.subtotalMinor;
  const promoDiscountMinor = promoIsCurrent && promo !== null ? promo.discountMinor : 0;
  /**
   * The automatic repeat discount, previewed here and re-resolved inside the order transaction. It is
   * added to any promotion and the pair is capped at the goods subtotal, so no combination discounts
   * the same taka twice or makes delivery free.
   */
  const automaticDiscountMinor = repeatDiscountMinor(rates, pricingContext);
  const discountMinor = Math.min(
    resolved.subtotalMinor,
    promoDiscountMinor + automaticDiscountMinor,
  );
  const previewTotal =
    quote?.ok === true ? resolved.subtotalMinor - discountMinor + quote.quote.chargeMinor : null;
  const advanceApplies = resolved.subtotalMinor < payment.advanceThresholdMinor;
  const paymentParagraphs = payment.instructions
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const refusal = notice === null ? null : (REFUSAL_KEYS[notice] ?? 'checkout.notice.invalid');
  const promoMessage =
    promoReason === null ? null : (PROMO_REASON_KEYS[promoReason] ?? 'checkout.promo.failed');
  const linePayload = JSON.stringify(
    resolved.entries.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity })),
  );

  /**
   * The single client-side reporter.
   *
   * The form is `noValidate`, so the browser no longer stops the submit before this handler runs and
   * never shows a transient bubble whose wording the shop does not own. A refusal is a list of fields,
   * stated in the page, with focus moved to the first one - and the server still validates the same
   * values again, because this is reporting, not authority.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const found = contactProblems(readContactValues(event.currentTarget));
    if (found.length === 0) {
      setProblems([]);
      return;
    }
    event.preventDefault();
    setProblems(found);
    const first = found[0];
    if (first !== undefined) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  }

  /** Once a summary is on screen it follows the fields, so a corrected field stops being listed. */
  function handleInput(event: React.FormEvent<HTMLFormElement>) {
    if (problems === null) return;
    setProblems(contactProblems(readContactValues(event.currentTarget)));
  }

  async function applyPromotion() {
    if (promoInput.trim() === '' || promoBusy) return;
    setPromoBusy(true);
    setPromoReason(null);
    const payload = new FormData();
    if (csrfToken !== null) payload.set('csrf', csrfToken);
    payload.set('lines', linePayload);
    payload.set('promoCode', promoInput);
    try {
      const response = await fetch('/api/checkout/promo', { method: 'POST', body: payload });
      const result: { ok?: boolean; code?: string; discountMinor?: number; reason?: string } =
        await response.json();
      if (result.ok === true && typeof result.discountMinor === 'number') {
        setPromo({
          code: result.code ?? promoInput.trim().toUpperCase(),
          discountMinor: result.discountMinor,
          subtotalMinor: resolved.subtotalMinor,
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

      {/*
        The problem list sits above the form, in page order, so a customer on a phone reads it before
        scrolling into the fields. It is always mounted once a submit has been attempted, which is what
        lets it clear itself as fields are corrected instead of disappearing in one jump.
      */}
      {problems !== null && problems.length > 0 && (
        <div className={styles.problems} role="alert">
          <p className={styles.problemsTitle}>{t('checkout.problem.summary')}</p>
          <ul>
            {problems.map((field) => (
              <li key={field}>{t(FIELD_PROBLEM_KEYS[field])}</li>
            ))}
          </ul>
        </div>
      )}

      <form
        ref={formRef}
        className={styles.layout}
        action="/api/checkout/order"
        method="post"
        noValidate
        onSubmit={handleSubmit}
        onInput={handleInput}
      >
        {csrfToken !== null && <input type="hidden" name="csrf" value={csrfToken} />}
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="lines" value={linePayload} />
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
                <input
                  type="text"
                  name="recipientName"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  aria-invalid={invalid('recipientName')}
                />
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
                  aria-invalid={invalid('recipientPhone')}
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
                  aria-invalid={invalid('addressLine')}
                />
              </label>
              <label className={styles.field}>
                <span>{t('checkout.field.district')}</span>
                <select
                  name="districtCode"
                  required
                  value={districtCode}
                  aria-invalid={invalid('districtCode')}
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
                  <input
                    type="text"
                    name="area"
                    required
                    maxLength={80}
                    aria-invalid={invalid('area')}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('checkout.field.city')}</span>
                  <input
                    type="text"
                    name="city"
                    required
                    maxLength={80}
                    autoComplete="address-level2"
                    aria-invalid={invalid('city')}
                  />
                </label>
              </div>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>
                    {t('checkout.field.postcode')} <em>{t('common.optional')}</em>
                  </span>
                  <input
                    type="text"
                    name="postcode"
                    maxLength={20}
                    autoComplete="postal-code"
                    aria-invalid={invalid('postcode')}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    {t('checkout.field.deliveryNote')} <em>{t('common.optional')}</em>
                  </span>
                  <input
                    type="text"
                    name="deliveryNote"
                    maxLength={300}
                    aria-invalid={invalid('deliveryNote')}
                  />
                </label>
              </div>
            </section>

            <section className={styles.card} aria-labelledby="checkout-payment">
              <h2 id="checkout-payment">{t('checkout.paymentTitle')}</h2>
              <p className={styles.methodOnly}>{t('checkout.method.cod')}</p>

              {paymentParagraphs.length > 0 && (
                <div className={styles.paymentInstructions}>
                  {paymentParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              )}

              {/*
                The number block is hidden outright when the owner switches it off - that is the owner's
                own decision, not a gap - and the "not published" line appears only while the block is
                meant to be shown and no number has been stored.
              */}
              {payment.bkashVisible &&
                (payment.bkashNumber !== null ? (
                  <div className={styles.bkashCard}>
                    <span className={styles.bkashLabel}>{t('checkout.payment.bkashLabel')}</span>
                    <strong className={styles.bkashNumber}>{payment.bkashNumber}</strong>
                    <button
                      type="button"
                      className={styles.bkashCopy}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(payment.bkashNumber ?? '')
                          .then(() => setBkashCopied(true))
                          .catch(() => setBkashCopied(false));
                      }}
                    >
                      {bkashCopied ? t('checkout.payment.copied') : t('checkout.payment.copy')}
                    </button>
                    {payment.sendMoneyNote !== null && (
                      <p className={styles.paymentCaution}>{payment.sendMoneyNote}</p>
                    )}
                  </div>
                ) : (
                  <p className={styles.muted}>{t('checkout.payment.numberMissing')}</p>
                ))}
            </section>

            <aside className={styles.summary} aria-labelledby="checkout-summary">
              <h2 id="checkout-summary">{t('checkout.summary')}</h2>
              <ul className={styles.lines}>
                {resolved.entries.map((entry) => (
                  <li key={entry.product.id}>
                    <span>{entry.product.name}</span>
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
                  <dd>{price(resolved.subtotalMinor)}</dd>
                </div>
                {promoDiscountMinor > 0 && promo !== null && (
                  <div className={styles.discountRow}>
                    <dt>{t('checkout.promo.discountLine', { code: promo.code })}</dt>
                    <dd>&minus;{price(promoDiscountMinor)}</dd>
                  </div>
                )}
                {automaticDiscountMinor > 0 && (
                  <div className={styles.discountRow}>
                    <dt>
                      {t('checkout.repeatDiscount', {
                        percent: pricing.repeatDiscount.percent ?? 0,
                      })}
                    </dt>
                    <dd>&minus;{price(automaticDiscountMinor)}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('cart.delivery')}</dt>
                  <dd className={quote?.ok === true ? undefined : styles.muted}>
                    {!deliveryConfigured
                      ? t('checkout.deliveryNotConfigured')
                      : quote === null
                        ? t('checkout.field.districtPrompt')
                        : quote.ok
                          ? price(quote.quote.chargeMinor)
                          : t('checkout.notice.invalidDistrict')}
                  </dd>
                </div>
                {advanceApplies && quote?.ok === true && (
                  <div>
                    <dt>{t('checkout.advanceLine')}</dt>
                    <dd>{price(quote.quote.chargeMinor)}</dd>
                  </div>
                )}
                <div className={styles.totalRow}>
                  <dt>{t('cart.total')}</dt>
                  <dd>{previewTotal === null ? '—' : price(previewTotal)}</dd>
                </div>
              </dl>
              {advanceApplies && quote?.ok === true && (
                <p className={styles.muted}>
                  {t('checkout.advanceHelp', {
                    amount: price(payment.advanceThresholdMinor),
                  })}
                </p>
              )}
              {previewTotal !== null && (
                <p className={styles.muted}>
                  {quote?.ok === true && quote.quote.source === 'product'
                    ? t('checkout.deliveryProductNote')
                    : quote?.ok === true && quote.quote.source === 'district'
                      ? t('checkout.deliveryDistrictNote')
                      : t('checkout.deliveryDefaultNote')}
                </p>
              )}
              {!deliveryConfigured && (
                <p className={styles.notice} role="alert">
                  {t('checkout.deliveryUnconfigured')} <ContactLink />
                </p>
              )}
              {unavailableCount > 0 && (
                <p className={styles.notice} role="alert">
                  {t('checkout.unavailableNotice')}
                </p>
              )}
              {/*
                A line with no product would be missing from the submitted payload, so the order would
                be placed without it. The button is refused until the page can draw every line - the
                same rule as an out-of-stock item, and for the same reason: never charge for a basket
                that is not the one on screen.
              */}
              {projection.unresolvedCount > 0 && (
                <p className={styles.notice} role="alert">
                  {projection.stalled ? t('cart.unresolved') : t('checkout.loadingLines')}
                </p>
              )}
              <button
                type="submit"
                className={styles.primaryAction}
                disabled={
                  !deliveryConfigured ||
                  unavailableCount > 0 ||
                  projection.unresolvedCount > 0 ||
                  promoBusy
                }
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
