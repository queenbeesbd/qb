'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { products } from '@/data/catalog';
import { getCategory } from '@/data/categories';
import { DETAIL_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { demoCatalogMeta } from '@/data/catalog';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { QuantityStepper } from '@/components/QuantityStepper';
import { ProductPhoto } from '@/components/ProductPhoto';
import { CheckIcon, InfoIcon } from '@/components/icons';
import styles from '@/app/product.module.css';

/**
 * Product detail view. Only verified attributes are displayed; unpublished
 * descriptions and missing stock data are stated plainly instead of being
 * filled with invented copy.
 */
export function ProductDetailView({ product }: { product: (typeof products)[number] }) {
  const { t, pick, price, locale } = useTranslation();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(false), 2500);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const name = pick(product.name) ?? product.slug;
  const description = pick(product.description);
  const category = getCategory(product.categoryId);
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);
  /**
   * Only struck through when the comparison price is genuinely higher than the
   * current price, so the page can never show a discount that does not exist.
   */
  const compareAt = saving === null ? null : product.compareAtPriceMinor;
  const image = product.images[0];

  const related = products
    .filter((item) => item.categoryId === product.categoryId && item.id !== product.id)
    .slice(0, 4);

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

          <p className={styles.availabilityNote}>
            <InfoIcon width={16} height={16} />
            {t('product.availabilityNote', {
              date: formatDate(demoCatalogMeta.capturedAt, locale),
            })}
          </p>

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
            <p className={styles.liveRegion} role="status" aria-live="polite">
              {justAdded ? (
                <>
                  <CheckIcon width={16} height={16} /> {t('product.added')}
                </>
              ) : (
                ''
              )}
            </p>
          </div>

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
