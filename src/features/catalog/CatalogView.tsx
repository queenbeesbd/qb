'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { FilterIcon, SearchIcon } from '@/components/icons';
import { SORT_OPTIONS, type CatalogQuery, type SortOption } from './query';
import styles from '@/app/catalog.module.css';

const SORT_LABEL_KEYS: Record<SortOption, TranslationKey> = {
  relevance: 'catalog.sortRelevance',
  'price-asc': 'catalog.sortPriceAsc',
  'price-desc': 'catalog.sortPriceDesc',
  'name-asc': 'catalog.sortNameAsc',
};

/**
 * The page numbers to offer: first, last, the current one and its neighbours, with a gap for the
 * middle. A 31-page catalog still shows seven controls instead of thirty-one.
 */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const wanted = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => wanted.add(page));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((page) => wanted.add(page));

  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const window: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of pages) {
    if (previous !== 0 && page - previous > 1) window.push('gap');
    window.push(page);
    previous = page;
  }
  return window;
}

/**
 * Catalog browser. Search, category, brand and sort all compose into a single
 * query so filters can never disagree with each other, and every change is
 * written to the URL for back/forward support.
 *
 * Every value it renders - the result set, the brand list and the categories -
 * arrives as a server-resolved prop derived from one catalog snapshot, so the
 * view never selects products itself and can never disagree with the server.
 */
export function CatalogView({
  results,
  brands,
  categories,
  query,
  totalCount,
  matchCount,
  page,
  pageCount,
}: {
  results: readonly CatalogItem[];
  brands: readonly string[];
  categories: readonly CatalogCategory[];
  query: CatalogQuery;
  totalCount: number;
  /** How many products match the query in total, across every page. */
  matchCount: number;
  page: number;
  pageCount: number;
}) {
  const { t, pick } = useTranslation();
  const router = useRouter();
  const [term, setTerm] = useState(query.q);
  /**
   * The filter panel is collapsed on a phone, always.
   *
   * Measured: the category and brand chips filled the entire first screen at 390px, so the first product
   * began below the fold on a page whose whole purpose is to show products. It used to open by itself
   * when a filter was active, which meant that landing on a category page put ~600px of chips between
   * the heading and the first card. The active filters are already stated in the toolbar chips and the
   * toggle's count, so a collapsed panel hides nothing.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasFilters = Boolean(query.q || query.category || query.brand || query.sort !== 'relevance');
  const activeFilterCount =
    (query.q ? 1 : 0) + (query.category ? 1 : 0) + (query.brand ? 1 : 0);

  /**
   * Writing any filter restarts at page one: staying on page 12 of a narrower result set is how a
   * customer lands on an empty grid. Only the pager itself names a page.
   */
  function push(next: Partial<CatalogQuery>) {
    const merged: CatalogQuery = { ...query, ...next, page: next.page ?? 1 };
    router.push(hrefFor(merged));
  }

  /** The listing URL for a query, with the default page left out so it stays clean. */
  function hrefFor(merged: CatalogQuery): string {
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    if (merged.category) params.set('category', merged.category);
    if (merged.brand) params.set('brand', merged.brand);
    if (merged.sort !== 'relevance') params.set('sort', merged.sort);
    if (merged.page > 1) params.set('page', String(merged.page));
    const search = params.toString();
    return search ? `/products?${search}` : '/products';
  }

  // `query.category` is a slug, and so is the value every category button pushes,
  // so a category link never depends on a database identity value.
  const activeCategory = categories.find((category) => category.slug === query.category);

  /**
   * A category page names its category. It used to be headed "All products" with the category only
   * stated as a chip in the toolbar, so /categories/skincare looked like the unfiltered catalog - the
   * page a customer lands on from the Categories list did not say where they were.
   */
  const heading = query.q
    ? t('search.resultsFor', { query: query.q })
    : activeCategory !== undefined
      ? (pick(activeCategory.name) ?? activeCategory.slug)
      : t('catalog.title');

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{heading}</h1>
          <p className={styles.count} aria-live="polite">
            {t('catalog.count', { count: matchCount.toLocaleString('en-US') })}
            {pageCount > 1 && (
              <span className={styles.pageSummary}>
                {' · '}
                {t('catalog.pageSummary', { page, pages: pageCount })}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <aside
          id="catalog-filters"
          className={styles.filters}
          aria-label={t('catalog.filters')}
          data-open={filtersOpen ? 'true' : 'false'}
        >
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
                      query.category === category.slug ? styles.filterActive : styles.filterButton
                    }
                    aria-pressed={query.category === category.slug}
                    onClick={() => push({ category: category.slug })}
                  >
                    {pick(category.name)}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>{t('catalog.filterBrand')}</legend>
            {/*
              The imported catalog carries 245 brands. As free-wrapping chips they ran the filter rail
              down the whole page, so the list scrolls inside its own panel past a dozen entries -
              every brand stays reachable, and the grid stops being pushed down by a brand nobody
              (245 of them) is looking for.
            */}
            <ul className={styles.filterList} data-scroll={brands.length > 12 ? 'true' : undefined}>
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
              {/*
                The only way into the filters on a phone. It states how many are active rather than
                relying on the chips alone, because a collapsed panel hides them.
              */}
              <button
                type="button"
                className={styles.filterToggle}
                aria-expanded={filtersOpen}
                aria-controls="catalog-filters"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <FilterIcon width={16} height={16} />
                {t('catalog.filters')}
                {activeFilterCount > 0 && (
                  <span className={styles.filterCount}>{activeFilterCount}</span>
                )}
              </button>
              {/*
                Only filters the heading does not already state become chips. The heading names the
                search term or the category, so repeating it in a chip beside the Filters button was the
                same fact twice - and on a phone it was the width that pushed the sort control onto its
                own line. A brand is the one filter the heading cannot state.
              */}
              {query.q && activeCategory && (
                <span className={styles.chip}>{pick(activeCategory.name)}</span>
              )}
              {query.brand && <span className={styles.chip}>{query.brand}</span>}
            </div>
            <label className={styles.sortLabel} htmlFor="catalog-sort">
              <span>{t('catalog.sort')}</span>
              <select
                id="catalog-sort"
                value={query.sort}
                aria-label={t('catalog.sort')}
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
            <>
              <ProductGrid density="sidebar">
                {results.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
              {pageCount > 1 && (
                <nav className={styles.pager} aria-label={t('catalog.pagerLabel')}>
                  {page > 1 ? (
                    <Link className={styles.pagerStep} href={hrefFor({ ...query, page: page - 1 })} rel="prev">
                      {t('catalog.pagerPrevious')}
                    </Link>
                  ) : (
                    <span className={styles.pagerStepOff} aria-hidden="true">
                      {t('catalog.pagerPrevious')}
                    </span>
                  )}
                  <ol className={styles.pagerList}>
                    {pageWindow(page, pageCount).map((entry, index) =>
                      entry === 'gap' ? (
                        <li key={`gap-${index}`} className={styles.pagerGap} aria-hidden="true">
                          …
                        </li>
                      ) : (
                        <li key={entry}>
                          <Link
                            className={entry === page ? styles.pagerCurrent : styles.pagerPage}
                            href={hrefFor({ ...query, page: entry })}
                            aria-current={entry === page ? 'page' : undefined}
                            aria-label={t('catalog.pageSummary', { page: entry, pages: pageCount })}
                          >
                            {entry}
                          </Link>
                        </li>
                      ),
                    )}
                  </ol>
                  {page < pageCount ? (
                    <Link className={styles.pagerStep} href={hrefFor({ ...query, page: page + 1 })} rel="next">
                      {t('catalog.pagerNext')}
                    </Link>
                  ) : (
                    <span className={styles.pagerStepOff} aria-hidden="true">
                      {t('catalog.pagerNext')}
                    </span>
                  )}
                </nav>
              )}
            </>
          ) : totalCount === 0 ? (
            /*
             * The whole catalog is empty. This is a real state, not a filter
             * result, so it is stated as the gap it is rather than as a failed
             * search or a placeholder product.
             */
            <div className={styles.empty}>
              <h2>{t('catalog.emptyCatalogTitle')}</h2>
              <p>{t('catalog.emptyCatalogBody')}</p>
              <Link className={styles.emptyAction} href="/">
                {t('nav.home')}
              </Link>
            </div>
          ) : query.category ? (
            /*
             * The catalog has products, but the selected category has none. A
             * distinct message avoids blaming a search term or a brand filter
             * the customer never set.
             */
            <div className={styles.empty}>
              <h2>{t('catalog.emptyCategoryTitle')}</h2>
              <p>{t('catalog.emptyCategoryBody')}</p>
              <Link className={styles.emptyAction} href="/products">
                {t('catalog.allCategories')}
              </Link>
            </div>
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
