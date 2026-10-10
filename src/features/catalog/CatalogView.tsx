'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { products } from '@/data/catalog';
import { categories } from '@/data/categories';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { SearchIcon } from '@/components/icons';
import {
  SORT_OPTIONS,
  listBrands,
  selectCatalog,
  type CatalogQuery,
  type SortOption,
} from './query';
import styles from '@/app/catalog.module.css';

const SORT_LABEL_KEYS: Record<SortOption, TranslationKey> = {
  relevance: 'catalog.sortRelevance',
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
  'name-asc': 'catalog.sortNameAsc',
};

/**
 * Catalog browser. Search, category, brand and sort all compose into a single
 * query so filters can never disagree with each other, and every change is
 * written to the URL for back/forward support.
 */
export function CatalogView({ query }: { query: CatalogQuery }) {
  const { t, pick } = useTranslation();
  const router = useRouter();
  const brands = useMemo(() => listBrands(products), []);
  const results = useMemo(() => selectCatalog(products, query), [query]);
  const [term, setTerm] = useState(query.q);

  const hasFilters = Boolean(query.q || query.category || query.brand || query.sort !== 'relevance');

  function push(next: Partial<CatalogQuery>) {
    const merged: CatalogQuery = { ...query, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    if (merged.category) params.set('category', merged.category);
    if (merged.brand) params.set('brand', merged.brand);
    if (merged.sort !== 'relevance') params.set('sort', merged.sort);
    const search = params.toString();
    router.push(search ? `/products?${search}` : '/products');
  }

  const activeCategory = categories.find((category) => category.id === query.category);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{query.q ? t('search.resultsFor', { query: query.q }) : t('catalog.title')}</h1>
          <p className={styles.count} aria-live="polite">
            {t('catalog.count', { count: results.length })}
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.filters} aria-label={t('catalog.filters')}>
          <form
            className={styles.searchForm}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              push({ q: term.trim() });
            }}
          >
            <label className="sr-only" htmlFor="catalog-search">
              {t('search.label')}
            </label>
            <div className={styles.searchField}>
              <input
                id="catalog-search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t('search.placeholder')}
                autoComplete="off"
                maxLength={80}
              />
              <button type="submit" aria-label={t('search.submit')}>
                <SearchIcon width={18} height={18} />
              </button>
            </div>
            {query.q && (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setTerm('');
                  push({ q: '' });
                }}
              >
                {t('search.clear')}
              </button>
            )}
          </form>

          <fieldset className={styles.fieldset}>
            <legend>{t('catalog.filterCategory')}</legend>
            <ul className={styles.filterList}>
              <li>
                <button
                  type="button"
                  className={!query.category ? styles.filterActive : styles.filterButton}
                  aria-pressed={!query.category}
                  onClick={() => push({ category: '' })}
                >
                  {t('catalog.allCategories')}
                </button>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    className={
                      query.category === category.id ? styles.filterActive : styles.filterButton
                    }
                    aria-pressed={query.category === category.id}
                    onClick={() => push({ category: category.id })}
                  >
                    {pick(category.name)}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{t('catalog.filterBrand')}</legend>
            <ul className={styles.filterList}>
              <li>
                <button
                  type="button"
                  className={!query.brand ? styles.filterActive : styles.filterButton}
                  aria-pressed={!query.brand}
                  onClick={() => push({ brand: '' })}
                >
                  {t('catalog.allBrands')}
                </button>
              </li>
              {brands.map((brand) => (
                <li key={brand}>
                  <button
                    type="button"
                    className={query.brand === brand ? styles.filterActive : styles.filterButton}
                    aria-pressed={query.brand === brand}
                    onClick={() => push({ brand })}
                  >
                    {brand}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>

          {hasFilters && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => {
                setTerm('');
                router.push('/products');
              }}
            >
              {t('catalog.clearFilters')}
            </button>
          )}
        </aside>

        <div className={styles.results}>
          <div className={styles.toolbar}>
            <div className={styles.activeFilters}>
              {activeCategory && (
                <span className={styles.chip}>{pick(activeCategory.name)}</span>
              )}
              {query.brand && <span className={styles.chip}>{query.brand}</span>}
            </div>
            <label className={styles.sortLabel} htmlFor="catalog-sort">
              <span>{t('catalog.sort')}</span>
              <select
                id="catalog-sort"
                value={query.sort}
                onChange={(event) => push({ sort: event.target.value as SortOption })}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(SORT_LABEL_KEYS[option])}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {results.length > 0 ? (
            <ProductGrid>
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ProductGrid>
          ) : (
            <div className={styles.empty}>
              <h2>{query.q ? t('search.noResultsTitle') : t('catalog.emptyTitle')}</h2>
              <p>{query.q ? t('search.noResultsBody') : t('catalog.emptyBody')}</p>
              <Link className={styles.emptyAction} href="/products">
                {t('footer.allProducts')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
