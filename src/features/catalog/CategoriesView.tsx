'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CATEGORY_TILE_SIZES } from '@/lib/images';
import type { CatalogCategory } from '@/lib/types';
import { DiscoveryPhoto } from '@/components/DiscoveryPhoto';
import { LetterMark } from '@/components/LetterMark';
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
  /*
   * The index is a list of **departments**, not of every category. A subcategory is reached through
   * its parent's page, so drawing it here too would present the same shelf twice and make a child
   * look like a second top-level department. A child whose parent is no longer visible (for example a
   * hidden parent) is kept here rather than becoming unreachable.
   */
  const presentIds = new Set(categories.map((category) => category.id));
  const roots = categories.filter(
    (category) => category.parentId === null || !presentIds.has(category.parentId),
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('categories.title')}</h1>
      </header>

      <section aria-label={t('categories.title')} className={styles.section}>
        <ul className={styles.tileGrid}>
          {roots.map((category) => {
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
                      fallback={<LetterMark name={name} />}
                    />
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileName}>{name}</span>
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

    </div>
  );
}