'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { CIRCLE_RAIL_SIZES } from '@/lib/images';
import type { CatalogCategory } from '@/lib/types';
import { Carousel } from '@/components/Carousel';
import { DiscoveryPhoto } from '@/components/DiscoveryPhoto';
import { LetterMark } from '@/components/LetterMark';
import { RAIL_MOBILE_LIMIT } from './rail-limits';
import { SeeAllCircle } from './SeeAllCircle';
import styles from './CategoryCircleRail.module.css';

/**
 * The homepage's circular category carousel.
 *
 * **The circle is the requirement.** A horizontal rail of *circular* photographs - a square wrapper
 * cropped by `border-radius: 50%`, the photograph filling it with `object-fit: cover` - with the
 * name beneath it and the owner's one-line tagline under the name. This is deliberately not the
 * square tiles the `/categories` index uses: the homepage answers "where do I start?", the index
 * answers "what is everything?".
 *
 * **The hover is drawn inside the circle.** It used to be a 2px ring at a 2px offset plus a 2px lift,
 * which a scroll container clipped on the cross axis - the ring was visibly cut off at the top and
 * bottom of the rail. The treatment is now a border change on the circle's own box, a gentle zoom of
 * the photograph clipped by the circle, and nothing outside the tile.
 *
 * The category photograph is already square (the asset pipeline generates 1:1 masters), so the circle
 * costs no new asset and crops nothing the owner did not choose. A department with no photograph
 * draws its icon glyph inside a tinted circle, so one missing image cannot break the rail's rhythm.
 *
 * **The rail is a carousel at every width, and it ends with the way out** (owner direction,
 * 2026-11-12). Twenty circles on a desktop, fifteen on a phone; when the shop has more departments
 * than the phone draws, the last circle is `SeeAllCircle` -> `/categories`. A shop with five
 * departments shows five and no control, because there is nothing behind it.
 */
export function CategoryCircleRail({
  categories,
  hasMore,
}: {
  categories: readonly CatalogCategory[];
  /** The shop has more departments than the phone rail draws - see `home-selection.ts`. */
  hasMore: boolean;
}) {
  const { t, pick } = useTranslation();
  return (
    <Carousel
      label={t('home.categoriesTitle')}
      size="circle"
      mobileLimit={RAIL_MOBILE_LIMIT}
      controls="pager"
    >
      {categories.map((category) => {
        const name = pick(category.name) ?? category.slug;
        return (
          <Link key={category.id} className={styles.link} href={`/categories/${category.slug}`}>
            <span className={styles.circle} aria-hidden="true">
              <DiscoveryPhoto
                imageKey={category.imageKey}
                alt=""
                sizes={CIRCLE_RAIL_SIZES}
                className={styles.photo}
                fallback={<LetterMark name={name} />}
              />
            </span>
            <span className={styles.name}>{name}</span>
          </Link>
        );
      })}
      {hasMore && <SeeAllCircle href="/categories" />}
    </Carousel>
  );
}
