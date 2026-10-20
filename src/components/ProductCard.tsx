'use client';

import Link from 'next/link';
import { CARD_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogItem } from '@/lib/types';
import { ProductPhoto } from './ProductPhoto';
import styles from './ProductCard.module.css';

/**
 * Product card. Only verified facts are shown: name, brand, pack size, price
 * hierarchy and published availability. No ratings, badges or urgency claims.
 */
export function ProductCard({ product }: { product: CatalogItem }) {
  const { t, pick, price } = useTranslation();
  const name = pick(product.name) ?? product.slug;
  const image = product.images[0];
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);
  /**
   * Only struck through when the comparison price is genuinely higher than the
   * current price, so the card can never show a discount that does not exist.
   */
  const compareAt = saving === null ? null : product.compareAtPriceMinor;

  return (
    <article className={styles.card}>
      <Link href={`/products/${product.slug}`} className={styles.imageLink} tabIndex={-1} aria-hidden="true">
        <ProductPhoto
          image={image}
          alt=""
          sizes={CARD_SIZES}
          className={styles.photo}
          fallbackLabel={t('product.imagePlaceholder')}
        />
      </Link>

      <div className={styles.body}>
        {product.brand && <p className={styles.brand}>{product.brand}</p>}
        <h3 className={styles.title}>
          <Link href={`/products/${product.slug}`}>{name}</Link>
        </h3>
        {product.pack && <p className={styles.pack}>{product.pack}</p>}

        <p className={styles.pricing}>
          <span className={styles.current}>{price(product.priceMinor)}</span>
          {compareAt !== null && (
            <span className={styles.compare}>
              <span className="sr-only">{t('product.wasPrice')}: </span>
              {price(compareAt)}
            </span>
          )}
        </p>

        {saving !== null && percent !== null && (
          <p className={styles.saving}>
            {t('product.save', { amount: price(saving) })}
            <span className={styles.percent}> · -{percent}%</span>
          </p>
        )}

        {/*
          Availability is the owner's binary state, so it is stated on the card rather than only on
          the product page: a customer must be able to see an unavailable product *before* opening
          it or adding it to the cart. An unverified state is stated too, never guessed.
        */}
        {product.availability === 'out_of_stock' && (
          <p className={styles.outOfStock}>{t('product.availability.out_of_stock')}</p>
        )}
        {product.availability === 'unknown' && (
          <p className={styles.availability}>{t('product.availability.unknown')}</p>
        )}
      </div>
    </article>
  );
}
