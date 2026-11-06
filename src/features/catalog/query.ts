import { normaliseForSearch } from '@/lib/format';
import type { CatalogCategory, CatalogItem } from '@/lib/types';

export const SORT_OPTIONS = [
  'relevance',
  'price-asc',
  'price-desc',
  'name-asc',
  'newest',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** The two states the owner actually controls. An unverified state is not offerable as a filter. */
export const AVAILABILITY_FILTERS = ['in_stock', 'out_of_stock'] as const;
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

export type CatalogQuery = {
  q: string;
  /** A category page is selected by route; the slug is kept here so both routes share one query shape. */
  category: string;
  /**
   * Every slug a route's listing includes. A parent page includes itself and its live child
   * categories, so browsing a department does not hide the products the owner filed under a
   * subcategory. Absent means "just `category`", which is what every non-category route uses.
   */
  categorySlugs?: readonly string[];
  /** Multi-select: the listing shows a product when it matches any selected brand. */
  brands: string[];
  /** Price bounds in poisha, parsed from whole-taka URL values. Null means the bound is unset. */
  minPrice: number | null;
  maxPrice: number | null;
  availability: AvailabilityFilter[];
  sort: SortOption;
  page: number;
};

/**
 * How many products one page of the listing shows.
 *
 * The imported catalog holds 1,477 products. Rendering them all produced a 3.4 MB page with 22,752 DOM
 * nodes and a React payload that carried every product into the browser, so the listing pages, and
 * takes its page number from the URL so a page stays linkable and survives a refresh.
 */
export const CATALOG_PAGE_SIZE = 48;

/** How many brand facets one request may carry. A crafted URL cannot balloon the filter state. */
const MAX_BRANDS = 24;
const MAX_PRICE_TAKA = 1_000_000;

/** The page a listing can reach. A malformed or hostile value falls back to the first page. */
function parsePage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 999);
}

/**
 * A price bound arrives as whole taka and leaves as poisha. Digits only: a decimal, a currency symbol
 * or a formatted amount is not a filter value, and guessing what it means would move the money boundary.
 */
function parsePriceBound(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d{1,7}$/.test(value)) return null;
  const taka = Number.parseInt(value, 10);
  if (!Number.isFinite(taka) || taka < 0 || taka > MAX_PRICE_TAKA) return null;
  return taka * 100;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function repeated(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parses untrusted search parameters. Unknown values fall back to safe
 * defaults so malformed input can never crash a listing page.
 *
 * The `category` value is a slug, never a database identity, and is validated
 * against the slugs the caller actually serves: a value that names no known
 * category is dropped here rather than selecting an empty result set.
 *
 * Repeated `brand` and `availability` parameters are the multi-select form.
 * Unknown brand names are kept (the listing then honestly shows no match and the
 * chip can be removed); unknown availability values are dropped because they
 * name no state the shop has.
 */
export function parseCatalogQuery(
  params: Record<string, string | string[] | undefined>,
  categories: readonly CatalogCategory[],
): CatalogQuery {
  const rawQ = single(params.q).slice(0, 80);
  const rawCategory = single(params.category).trim().slice(0, 40);
  const rawSort = single(params.sort);

  const brands = [
    ...new Set(
      repeated(params.brand)
        .map((brand) => brand.trim().slice(0, 60))
        .filter((brand) => brand.length > 0),
    ),
  ].slice(0, MAX_BRANDS);

  const availability = [
    ...new Set(
      repeated(params.availability).filter((value): value is AvailabilityFilter =>
        (AVAILABILITY_FILTERS as readonly string[]).includes(value),
      ),
    ),
  ];

  let minPrice = parsePriceBound(single(params.min));
  let maxPrice = parsePriceBound(single(params.max));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    q: rawQ.trim(),
    category: categories.some((category) => category.slug === rawCategory) ? rawCategory : '',
    brands,
    minPrice,
    maxPrice,
    availability,
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
  const categoryScope = query.category
    ? (query.categorySlugs ?? [query.category])
    : null;
  return products.filter((item) => {
    if (categoryScope !== null && !categoryScope.includes(item.categorySlug)) return false;
    if (
      query.brands.length > 0 &&
      (item.brand === null || !query.brands.includes(item.brand))
    ) {
      return false;
    }
    if (query.minPrice !== null && item.priceMinor < query.minPrice) return false;
    if (query.maxPrice !== null && item.priceMinor > query.maxPrice) return false;
    if (
      query.availability.length > 0 &&
      !(query.availability as readonly string[]).includes(item.availability)
    ) {
      return false;
    }
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
    case 'newest':
      /*
       * A real stored timestamp, never a view position or an id order. A source that cannot state when
       * a product was added (the fixture) has `createdAt: null`, and those records sort after dated
       * ones rather than being given an invented date.
       */
      return sorted.sort((a, b) => {
        const left = a.createdAt ?? '';
        const right = b.createdAt ?? '';
        if (left !== right) return right.localeCompare(left);
        return b.id.localeCompare(a.id);
      });
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

export type BrandFacet = { name: string; count: number };

export type CatalogFacets = {
  /** Brands in the page's own category scope, alphabetically, with real product counts. */
  brands: BrandFacet[];
  /** Product counts per category, over the whole visible catalog. */
  categories: { slug: string; count: number }[];
  availability: Record<AvailabilityFilter, number>;
  /** Bounds in poisha, over the page's own category scope. Zero when that scope is empty. */
  price: { min: number; max: number };
};

/** Brands that actually exist in the catalog, sorted for a stable filter list. */
export function listBrandFacets(products: readonly CatalogItem[]): BrandFacet[] {
  const counts = new Map<string, number>();
  for (const item of products) {
    if (item.brand) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/**
 * Facet counts for the filter rail.
 *
 * Brand, availability and price are counted inside the page's category, because those are the options
 * that refine that page. Category counts cover the whole visible catalog, because the category list
 * changes which page you are on rather than narrowing the one you are already reading. Nothing here is
 * hard-coded: every number is a `count` over the same snapshot the grid renders.
 */
export function buildCatalogFacets(
  products: readonly CatalogItem[],
  categories: readonly CatalogCategory[],
  categorySlug: string,
  categorySlugs: readonly string[] = categorySlug ? [categorySlug] : [],
): CatalogFacets {
  const scope = categorySlug
    ? products.filter((item) => categorySlugs.includes(item.categorySlug))
    : products;

  const availability: Record<AvailabilityFilter, number> = { in_stock: 0, out_of_stock: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const item of scope) {
    if (item.availability === 'in_stock' || item.availability === 'out_of_stock') {
      availability[item.availability] += 1;
    }
    if (item.priceMinor < min) min = item.priceMinor;
    if (item.priceMinor > max) max = item.priceMinor;
  }

  /*
   * A department's count is what choosing it yields, and choosing it now includes its subcategories.
   * Incrementing both the product's own category and its parent keeps the rail's parent row equal to
   * the parent page's result count; the child row still states its own direct count.
   */
  const categoryCounts = new Map<string, number>();
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const item of products) {
    categoryCounts.set(item.categorySlug, (categoryCounts.get(item.categorySlug) ?? 0) + 1);

    const parentId = byId.get(item.categoryId)?.parentId;
    if (parentId !== null && parentId !== undefined) {
      const parentSlug = byId.get(parentId)?.slug;
      if (parentSlug !== undefined) {
        categoryCounts.set(parentSlug, (categoryCounts.get(parentSlug) ?? 0) + 1);
      }
    }
  }

  return {
    brands: listBrandFacets(scope),
    categories: categories.map((category) => ({
      slug: category.slug,
      count: categoryCounts.get(category.slug) ?? 0,
    })),
    availability,
    price: { min: Number.isFinite(min) ? min : 0, max },
  };
}
