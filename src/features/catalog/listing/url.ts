import type { CatalogQuery } from '../query';

/** Where a query lives. A category is a route, never a query parameter in a generated link. */
function pathFor(category: string): string {
  return category ? `/categories/${encodeURIComponent(category)}` : '/products';
}

/** Whole taka for the URL, derived from the integer poisha the filter applies. */
function taka(minor: number): string {
  return String(Math.round(minor / 100));
}

/**
 * The listing URL for a query.
 *
 * Every value written here is one the parser accepts, so a copied URL is a working listing and a
 * filter can never fall out of the address bar. The default page and default sort are omitted to keep
 * a link to the unfiltered catalogue clean; repeated `brand` and `availability` parameters are the
 * multi-select form.
 */
export function listingHref(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.brands.length > 0) query.brands.forEach((brand) => params.append('brand', brand));
  if (query.minPrice !== null) params.set('min', taka(query.minPrice));
  if (query.maxPrice !== null) params.set('max', taka(query.maxPrice));
  query.availability.forEach((value) => params.append('availability', value));
  if (query.offers) params.set('offers', '1');
  if (query.sort !== 'relevance') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));

  const search = params.toString();
  const path = pathFor(query.category);
  return search ? `${path}?${search}` : path;
}
