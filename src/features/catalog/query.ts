import { normaliseForSearch } from '@/lib/format';
import type { CatalogCategory, CatalogItem } from '@/lib/types';

export const SORT_OPTIONS = ['relevance', 'price-asc', 'price-desc', 'name-asc'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export type CatalogQuery = {
  q: string;
  category: string;
  brand: string;
  sort: SortOption;
  page: number;
};

/**
 * How many products one page of the listing shows.
 *
 * The imported catalog holds 1,477 products. Rendering them all produced a 3.4 MB page with 22,752 DOM
 * nodes and a React payload that carried every product into the browser, so the listing pages now, and
 * takes its page number from the URL so a page stays linkable and survives a refresh.
 */
export const CATALOG_PAGE_SIZE = 48;

/** The page a listing can reach. A malformed or hostile value falls back to the first page. */
function parsePage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 999);
}

/**
 * Parses untrusted search parameters. Unknown values fall back to safe
 * defaults so malformed input can never crash a listing page.
 *
 * The `category` value is a slug, never a database identity, and is validated
 * against the slugs the caller actually serves: a value that names no known
 * category is dropped here rather than selecting an empty result set.
 */
export function parseCatalogQuery(
  params: Record<string, string | string[] | undefined>,
  categories: readonly CatalogCategory[],
): CatalogQuery {
  const single = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

  const rawQ = single(params.q).slice(0, 80);
  const rawCategory = single(params.category).trim().slice(0, 40);
  const rawBrand = single(params.brand).slice(0, 60);
  const rawSort = single(params.sort);

  return {
    q: rawQ.trim(),
    category: categories.some((category) => category.slug === rawCategory) ? rawCategory : '',
    brand: rawBrand.trim(),
    sort: (SORT_OPTIONS as readonly string[]).includes(rawSort)
      ? (rawSort as SortOption)
      : 'relevance',
    page: parsePage(single(params.page)),
  };
}

/**
 * Search haystack: both published names, the brand and the pack size. The
 * storefront has no tags or description search, so neither is included.
 */
function matchesQuery(item: CatalogItem, needle: string): boolean {
  if (!needle) return true;
  const haystack = [item.name.bn, item.name.en, item.brand, item.pack]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normaliseForSearch)
    .join(' | ');
  return haystack.includes(needle);
}

export function filterProducts(
  products: readonly CatalogItem[],
  query: CatalogQuery,
): CatalogItem[] {
  const needle = normaliseForSearch(query.q);
  return products.filter((item) => {
    if (query.category && item.categorySlug !== query.category) return false;
    if (query.brand && item.brand !== query.brand) return false;
    return matchesQuery(item, needle);
  });
}

function displayName(item: CatalogItem): string {
  return item.name.en ?? item.name.bn ?? item.slug;
}

/** Deterministic, total ordering so the same query always yields the same list. */
export function sortProducts(products: readonly CatalogItem[], sort: SortOption): CatalogItem[] {
  const sorted = [...products];
  switch (sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.priceMinor - b.priceMinor || a.id.localeCompare(b.id));
    case 'price-desc':
      return sorted.sort((a, b) => b.priceMinor - a.priceMinor || a.id.localeCompare(b.id));
    case 'name-asc':
      return sorted.sort((a, b) =>
        displayName(a).localeCompare(displayName(b), 'en') || a.id.localeCompare(b.id),
      );
    default:
      return sorted.sort((a, b) => a.id.localeCompare(b.id));
  }
}

export function selectCatalog(
  products: readonly CatalogItem[],
  query: CatalogQuery,
): CatalogItem[] {
  return sortProducts(filterProducts(products, query), query.sort);
}

/**
 * One page of a result set, clamped so a page number past the end shows the last page rather than an
 * empty grid: a stale link should land somewhere useful.
 */
export function slicePage<T>(
  items: readonly T[],
  page: number,
  size: number = CATALOG_PAGE_SIZE,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pageCount };
}

/** Brands that actually exist in the catalog, sorted for a stable filter list. */
export function listBrands(products: readonly CatalogItem[]): string[] {
  const brands = new Set<string>();
  for (const item of products) {
    if (item.brand) brands.add(item.brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, 'en'));
}
