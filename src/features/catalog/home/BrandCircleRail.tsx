'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { BRAND_RAIL_SIZES } from '@/lib/images';
import type { CatalogBrand } from '@/lib/types';
import { Carousel } from '@/components/Carousel';
import { DiscoveryPhoto } from '@/components/DiscoveryPhoto';
import { LetterMark } from '@/components/LetterMark';
import { RAIL_MOBILE_LIMIT } from './rail-limits';
import { SeeAllCircle } from './SeeAllCircle';
import styles from './BrandCircleRail.module.css';

/**
 * The homepage's circular brand carousel.
 *
 * **The same circle the category rail draws** (owner direction, 2026-11-05): a round box, the mark
 * inside it, the name beneath and the product count under the name. The category rail answers "where
 * do I start?"; this one answers "who makes what I buy here?", and the owner asked for the same
 * presentation rather than a second card vocabulary on the same page.
 *
 * **The circle frames a logo, it does not crop one.** A brand mark is a favicon-derived square
 * usually drawn to the edges of its own canvas, so the tile insets it and the image is rendered with
 * `object-fit: contain` - a circle that cropped a wordmark would cut the name in half. The box keeps
 * a white surface underneath for the same reason: a transparent favicon needs something to sit on.
 *
 * A brand the shop has no logo for draws a **single-letter monogram** in the same circle, on a pale
 * plate chosen from the brand's own slug. One letter at display size reads as a deliberate mark; two
 * initials in a 100px circle read as truncated text, which is what the rail looked like before
 * (owner feedback, 2026-11-05). The letter is the first character of the stored name and is never
 * invented. The count comes from the same snapshot the tile links into.
 *
 * **Twenty brands on a desktop, fifteen on a phone, then the way out** (owner direction, 2026-11-12).
 * When the shop has more brands than the phone draws, the last circle is `SeeAllCircle` -> `/brands`;
 * a shop with fewer shows them all and no control.
 */
export function BrandCircleRail({
  brands,
  hasMore,
}: {
  brands: readonly CatalogBrand[];
  /** The shop has more brands than the phone rail draws - see `home-selection.ts`. */
  hasMore: boolean;
}) {
  const { t, pick } = useTranslation();
  return (
    <Carousel
      label={t('home.brandTitle')}
      size="circle"
      mobileLimit={RAIL_MOBILE_LIMIT}
      controls="pager"
    >
      {brands.map((brand) => {
        const name = pick(brand.name) ?? brand.slug;
        return (
          <Link key={brand.id} className={styles.link} href={`/brands/${brand.slug}`}>
            <span
              className={styles.circle}
              aria-hidden="true"
            >
              {brand.logoKey === null ? (
                <LetterMark name={name} />
              ) : (
                <DiscoveryPhoto
                  imageKey={brand.logoKey}
                  alt=""
                  sizes={BRAND_RAIL_SIZES}
                  className={styles.logo}
                />
              )}
            </span>
            <span className={styles.name}>{name}</span>
          </Link>
        );
      })}
      {hasMore && <SeeAllCircle href="/brands" />}
    </Carousel>
  );
}
