'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogBrand } from '@/lib/types';
import { SearchIcon } from '@/components/icons';
import { BrandMark } from '@/components/DiscoveryPhoto';
import styles from '@/features/catalog/CategoriesView.module.css';

/**
 * The brand index: every brand the shop carries, as a filterable grid of marks.
 *
 * The tile is the brand's own logo where the shop has verified one, and its initials otherwise. The
 * fallback is stated in the page's own sentence rather than hidden, because a shopper who sees two
 * initials should know it means "this shop has no logo for this brand", not "this brand is broken".
 *
 * **The filter is client-side on purpose.** The whole list is a few hundred small records that the
 * page already has in order to render the grid; a server round trip per keystroke would make typing
 * feel worse and add a request for data already on screen. It filters nothing else - the counts still
 * come from the server's snapshot.
 */
export function BrandIndexView({ brands }: { brands: readonly CatalogBrand[] }) {
  const { t, pick } = useTranslation();
  const [needle, setNeedle] = useState('');

  const filtered = useMemo(() => {
    const query = needle.trim().toLowerCase();
    if (query === '') return brands;
    return brands.filter((brand) => (pick(brand.name) ?? brand.slug).toLowerCase().includes(query));
  }, [brands, needle, pick]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('categories.brandIntroTitle')}</h1>
      </header>

      <section aria-label={t('categories.brandIntroTitle')} className={styles.section}>
        <div className={styles.brandFilter}>
          <label className="sr-only" htmlFor="brand-index-filter">
            {t('categories.searchBrandLabel')}
          </label>
          <span className={styles.brandFilterIcon} aria-hidden="true">
            <SearchIcon width={16} height={16} />
          </span>
          <input
            id="brand-index-filter"
            type="search"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder={t('categories.searchBrandPlaceholder')}
            autoComplete="off"
            maxLength={60}
          />
        </div>

        {filtered.length === 0 ? (
          <p className={styles.brandEmpty}>{t('categories.brandEmpty')}</p>
        ) : (
          <ul className={styles.brandGrid}>
            {filtered.map((brand) => (
              <li key={brand.id} className={styles.brandItem}>
                <Link className={styles.brandTile} href={`/brands/${brand.slug}`}>
                  <BrandMark
                    logoKey={brand.logoKey}
                    name={pick(brand.name) ?? brand.slug}
                    sizes="(max-width: 599px) 22vw, 120px"
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
        )}
      </section>
    </div>
  );
}
