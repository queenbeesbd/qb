'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CATEGORY_TILE_SIZES } from '@/lib/images';
import type { CatalogCategory } from '@/lib/types';
import { CategoryIcon } from '@/components/icons';
import { DiscoveryPhoto } from '@/components/DiscoveryPhoto';
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
 * **Brands are not on this page (owner decision, 2026-11-02).** They used to be a teaser grid here as
 * well as a page of their own, which made "where do I browse from?" a question the shopper had to
 * answer before they knew what either held. Brands now have one surface - `/brands`, in the header,
 * in the phone tab bar and in the footer - and this page answers one question: what departments does
 * the shop hold? The footnote still points at the brand index, so nothing is a dead end.
 */
export function CategoriesView({
  categories,
  counts,
}: {
  categories: readonly CatalogCategory[];
  /** Products per category slug, derived from the same catalog the cards link into. */
  counts: Readonly<Record<string, number>>;
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
                      className={styles.tileImage}
                      fallback={
                        <span className={styles.tileGlyph}>
                          <CategoryIcon name={category.icon} width={30} height={30} />
                        </span>
                      }
                    />
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileName}>{name}</span>
                    {category.tagline !== null && (
                      <span className={styles.tileTagline}>{category.tagline}</span>
                    )}
                    <span className={styles.tileCountLabel}>
                      {count === 1 ? t('categories.countOne') : t('categories.count', { count })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>


      <p className={styles.footnote}>
        <Link href="/products">{t('categories.allProducts')}</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/brands">{t('nav.brands')}</Link>
      </p>
    </div>
  );
}