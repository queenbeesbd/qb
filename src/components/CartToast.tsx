'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import {
  dismissCartToast,
  getCartToastServerSnapshot,
  getCartToastSnapshot,
  subscribeCartToast,
} from '@/features/cart/cart-feedback';
import styles from './CartToast.module.css';

/**
 * What a customer sees the moment a product goes into the cart.
 *
 * **One panel, every surface** (owner direction, 2026-11-12): a card and the product page both raise it,
 * so "added" looks the same wherever the tap happened. It replaced two different answers - a label that
 * flipped on a card, and a panel embedded in the product page's purchase block - because the customer's
 * question ("did that work, and how do I pay?") is the same in both places.
 *
 * **Built for a phone first.** Fixed to the bottom, clear of the tab bar and the safe area, edge-to-edge
 * with the page gutter, and 40px targets for its two actions. On a wide screen it becomes a compact
 * panel centred at the bottom instead of a full-width bar.
 *
 * **It answers, it does not block.** Nothing is scrolled, nothing takes focus, the page stays usable and
 * the toast dismisses itself after five seconds; the close control and `Escape` also clear it. The
 * animation is a short rise, and `prefers-reduced-motion` removes it entirely - the panel is fully
 * readable without any movement. `role="status"` announces it once, and the two actions are real links
 * and buttons, so a screen reader can act on it after the announcement.
 */
export function CartToast() {
  const { t } = useTranslation();
  const { itemCount } = useCart();
  const message = useSyncExternalStore(
    subscribeCartToast,
    getCartToastSnapshot,
    getCartToastServerSnapshot,
  );

  /* A fresh message restarts the countdown, so adding twice does not inherit the first timer. */
  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(() => dismissCartToast(), 5000);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismissCartToast();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [message]);

  /*
   * No mount guard: the store's server snapshot is `null`, so the server and the first client render agree
   * (both draw nothing) and the panel only appears after a real add. It is keyed by the message id so a
   * second add replays the animation rather than silently updating a panel nobody is looking at.
   */
  if (message === null) return null;

  return (
    <div className={styles.region} role="status" aria-live="polite" data-cart-toast="">
      <div className={styles.panel} key={message.id}>
        <span className={styles.mark} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.tick}
            />
          </svg>
        </span>

        <div className={styles.copy}>
          <p className={styles.title}>{t('product.added')}</p>
          <p className={styles.detail}>
            {message.productName}
            {itemCount > 1 && (
              <span className={styles.count}>
                {' '}
                · {itemCount === 1 ? t('cart.itemCountOne') : t('cart.itemCount', { count: itemCount })}
              </span>
            )}
          </p>
        </div>

        <div className={styles.actions}>
          <Link className={styles.primary} href="/cart">
            {t('product.viewCart')}
          </Link>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismissCartToast()}
            aria-label={t('product.dismissAdded')}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
