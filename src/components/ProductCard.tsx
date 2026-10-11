'use client';

import Link from 'next/link';
import { CARD_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { Product } from '@/lib/types';
import { ProductPhoto } from './ProductPhoto';
import styles from './ProductCard.module.css';

/**
 * Product card. Only verified facts are shown: name, brand, pack size, price
 * hierarchy and published availability. No ratings, badges or urgency claims.
 */
export function ProductCard({ product }: { product: Product }) {
  const { t, pick, price } = useTranslation();
  const name = pick(product.name) ?? product.slug;
  const image = product.images[0];
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);

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
          {product.compareAtPriceMinor !== null && (
            <span className={styles.compare}>{price(product.compareAtPriceMinor)}</span>
          )}
        </p>

        {saving !== null && percent !== null && (
          <p className={styles.saving}>
            {t('product.save', { amount: price(saving) })}
            <span className={styles.percent}> · -{percent}%</span>
          </p>
        )}

        {product.availability === 'unknown' && (
          <p className={styles.availability}>{t('product.availability.unknown')}</p>
        )}
      </div>
    </article>
  );
}
