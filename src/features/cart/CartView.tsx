'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from './useCart';
import { resolveCartLines } from './cart-lines';
import { useCartProjection } from './useCartProjection';
import type { CartProduct } from './cart-product';
import { QuantityStepper } from '@/components/QuantityStepper';
import { ProductPhoto } from '@/components/ProductPhoto';
import { TrashIcon } from '@/components/icons';
import styles from '@/app/cart.module.css';

/**
 * A line whose product is no longer in stock right now.
 *
 * The cart stores ids and quantities only, so availability is always read from the current catalog
 * snapshot rather than remembered. The line is kept - removing a customer's choice for them would be
 * worse - but it is marked, and the summary says plainly that the order cannot be placed until it is
 * removed. The server refuses the order regardless of what this says (ADR 0013).
 */
function unavailable(product: { availability: string }): boolean {
  return product.availability !== 'in_stock';
}

/**
 * The item count to announce, or `null` when there is nothing new to say.
 *
 * The live region used to print the current count as soon as the cart mounted, so a
 * screen-reader user heard "cart updated: 2 items" on page load although nothing had
 * changed (Phase 24 audit S-26).
 *
 * "Nothing changed" has two phases, and both must stay silent:
 *
 *   1. **First render.** The cart store's server snapshot is empty, so the count starts at 0.
 *   2. **Hydration.** `useSyncExternalStore` then reports the restored lines, which changes
 *      the count from 0 to N without the customer doing anything. A naive "announce every
 *      change" rule announces exactly here - which is the bug, just moved one render later.
 *
 * So the values seen before the cart has hydrated are treated as the baseline rather than as
 * news. `hydrated` flips on the first render that agrees with the store's client snapshot,
 * and only a change *after* that is announced.
 */
function useCartAnnouncement(count: number): string | null {
  const [state, setState] = useState({ seen: count, armed: false, message: null as string | null });

  // Arming is an event, not a derived value: it flips once, after the first committed paint,
  // because everything that happens before that is the cart restoring itself from storage.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setState((current) => (current.armed ? current : { ...current, armed: true }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (state.seen !== count) {
    // Adjusting state during render for a changed input, per React's documented pattern.
    setState({ seen: count, armed: state.armed, message: state.armed ? String(count) : null });
  }
  return state.message;
}

/**
 * Demo cart. All totals are derived in one place (CartProvider) from the local
 * catalog, and nothing is ever sent anywhere. This state is explicitly not
 * authoritative for a future real order.
 */
/**
 * The cart page.
 *
 * It receives the compact product projection from its own server page, which is the only place a
 * cart line's name, price and picture can come from: the browser stores ids and quantities, never
 * prices. The provider above it stays free of product records so every other route stays small.
 */
export function CartView({ products }: { products: readonly CartProduct[] }) {
  const { t, price } = useTranslation();
  const cart = useCart();
  const resolved = useMemo(() => resolveCartLines(cart.lines, products), [cart.lines, products]);
  const projection = useCartProjection(cart.lines, products);
  const unavailableCount = resolved.entries.filter((entry) => unavailable(entry.product)).length;
  const announced = useCartAnnouncement(cart.itemCount);

  /**
   * Clearing the cart is the only destructive control a shopper has, and it used to remove every line
   * on a single tap. It is now a two-step question with **no timer**: a confirmation that closes on its
   * own can vanish while it is being read, and it would leave focus on a control that no longer exists.
   *
   * Focus moves to "Keep items" when the question opens, so the safe answer is the one a keyboard user
   * lands on, and Escape or the keep control returns focus to the trigger. The question states how many
   * items it would remove, and the count is part of the accessible name of the group rather than only
   * text beside it.
   */
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTriggerRef = useRef<HTMLButtonElement | null>(null);
  const keepItemsRef = useRef<HTMLButtonElement | null>(null);
  /** Distinguishes the first paint (which must not steal focus) from a closed confirmation. */
  const clearQuestionOpened = useRef(false);

  useEffect(() => {
    if (confirmingClear) {
      clearQuestionOpened.current = true;
      keepItemsRef.current?.focus();
      return;
    }
    if (clearQuestionOpened.current) clearTriggerRef.current?.focus();
  }, [confirmingClear]);

  if (cart.isEmpty) {
    return (
      <div className={styles.empty}>
        <h1>{t('cart.emptyTitle')}</h1>
        <p>{t('cart.emptyBody')}</p>
        <Link className={styles.primaryAction} href="/products">
          {t('cart.continueShopping')}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('cart.title')}</h1>
        <p className={styles.count}>
          {cart.itemCount === 1 ? t('cart.itemCountOne') : t('cart.itemCount', { count: cart.itemCount })}
        </p>
      </header>

      <p className={styles.liveRegion} role="status" aria-live="polite">
        {announced === null
          ? ''
          : cart.itemCount === 1
            ? t('cart.updatedAnnouncementOne')
            : t('cart.updatedAnnouncement', { count: cart.itemCount })}
      </p>

      {/*
        A line this page could not draw is stated, never dropped in silence. The summary, the item
        count above and the price beside each line are all derived from products, so a missing one
        makes the total wrong - and a customer must not be shown a total that disagrees with the cart.
      */}
      {projection.stalled && (
        <div className={styles.projectionNotice} role="alert">
          <p>{t('cart.unresolved')}</p>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => window.location.reload()}
          >
            {t('cart.unresolvedReload')}
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <ul className={styles.lines}>
          {resolved.entries.map((entry) => {
            const name = entry.product.name;
            return (
              <li key={entry.product.id} className={styles.line}>
                <Link
                  className={styles.thumbLink}
                  href={`/products/${entry.product.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <ProductPhoto
                    image={
                      entry.product.imageKey === null
                        ? undefined
                        : {
                            key: entry.product.imageKey,
                            alt: { bn: null, en: entry.product.name },
                            rights: entry.product.imageRights,
                          }
                    }
                    alt=""
                    sizes="88px"
                    className={styles.thumb}
                  />
                </Link>

                <div className={styles.lineBody}>
                  {entry.product.brand && (
                    <p className={styles.lineBrand}>{entry.product.brand}</p>
                  )}
                  <h2 className={styles.lineTitle}>
                    <Link href={`/products/${entry.product.slug}`}>{name}</Link>
                  </h2>
                  {entry.product.pack && (
                    <p className={styles.linePack}>{entry.product.pack}</p>
                  )}
                  {unavailable(entry.product) && (
                    <p className={styles.lineUnavailable}>
                      {entry.product.availability === 'out_of_stock'
                        ? t('product.availability.out_of_stock')
                        : t('product.availability.unknown')}
                      {' — '}
                      {t('cart.lineUnavailable')}
                    </p>
                  )}

                  <div className={styles.lineControls}>
                    <QuantityStepper
                      value={entry.quantity}
                      max={cart.maxQuantity}
                      onChange={(next) => cart.setQuantity(entry.product.id, next)}
                      label={t('cart.quantityFor', { name })}
                      decreaseLabel={t('product.decrease')}
                      increaseLabel={t('product.increase')}
                    />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => cart.removeItem(entry.product.id)}
                      aria-label={t('cart.removeItem', { name })}
                    >
                      <TrashIcon width={16} height={16} />
                      {t('cart.remove')}
                    </button>
                  </div>
                </div>

                <p className={styles.linePrice}>{price(entry.lineTotalMinor)}</p>
              </li>
            );
          })}
        </ul>

        <aside className={styles.summary} aria-labelledby="summary-title">
          {unavailableCount > 0 && (
            <p className={styles.summaryWarning} role="alert">
              {t('cart.unavailableWarning')}
            </p>
          )}
          <h2 id="summary-title">{t('checkout.summary')}</h2>
          <dl className={styles.summaryList}>
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{price(resolved.subtotalMinor)}</dd>
            </div>
            <div>
              <dt>{t('cart.delivery')}</dt>
              <dd className={styles.muted}>{t('cart.deliveryUnknown')}</dd>
            </div>
            <div className={styles.totalRow}>
              <dt>{t('cart.total')}</dt>
              <dd>{price(resolved.subtotalMinor)}</dd>
            </div>
          </dl>
          <Link className={styles.primaryAction} href="/checkout">
            {t('cart.checkout')}
          </Link>
          <Link className={styles.secondaryAction} href="/products">
            {t('cart.continueShopping')}
          </Link>
          {confirmingClear ? (
            <div
              className={styles.clearConfirm}
              role="group"
              aria-labelledby="clear-cart-prompt"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setConfirmingClear(false);
                }
              }}
            >
              <p id="clear-cart-prompt" className={styles.clearPrompt}>
                {cart.itemCount === 1
                  ? t('cart.clearConfirmTitleOne')
                  : t('cart.clearConfirmTitle', { count: cart.itemCount })}
              </p>
              <p className={styles.clearHint}>{t('cart.clearConfirmBody')}</p>
              <div className={styles.clearActions}>
                <button
                  type="button"
                  className={styles.clearDanger}
                  aria-describedby="clear-cart-prompt"
                  onClick={() => {
                    cart.clear();
                    setConfirmingClear(false);
                  }}
                >
                  {t('cart.clearConfirmAction')}
                </button>
                <button
                  type="button"
                  ref={keepItemsRef}
                  className={styles.clearKeep}
                  aria-describedby="clear-cart-prompt"
                  onClick={() => setConfirmingClear(false)}
                >
                  {t('cart.clearKeep')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              ref={clearTriggerRef}
              className={styles.clearButton}
              onClick={() => setConfirmingClear(true)}
            >
              {t('cart.clearCart')}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
