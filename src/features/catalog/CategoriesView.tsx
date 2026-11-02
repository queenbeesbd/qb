'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CATEGORY_TILE_SIZES } from '@/lib/images';
import type { CatalogBrand, CatalogCategory } from '@/lib/types';
import { CategoryIcon } from '@/components/icons';
import { BrandMark, DiscoveryPhoto } from '@/components/DiscoveryPhoto';
import styles from './CategoriesView.module.css';

/**
 * The category index, rebuilt as a picture grid.
 *
 * **Why pictures.** The previous version was a list of names with an icon and a sentence: accurate,
 * and no way to tell at a glance that the shop sells five different kinds of makeup. A square
 * photograph per department is the pattern every grocery and beauty shop uses for the same reason -
 * a shopper recognises a photograph before they read a word.
 *
 * **The tiles are square at every width** (2 columns on a phone, up to 5 on a desktop), so the grid
 * scans in rows instead of chasing cards of different heights. A department with no photograph draws
 * its icon instead, in the same square, so one missing image cannot break the grid.
 *
 * **Brands live here too.** Discovery is one question - "what does this shop have?" - and splitting
 * departments and brands across two routes made a shopper choose which way to browse before they knew
 * what either held. The brand block is a filterable logo grid under the departments, and the same
 * content also has its own address at `/brands` for a direct link.
 */
export function CategoriesView({
  categories,
  counts,
  brands,
}: {
  categories: readonly CatalogCategory[];
  /** Products per category slug, derived from the same catalog the cards link into. */
  counts: Readonly<Record<string, number>>;
  brands: readonly CatalogBrand[];
}) {
  const { t, pick } = useTranslation();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('categories.title')}</h1>
        <p className={styles.body}>{t('categories.indexBody')}</p>
      </header>

      <section aria-labelledby="departments-title" className={styles.section}>
        <h2 id="departments-title" className={styles.sectionTitle}>
          {t('categories.departments')}
        </h2>
        <ul className={styles.tileGrid}>
          {categories.map((category) => {
            const count = counts[category.slug] ?? 0;
            const name = pick(category.name) ?? category.slug;
            return (
              <li key={category.id} className={styles.tileItem}>
                <Link className={styles.tile} href={`/categories/${category.slug}`} aria-label={t('categories.viewProducts', { name })}>
                  <span className={styles.tilePhoto}>
                    <DiscoveryPhoto
                      imageKey={category.imageKey}
                      alt=""
                      sizes={CATEGORY_TILE_SIZES}
                      fallback={
                        <span className={styles.tileGlyph}>
                          <CategoryIcon name={category.icon} width={30} height={30} />
                        </span>
                      }
                    />
                    {count > 0 && (
                      <span className={styles.tileCount} aria-hidden="true">
                        {count}
                      </span>
                    )}
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileName}>{name}</span>
                    {category.tagline !== null ? (
                      <span className={styles.tileTagline}>{category.tagline}</span>
                    ) : (
                      <span className={styles.tileCountLabel}>
                        {count === 1 ? t('categories.countOne') : t('categories.count', { count })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {brands.length > 0 && (
        <section aria-labelledby="brands-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="brands-title" className={styles.sectionTitle}>
                {t('categories.brandTitle')}
              </h2>
              <p className={styles.sectionBody}>{t('categories.brandBody')}</p>
            </div>
            <Link className={styles.viewAll} href="/brands">
              {t('home.brandsAll')}
            </Link>
          </div>

          {/*
            A **teaser**, not the whole list. The shop carries over two hundred brands; printing them
            all here made the index a 14,000px page whose brand half was 60 rows of 60px tiles. This
            block shows the twelve busiest - the ones a shopper is most likely to be looking for - and
            the section's own link opens the full, filterable index.
          */}
          <ul className={styles.brandGrid}>
            {brands.slice(0, 12).map((brand) => (
              <li key={brand.id} className={styles.brandItem}>
                <Link className={styles.brandTile} href={`/brands/${brand.slug}`}>
                  <BrandMark
                    logoKey={brand.logoKey}
                    name={pick(brand.name) ?? brand.slug}
                    slug={brand.slug}
                    sizes="(max-width: 599px) 28vw, 120px"
                  />
                  <span className={styles.brandName}>{pick(brand.name) ?? brand.slug}</span>
                  <span className={styles.brandCount}>
                    {brand.productCount === 1
                      ? t('categories.brandCountOne')
                      : t('categories.brandCount', { count: brand.productCount })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.footnote}>
        <Link href="/products">{t('categories.allProducts')}</Link>
      </p>
    </div>
  );
}