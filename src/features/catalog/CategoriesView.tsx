'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import { CategoryIcon } from '@/components/icons';
import styles from './CategoriesView.module.css';

/**
 * The category index.
 *
 * This route exists because the phone lost its drawer (2026-10-23): the bottom bar's Categories tab needs
 * somewhere to land, and a shop with five departments deserves a page that shows all five rather than a
 * dropdown. It is the same catalog snapshot the header and homepage read, so a category can never be
 * listed here and be missing there.
 *
 * **Layout revised 2026-10-23.** A phone used to show two cards per row, each holding a 44px icon, a
 * name, a two-to-three line blurb and "12 products" in 139px of inner width. The count and the text
 * overlapped and the blurbs broke mid-word, which is the broken box the owner reported. A phone now gets
 * one full-width row per department - the shape the content actually has - and the count shares the name's
 * line so it can never collide with the blurb. Two columns return at 720px, where the same card has room.
 *
 * On desktop the lead card spans two of three tracks. The catalog has an odd number of categories, so
 * letting the lead card take the extra track is what keeps every row complete instead of ending on one
 * stranded card. That is decoration free: it is the same reason the product grid lets a lone card take
 * the row, and it is switched off on a phone where every card is already full width.
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
        <p className={styles.body}>{t('categories.body')}</p>
      </header>

      <ul className={styles.grid}>
        {categories.map((category, index) => {
          const count = counts[category.slug] ?? 0;
          return (
            <li key={category.id} className={styles.item} data-lead={index === 0 ? 'true' : undefined}>
              <Link className={styles.card} href={`/categories/${category.slug}`}>
                <span className={styles.icon} aria-hidden="true">
                  <CategoryIcon name={category.icon} width={26} height={26} />
                </span>
                <span className={styles.text}>
                  <span className={styles.heading}>
                    <span className={styles.name}>{pick(category.name)}</span>
                    <span className={styles.count}>
                      {count === 1 ? t('categories.countOne') : t('categories.count', { count })}
                    </span>
                  </span>
                  <span className={styles.blurb}>{pick(category.blurb)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className={styles.footnote}>
        <Link href="/products">{t('categories.allProducts')}</Link>
      </p>
    </div>
  );
}
