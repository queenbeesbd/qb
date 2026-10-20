'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from './useCart';
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
 * Demo cart. All totals are derived in one place (CartProvider) from the local
 * catalog, and nothing is ever sent anywhere. This state is explicitly not
 * authoritative for a future real order.
 */
export function CartView() {
  const { t, pick, price } = useTranslation();
  const cart = useCart();
  const unavailableCount = cart.entries.filter((entry) => unavailable(entry.product)).length;

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
        <p className={styles.count}>{t('cart.itemCount', { count: cart.itemCount })}</p>
      </header>

      <p className={styles.liveRegion} role="status" aria-live="polite">
        {t('cart.updatedAnnouncement', { count: cart.itemCount })}
      </p>

      <div className={styles.layout}>
        <ul className={styles.lines}>
          {cart.entries.map((entry) => {
            const name = pick(entry.product.name) ?? entry.product.slug;
            return (
              <li key={entry.product.id} className={styles.line}>
                <Link
                  className={styles.thumbLink}
                  href={`/products/${entry.product.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <ProductPhoto
                    image={entry.product.images[0]}
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
          <Link className={styles.primaryAction} href="/checkout">
            {t('cart.checkout')}
          </Link>
          <Link className={styles.secondaryAction} href="/products">
            {t('cart.continueShopping')}
          </Link>
          <button type="button" className={styles.clearButton} onClick={cart.clear}>
            {t('cart.clearCart')}
          </button>
        </aside>
      </div>
    </div>
  );
}
