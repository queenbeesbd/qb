'use client';

import Link from 'next/link';
import { CARD_FRAME, CARD_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogItem } from '@/lib/types';
import { ProductPhoto } from './ProductPhoto';
import styles from './ProductCard.module.css';

/**
 * Product card. Only verified facts are shown: name, brand, pack size, price
 * hierarchy and published availability. No ratings, badges or urgency claims.
 */
export function ProductCard({
  product,
  /** Frame and source-size hints, so the listing can use a taller crop than the homepage rows. */
  frame = CARD_FRAME,
  sizes = CARD_SIZES,
}: {
  product: CatalogItem;
  frame?: string;
  sizes?: string;
}) {
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
    <article className={styles.card} data-availability={product.availability}>
      <Link href={`/products/${product.slug}`} className={styles.imageLink} tabIndex={-1} aria-hidden="true">
        <ProductPhoto
          image={image}
          alt=""
          sizes={sizes}
          className={styles.photo}
          fallbackLabel={t('product.imagePlaceholder')}
          frame={frame}
        />
        {saving !== null && percent !== null && (
          /* The percentage is derived from the two stored prices. It is decoration here: the saving
             line below carries the same fact as text for assistive technology. */
          <span className={styles.discount} aria-hidden="true">
            −{percent}%
          </span>
        )}
      </Link>

      <div className={styles.body}>
        {/*
          Every optional line keeps its row, even when it is empty.
          
          A catalogue is read across a row: one card whose price sits a line higher because it has
          no brand, or whose saving is missing, makes the whole grid look misaligned. Reserving the
          row is what keeps the price, the saving and the availability on the same baselines from
          card to card. The filler is a non-breaking space with aria-hidden, never invented content.
        */}
        <p className={styles.brand} aria-hidden={product.brand ? undefined : true}>
          {product.brand ?? '\u00A0'}
        </p>
        <h3 className={styles.title}>
          <Link href={`/products/${product.slug}`}>{name}</Link>
        </h3>
        <p className={styles.pack} aria-hidden={product.pack ? undefined : true}>
          {product.pack ?? '\u00A0'}
        </p>

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
