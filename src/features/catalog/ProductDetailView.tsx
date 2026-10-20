'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DETAIL_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { QuantityStepper } from '@/components/QuantityStepper';
import { ProductPhoto } from '@/components/ProductPhoto';
import { CheckIcon } from '@/components/icons';
import styles from '@/app/product.module.css';

/**
 * Product detail view. Only verified attributes are displayed; unpublished
 * descriptions and missing stock data are stated plainly instead of being
 * filled with invented copy.
 *
 * The product, its category and its related products all arrive as
 * server-resolved props from one catalog snapshot, so the page never selects
 * products itself.
 */
export function ProductDetailView({
  product,
  category,
  related,
}: {
  product: CatalogItem;
  category: CatalogCategory | null;
  related: readonly CatalogItem[];
}) {
  const { t, pick, price } = useTranslation();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  /**
   * The confirmation is state, not a timer. It clears when the customer dismisses it, adds
   * again, or leaves the page - a panel that vanishes on its own can disappear mid-read and
   * would leave a keyboard user focused on a control that no longer exists.
   */
  const [justAdded, setJustAdded] = useState(false);

  const name = pick(product.name) ?? product.slug;
  const description = pick(product.description);
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);
  /**
   * Only struck through when the comparison price is genuinely higher than the
   * current price, so the page can never show a discount that does not exist.
   */
  const compareAt = saving === null ? null : product.compareAtPriceMinor;
  const image = product.images[0];
  /**
   * Availability is the owner's binary In Stock / Out of Stock state and the only ordering gate the
   * server reads (ADR 0013), so the purchase control follows it here. This is presentation only: the
   * order transaction re-checks `checkOrderability` from database state, so a tampered page still
   * cannot order an unavailable product. The control is removed rather than left clickable, because
   * a button that always fails is a worse answer than a stated reason.
   */
  const orderable = product.availability === 'in_stock';
  /** How many of this product the cart now holds, so the confirmation can state it. */
  const cartQuantity = cart.entries.find((entry) => entry.product.id === product.id)?.quantity ?? 0;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">{t('nav.home')}</Link>
          </li>
          {category && (
            <li>
              <Link href={`/categories/${category.slug}`}>{pick(category.name)}</Link>
            </li>
          )}
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <div className={styles.layout}>
        <div className={styles.media}>
          <figure className={styles.figure}>
            <ProductPhoto
              image={image}
              alt={pick(image?.alt) ?? name}
              sizes={DETAIL_SIZES}
              priority
              fallbackLabel={t('product.imagePlaceholder')}
            />
          </figure>
        </div>

        <div className={styles.info}>
          {product.brand && <p className={styles.brand}>{product.brand}</p>}
          <h1 className={styles.title}>{name}</h1>

          <p className={styles.pricing}>
            <span className={styles.currentPrice}>{price(product.priceMinor)}</span>
            {compareAt !== null && (
              <span className={styles.comparePrice}>
                <span className="sr-only">{t('product.wasPrice')}: </span>
                {price(compareAt)}
              </span>
            )}
          </p>
          {saving !== null && percent !== null && (
            <p className={styles.saving}>
              {t('product.save', { amount: price(saving) })} · -{percent}%
            </p>
          )}

          <dl className={styles.facts}>
            {product.brand && (
              <div>
                <dt>{t('product.brand')}</dt>
                <dd>{product.brand}</dd>
              </div>
            )}
            {product.pack && (
              <div>
                <dt>{t('product.pack')}</dt>
                <dd>{product.pack}</dd>
              </div>
            )}
            <div>
              <dt>{t('product.availabilityLabel')}</dt>
              <dd>{t(`product.availability.${product.availability}`)}</dd>
            </div>
          </dl>

          {orderable ? (
          <div className={styles.purchase}>
            <label className={styles.quantityLabel} htmlFor="pdp-quantity">
              {t('product.quantity')}
            </label>
            <div className={styles.purchaseRow}>
              <QuantityStepper
                id="pdp-quantity"
                value={quantity}
                max={cart.maxQuantity}
                onChange={setQuantity}
                label={t('product.quantity')}
                decreaseLabel={t('product.decrease')}
                increaseLabel={t('product.increase')}
              />
              <button
                type="button"
                className={styles.addButton}
                onClick={() => {
                  cart.addItem(product.id, quantity);
                  setJustAdded(true);
                }}
              >
                {t('product.addToCart')}
              </button>
            </div>

            {/*
              The live region is always mounted so a change is announced, and it carries the
              confirmation's text rather than a second copy of it: one announcement per add, and
              nothing announced on first paint. The panel below is the visible twin - same words,
              plus the two next steps the old 22px status line was missing.
            */}
            <p className={styles.liveRegion} role="status" aria-live="polite">
              {justAdded ? t('product.addedDetail', { name }) : ''}
            </p>

            {justAdded && (
              <div className={styles.confirmation}>
                <p className={styles.confirmationTitle}>
                  <CheckIcon width={16} height={16} />
                  {t('product.added')}
                </p>
                <p className={styles.confirmationDetail}>
                  {t('product.addedDetail', { name })}
                  {' '}
                  <span className={styles.confirmationCount}>
                    {cartQuantity === 1
                      ? t('cart.itemCountOne')
                      : t('cart.itemCount', { count: cartQuantity })}
                  </span>
                </p>
                <div className={styles.confirmationActions}>
                  <Link className={styles.confirmationPrimary} href="/cart">
                    {t('product.viewCart')}
                  </Link>
                  <button
                    type="button"
                    className={styles.confirmationSecondary}
                    onClick={() => setJustAdded(false)}
                  >
                    {t('product.continueShopping')}
                  </button>
                </div>
              </div>
            )}
          </div>
          ) : (
            <div className={styles.unavailable} role="status">
              <p className={styles.unavailableTitle}>
                {product.availability === 'out_of_stock'
                  ? t('product.availability.out_of_stock')
                  : t('product.availability.unknown')}
              </p>
              <p className={styles.unavailableBody}>
                {product.availability === 'out_of_stock'
                  ? t('product.unavailableBody')
                  : t('product.availabilityUnknownBody')}
              </p>
              <Link className={styles.secondaryAction} href="/products">
                {t('footer.allProducts')}
              </Link>
            </div>
          )}

          <section className={styles.details} aria-labelledby="details-title">
            <h2 id="details-title">{t('product.details')}</h2>
            <p className={description ? styles.description : styles.descriptionMissing}>
              {description ?? t('product.noDescription')}
            </p>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className={styles.related} aria-labelledby="related-title">
          <h2 id="related-title">{t('product.related')}</h2>
          <ProductGrid>
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </ProductGrid>
        </section>
      )}
    </div>
  );
}
