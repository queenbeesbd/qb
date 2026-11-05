'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useCart } from '@/features/cart/useCart';
import { useCartPrices } from '@/features/cart/useCartPrices';
import { useTranslation } from '@/i18n/useTranslation';
import { formatMoney } from '@/lib/money';
import { CartIcon } from './icons';
import styles from './FloatingCart.module.css';

/**
 * The floating cart, at the right edge under the header.
 *
 * The box states two facts and nothing else: how many items the basket holds, and what those items cost
 * at the price the server currently gives them. Both are derived - the count from the stored lines, the
 * subtotal from `/api/cart/prices` multiplied by the stored quantities - and neither is authoritative:
 * a delivery charge, a promotion and the final total are decided at checkout.
 *
 * **When a price is missing the amount is omitted.** A line the server cannot price (removed from the
 * catalog, or a read that failed) leaves the box showing the count and "View cart" instead of a
 * subtotal that would be a different number from the checkout. That is the honest failure, and it also
 * keeps this component from ever inventing a total.
 *
 * **It is not drawn on `/cart` or `/checkout`** (2026-11-05): those pages already state the count and the
 * money, so the box only repeated them - and, being pinned to the right edge mid-screen, it covered the
 * order summary it was repeating on a 360px phone.
 */
export function FloatingCart() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { lines, itemCount } = useCart();
  const prices = useCartPrices(lines);

  // The cart page and checkout already state the count and the money; the account hub has its own
  // rail and the box would sit across it at mid-screen.
  if (pathname === '/cart' || pathname === '/checkout' || pathname.startsWith('/account')) {
    return null;
  }

  let subtotal = 0;
  let priced = 0;
  for (const line of lines) {
    const unit = prices[line.productId];
    if (unit === undefined) continue;
    subtotal += unit * line.quantity;
    priced += 1;
  }
  const complete = lines.length > 0 && priced === lines.length;

  return (
    <Link
      href="/cart"
      className={styles.box}
      aria-label={
        complete
          ? t('cartBox.labelWithTotal', { count: itemCount, total: formatMoney(subtotal) })
          : t('cartBox.label', { count: itemCount })
      }
      data-floating-cart
    >
      <span className={styles.icon} aria-hidden="true">
        <CartIcon width={20} height={20} />
      </span>
      <span className={styles.count} aria-hidden="true">
        {itemCount === 1 ? t('cartBox.countOne') : t('cartBox.count', { count: itemCount })}
      </span>
      {complete && (
        <span className={styles.total} aria-hidden="true">
          {formatMoney(subtotal)}
        </span>
      )}
    </Link>
  );
}
