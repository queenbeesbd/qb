'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CARD_FRAME, CARD_SIZES } from '@/lib/images';
import { discountAmount, discountPercent } from '@/lib/money';
import { formatRating } from '@/lib/rating';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogItem } from '@/lib/types';
import { useCart } from '@/features/cart/useCart';
import { announceCartAdd } from '@/features/cart/cart-feedback';
import { CartIcon } from './icons';
import { ProductPhoto } from './ProductPhoto';
import { RatingStars } from './RatingStars';
import styles from './ProductCard.module.css';

/**
 * Product card. Only verified facts are shown: name, brand, pack size, price
 * hierarchy and published availability. No ratings, badges or urgency claims.
 */
export function ProductCard({
  product,
  frame = CARD_FRAME,
  sizes = CARD_SIZES,
  addToCart = false,
}: {
  product: CatalogItem;
  /** The card's photo frame. One measurement everywhere; see `CARD_FRAME`. */
  frame?: string;
  sizes?: string;
  /**
   * Draw the card's own "Add to cart" control. Homepage shelves and the catalog listing ask for it;
   * related products on a product page do not, because there the page's own buy action is already
   * on screen.
   */
  addToCart?: boolean;
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
          {/*
            The brand and the title are separate links to separate places: the eyebrow goes to the
            brand's own page, the title to the product. A card that only ever led to the product made
            "shop by brand" a dead end.
          */}
          {product.brand === null ? (
            '\u00A0'
          ) : product.brandSlug === null ? (
            product.brand
          ) : (
            <Link href={`/brands/${product.brandSlug}`} tabIndex={-1}>
              {product.brand}
            </Link>
          )}
        </p>
        <h3 className={styles.title}>
          <Link href={`/products/${product.slug}`}>{name}</Link>
        </h3>
        {/*
          The pack size and the shop's rating share one reserved line: the rating costs the card no
          height, so a row of five cards keeps its price baselines whether one product is rated or
          none is. The stars are the owner's own claim (ADR 0035), drawn only when a rating exists -
          never an empty row, never a zero.
        */}
        <p
          className={styles.packRow}
          aria-hidden={product.pack !== null || product.ratingHalves !== null ? undefined : true}
        >
          <span className={styles.pack}>{product.pack ?? '\u00A0'}</span>
          {product.ratingHalves !== null && (
            <RatingStars
              halves={product.ratingHalves}
              label={t('product.ratingAria', { rating: formatRating(product.ratingHalves) })}
            />
          )}
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

        {addToCart && (
          <div className={styles.buyRow}>
            <AddToCartButton product={product} />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The card's own add-to-cart control.
 *
 * Three honest states, and no fourth:
 *
 * 1. **In stock** - one tap adds a single unit and the label confirms it for a moment. Nothing is sent
 *    to the server here; the cart is browser state and checkout recomputes the price.
 * 2. **Out of stock** - the control is disabled and says so, because an out-of-stock product cannot be
 *    ordered (D19). It is never hidden: the customer must be able to see that the product exists and
 *    that it cannot be bought right now.
 * 3. **Unknown** - likewise disabled; the shop does not guess.
 *
 * The confirmation is text, not colour, and it reverts on its own so the button never claims a state it
 * is no longer in. The timer is cleared on unmount, so a fast scroll cannot leave a stray update.
 */
function AddToCartButton({ product }: { product: CatalogItem }) {
  const { t } = useTranslation();
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const available = product.availability === 'in_stock';

  return (
    <button
      type="button"
      className={styles.buy}
      data-state={added ? 'added' : undefined}
      disabled={!available}
      aria-label={
        available
          ? `${t('product.addToCart')}: ${product.name.en ?? product.slug}`
          : `${t('product.availability.unavailable')}: ${product.name.en ?? product.slug}`
      }
      onClick={() => {
        if (!available) return;
        addItem(product.id);
        /* The shared confirmation, plus the label's own brief state for the tap that was just made. */
        announceCartAdd(product.name.en ?? product.slug);
        setAdded(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setAdded(false), 1600);
      }}
    >
      <CartIcon width={16} height={16} />
      <span>
        {!available
          ? t('product.availability.unavailable')
          : added
            ? t('product.added')
            : t('product.addToCart')}
      </span>
    </button>
  );
}
