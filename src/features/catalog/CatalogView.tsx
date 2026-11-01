'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import { CloseIcon, FilterIcon } from '@/components/icons';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { LISTING_CARD_FRAME, LISTING_CARD_SIZES } from '@/lib/images';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import {
  CATALOG_PAGE_SIZE,
  type AvailabilityFilter,
  type CatalogFacets,
  type CatalogQuery,
  type SortOption,
} from './query';
import { FilterControls } from './listing/FilterControls';
import { MobileFilterDrawer } from './listing/MobileFilterDrawer';
import { ProductSearch } from './listing/ProductSearch';
import { listingHref } from './listing/url';
import styles from './listing/listing.module.css';

const SORT_LABEL_KEYS: Record<SortOption, TranslationKey> = {
  relevance: 'catalog.sortRelevance',
  newest: 'catalog.sortNewest',
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

/** Filters that live in the query, excluding the category (which a route names) and the sort. */
function activeCountOf(query: CatalogQuery): number {
  return (
    (query.q ? 1 : 0) +
    query.brands.length +
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0) +
    query.availability.length
  );
}

type Chip = {
  key: string;
  label: string;
  patch: Partial<CatalogQuery>;
};

/**
 * Catalog browser. Search, category, brand, price, availability and sort all compose into a single
 * query so filters can never disagree with each other, and every change is written to the URL for
 * back/forward support, refresh and sharing.
 *
 * Every value it renders - the result set, the facet counts and the categories - arrives as a
 * server-resolved prop derived from one catalog snapshot, so the view never selects products itself
 * and can never disagree with the server.
 */
export function CatalogView({
  results,
  facets,
  categories,
  query,
  totalCount,
  matchCount,
  page,
  pageCount,
}: {
  results: readonly CatalogItem[];
  facets: CatalogFacets;
  categories: readonly CatalogCategory[];
  query: CatalogQuery;
  totalCount: number;
  /** How many products match the query in total, across every page. */
  matchCount: number;
  page: number;
  pageCount: number;
}) {
  const { t, pick, price } = useTranslation();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /**
   * The filters the customer has just chosen, before the server has answered.
   *
   * A checkbox is controlled by its query value, so without this a tick would flip back for the length
   * of a navigation and read as a broken control. The optimistic value drives the rail, the chips and
   * the sort control; the results, the heading and every count remain the server's until it answers.
   */
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogQuery>(query);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);

  const category = categories.find((entry) => entry.slug === query.category) ?? null;
  const hasFilters = activeCountOf(optimisticQuery) > 0;
  const activeFilterCount = activeCountOf(optimisticQuery);

  function navigate(next: CatalogQuery) {
    const href = listingHref(next);
    // A repeated submission (Enter, then the Apply button; or a slider release, then Apply) is the same
    // URL, so it must not add a history entry or refetch the same listing.
    if (href === listingHref(optimisticQuery)) return;
    startTransition(() => {
      setOptimisticQuery(next);
      router.push(href, { scroll: false });
    });
  }

  /**
   * Writing any filter restarts at page one: staying on page 12 of a narrower result set is how a
   * customer lands on an empty grid. Only the pager itself names a page.
   */
  function push(patch: Partial<CatalogQuery>) {
    // Built from the optimistic value so two quick choices compose instead of the second overwriting
    // the first with the last server-rendered state.
    const next = { ...optimisticQuery, ...patch };
    if (patch.page === undefined) next.page = 1;
    navigate(next);
  }

  function clearFilters() {
    push({
      q: '',
      brands: [],
      minPrice: null,
      maxPrice: null,
      availability: [],
      page: 1,
    });
  }

  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  function openFilters() {
    setDraft({ ...optimisticQuery });
    setFiltersOpen(true);
  }

  function changeDraft(patch: Partial<CatalogQuery>) {
    setDraft((current) => ({ ...current, ...patch, page: 1 }));
  }

  function resetDraft() {
    setDraft((current) => ({
      ...current,
      brands: [],
      minPrice: null,
      maxPrice: null,
      availability: [],
      page: 1,
    }));
  }

  function applyDraft() {
    setFiltersOpen(false);
    navigate({ ...draft, page: 1 });
  }

  const heading = query.q
    ? t('search.resultsFor', { query: query.q })
    : category !== null
      ? (pick(category.name) ?? category.slug)
      : t('catalog.title');

  const description = query.q
    ? t('catalog.searchDescription')
    : category !== null
      ? pick(category.blurb)
      : t('catalog.description');

  const countLabel =
    matchCount === 1
      ? t('catalog.countOne')
      : t('catalog.count', { count: matchCount.toLocaleString('en-US') });

  const firstShown = matchCount === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1;
  const lastShown = Math.min(page * CATALOG_PAGE_SIZE, matchCount);
  const showingLabel =
    matchCount === 0
      ? t('catalog.countZero')
      : t('catalog.showingRange', {
          from: firstShown.toLocaleString('en-US'),
          to: lastShown.toLocaleString('en-US'),
          total: matchCount.toLocaleString('en-US'),
        });

  const chips: Chip[] = [];
  for (const brand of optimisticQuery.brands) {
    chips.push({
      key: `brand-${brand}`,
      label: brand,
      patch: { brands: optimisticQuery.brands.filter((entry) => entry !== brand) },
    });
  }
  if (optimisticQuery.minPrice !== null || optimisticQuery.maxPrice !== null) {
    const label =
      optimisticQuery.minPrice !== null && optimisticQuery.maxPrice !== null
        ? t('catalog.priceBetween', {
            min: price(optimisticQuery.minPrice),
            max: price(optimisticQuery.maxPrice),
          })
        : optimisticQuery.minPrice !== null
          ? t('catalog.priceFrom', { min: price(optimisticQuery.minPrice) })
          : t('catalog.priceUpTo', { max: price(optimisticQuery.maxPrice ?? 0) });
    chips.push({ key: 'price', label, patch: { minPrice: null, maxPrice: null } });
  }
  for (const entry of optimisticQuery.availability) {
    chips.push({
      key: `availability-${entry}`,
      label: entry === 'in_stock' ? t('catalog.inStock') : t('catalog.outOfStock'),
      patch: {
        availability: optimisticQuery.availability.filter(
          (item) => item !== entry,
        ) as AvailabilityFilter[],
      },
    });
  }
  // The heading names the search term or the category, so only the fact the heading cannot state
  // becomes a chip. On a category page reached through search, the category is that fact.
  if (optimisticQuery.q && category !== null) {
    chips.push({
      key: 'category',
      label: pick(category.name) ?? category.slug,
      patch: { category: '' },
    });
  }

  return (
    <div className={styles.page} data-catalog-listing>
      <div className={styles.headerBlock}>
        <nav className={styles.breadcrumb} aria-label={t('catalog.breadcrumbLabel')}>
          <Link href="/">{t('nav.home')}</Link>
          <span className={styles.breadcrumbSep} aria-hidden="true">
            /
          </span>
          <Link href="/categories">{t('categories.title')}</Link>
          <span className={styles.breadcrumbSep} aria-hidden="true">
            /
          </span>
          <span aria-current="page">
            {category !== null ? (pick(category.name) ?? category.slug) : t('catalog.title')}
          </span>
        </nav>

        <header className={styles.pageHeader}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{heading}</h1>
            {description !== null && description !== '' && (
              <p className={styles.description}>{description}</p>
            )}
          </div>
          <p className={styles.count} aria-live="polite">
            {countLabel}
            {pageCount > 1 && (
              <span className={styles.pageSummary}>
                {' · '}
                {t('catalog.pageSummary', { page, pages: pageCount })}
              </span>
            )}
          </p>
        </header>
      </div>

      <div className={styles.layout}>
        <aside id="catalog-filters" className={styles.sidebar} aria-label={t('catalog.filters')}>
          <div className={styles.sidebarPanel}>
            <div className={styles.sidebarHead}>
              <h2 className={styles.sidebarTitle}>{t('catalog.filters')}</h2>
              {hasFilters && (
                <button type="button" className={styles.clearAll} onClick={clearFilters}>
                  {t('catalog.clearFilters')}
                </button>
              )}
            </div>
            <FilterControls
              value={optimisticQuery}
              facets={facets}
              categories={categories}
              allCount={totalCount}
              onFilterChange={push}
              categoryHref={(slug) =>
                listingHref({ ...optimisticQuery, category: slug, page: 1 })
              }
              idPrefix="desktop"
            />
          </div>
        </aside>

        <section className={styles.results}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarRow}>
              <ProductSearch initial={optimisticQuery.q} onSubmit={(term) => push({ q: term })} />

              <button
                type="button"
                ref={filterButtonRef}
                className={styles.filterToggle}
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                onClick={openFilters}
              >
                <FilterIcon width={16} height={16} />
                {t('catalog.filters')}
                {activeFilterCount > 0 && (
                  <span className={styles.filterCount}>{activeFilterCount}</span>
                )}
              </button>

              <label className={styles.sortLabel} htmlFor="catalog-sort">
                <span>{t('catalog.sort')}</span>
                <select
                  id="catalog-sort"
                  value={optimisticQuery.sort}
                  onChange={(event) => push({ sort: event.target.value as SortOption })}
                >
                  {Object.keys(SORT_LABEL_KEYS).map((option) => (
                    <option key={option} value={option}>
                      {t(SORT_LABEL_KEYS[option as SortOption])}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.toolbarMeta}>
              <p className={styles.showing}>{showingLabel}</p>
              {chips.length > 0 && (
                <div
                  className={styles.activeFilters}
                  role="group"
                  aria-label={t('catalog.activeFilters')}
                >
                  {chips.map((chip) => (
                    <span key={chip.key} className={styles.chip}>
                      <span className={styles.chipLabel}>{chip.label}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        aria-label={t('catalog.removeFilter', { filter: chip.label })}
                        onClick={() => push(chip.patch)}
                      >
                        <CloseIcon width={12} height={12} />
                      </button>
                    </span>
                  ))}
                  <button type="button" className={styles.clearChips} onClick={clearFilters}>
                    {t('catalog.clearFilters')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className={styles.resultsBody}
            data-pending={isPending ? 'true' : undefined}
            aria-busy={isPending}
          >
            {results.length > 0 ? (
              <>
                <ProductGrid density="sidebar">
                  {results.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      frame={LISTING_CARD_FRAME}
                      sizes={LISTING_CARD_SIZES}
                    />
                  ))}
                </ProductGrid>

                {pageCount > 1 && (
                  <nav className={styles.pager} aria-label={t('catalog.pagerLabel')}>
                    <p className={styles.pagerInfo}>
                      {t('catalog.pageSummary', { page, pages: pageCount })}
                    </p>
                    <div className={styles.pagerControls}>
                      {page > 1 ? (
                        <Link
                          className={styles.pagerStep}
                          href={listingHref({ ...query, page: page - 1 })}
                          rel="prev"
                        >
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
                                href={listingHref({ ...query, page: entry })}
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
                        <Link
                          className={styles.pagerStep}
                          href={listingHref({ ...query, page: page + 1 })}
                          rel="next"
                        >
                          {t('catalog.pagerNext')}
                        </Link>
                      ) : (
                        <span className={styles.pagerStepOff} aria-hidden="true">
                          {t('catalog.pagerNext')}
                        </span>
                      )}
                    </div>
                  </nav>
                )}
              </>
            ) : totalCount === 0 ? (
              <div className={styles.empty}>
                <h2>{t('catalog.emptyCatalogTitle')}</h2>
                <p>{t('catalog.emptyCatalogBody')}</p>
                <Link className={styles.emptyAction} href="/">
                  {t('nav.home')}
                </Link>
              </div>
            ) : query.category ? (
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
                  {t('catalog.clearFilters')}
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      {filtersOpen && (
        <MobileFilterDrawer
          draft={draft}
          facets={facets}
          categories={categories}
          allCount={totalCount}
          activeCount={activeCountOf(draft)}
          onDraftChange={changeDraft}
          onReset={resetDraft}
          onApply={applyDraft}
          onClose={closeFilters}
          categoryHref={(slug) => listingHref({ ...draft, category: slug, page: 1 })}
          returnFocusTo={filterButtonRef}
        />
      )}
    </div>
  );
}
