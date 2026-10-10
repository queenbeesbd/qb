import { getCategory } from '@/data/categories';
import { normaliseForSearch } from '@/lib/format';
import type { Product } from '@/lib/types';

export const SORT_OPTIONS = ['relevance', 'price-asc', 'price-desc', 'name-asc'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export type CatalogQuery = {
  q: string;
  category: string;
  brand: string;
  sort: SortOption;
};

/**
 * Parses untrusted search parameters. Unknown values fall back to safe
 * defaults so malformed input can never crash a listing page.
 */
export function parseCatalogQuery(params: Record<string, string | string[] | undefined>): CatalogQuery {
  const single = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

  const rawQ = single(params.q).slice(0, 80);
  const rawCategory = single(params.category).slice(0, 40);
  const rawBrand = single(params.brand).slice(0, 60);
  const rawSort = single(params.sort);

  return {
    q: rawQ.trim(),
    category: getCategory(rawCategory) ? rawCategory : '',
    brand: rawBrand.trim(),
    sort: (SORT_OPTIONS as readonly string[]).includes(rawSort)
      ? (rawSort as SortOption)
      : 'relevance',
  };
}

function matchesQuery(product: Product, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    product.name.bn,
    product.name.en,
    product.brand,
    product.pack,
    ...product.tags,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normaliseForSearch)
    .join(' | ');
  return haystack.includes(needle);
}

export function filterProducts(products: readonly Product[], query: CatalogQuery): Product[] {
  const needle = normaliseForSearch(query.q);
  return products.filter((product) => {
    if (query.category && product.categoryId !== query.category) return false;
    if (query.brand && product.brand !== query.brand) return false;
    return matchesQuery(product, needle);
  });
}

function displayName(product: Product): string {
  return product.name.en ?? product.name.bn ?? product.slug;
}

/** Deterministic, total ordering so the same query always yields the same list. */
export function sortProducts(products: readonly Product[], sort: SortOption): Product[] {
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

export function selectCatalog(products: readonly Product[], query: CatalogQuery): Product[] {
  return sortProducts(filterProducts(products, query), query.sort);
}

/** Brands that actually exist in the catalog, sorted for a stable filter list. */
export function listBrands(products: readonly Product[]): string[] {
  const brands = new Set<string>();
  for (const product of products) {
    if (product.brand) brands.add(product.brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, 'en'));
}
