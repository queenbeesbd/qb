'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { BRAND_RAIL_SIZES } from '@/lib/images';
import type { CatalogBrand } from '@/lib/types';
import { Carousel } from '@/components/Carousel';
import { brandInitials, DiscoveryPhoto } from '@/components/DiscoveryPhoto';
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
 * A brand the shop has no logo for draws its initials inside the same circle, derived from the stored
 * name and never invented, so one missing logo cannot break the rail's rhythm. The count comes from
 * the same snapshot the tile links into.
 */
export function BrandCircleRail({ brands }: { brands: readonly CatalogBrand[] }) {
  const { t, pick } = useTranslation();
  return (
    <Carousel label={t('home.brandTitle')} size="circle">
      {brands.map((brand) => {
        const name = pick(brand.name) ?? brand.slug;
        return (
          <Link key={brand.id} className={styles.link} href={`/brands/${brand.slug}`}>
            <span className={styles.circle} aria-hidden="true">
              <DiscoveryPhoto
                imageKey={brand.logoKey}
                alt=""
                sizes={BRAND_RAIL_SIZES}
                className={styles.logo}
                fallback={<span className={styles.initials}>{brandInitials(name) || '·'}</span>}
              />
            </span>
            <span className={styles.name}>{name}</span>
          </Link>
        );
      })}
    </Carousel>
  );
}
