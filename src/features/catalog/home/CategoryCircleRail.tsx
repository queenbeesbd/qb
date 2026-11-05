'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { CIRCLE_RAIL_SIZES } from '@/lib/images';
import type { CatalogCategory } from '@/lib/types';
import { CategoryIcon } from '@/components/icons';
import { Carousel } from '@/components/Carousel';
import { DiscoveryPhoto } from '@/components/DiscoveryPhoto';
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
 */
export function CategoryCircleRail({ categories }: { categories: readonly CatalogCategory[] }) {
  const { t, pick } = useTranslation();
  return (
    <Carousel label={t('home.categoriesTitle')} size="circle">
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
                fallback={
                  <span className={styles.glyph}>
                    <CategoryIcon name={category.icon} width={30} height={30} />
                  </span>
                }
              />
            </span>
            <span className={styles.name}>{name}</span>
          </Link>
        );
      })}
    </Carousel>
  );
}
