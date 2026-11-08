/**
 * What a 404 can honestly offer: the shop's own shelf.
 *
 * A wrong address is not an error to apologise for, it is a reader who arrived somewhere that does not
 * exist - so the page's job is to put the shop in front of them. That has to be **real**: products the
 * shop can sell today (`availability = 'in_stock'`, the only ordering gate, ADR 0010), their actual
 * price and pack size, and the real category index. No invented reviews, arrivals, "popularity" or
 * counts; the heading states exactly what the list is.
 *
 * It reads the same cached catalogue snapshot every storefront page reads, so a 404 costs no extra
 * query and follows an owner's edit on the next request.
 *
 * **A 404 never fails.** If the catalogue cannot be read, this returns an empty list rather than
 * throwing: the visitor gets the search and the links, and the page says the shelf is unavailable. An
 * error page where a not-found page belongs is worse than a shorter page.
 */

import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { getStorefrontCatalog } from './storefront';

export type NotFoundShelf = {
  /** In-stock products, spread across the catalogue rather than the first ids. */
  readonly products: readonly CatalogItem[];
  readonly categories: readonly CatalogCategory[];
  /** Every in-stock product in the catalogue, not only the ones the page shows. */
  readonly inStockTotal: number;
  /** True when the catalogue could not be read, so the page states the gap instead of an empty shelf. */
  readonly unavailable: boolean;
};

/** How many products the page shows. Two columns of four on desktop, four rows on a phone. */
const SHELF_LIMIT = 8;

/**
 * Picks a spread of in-stock products.
 *
 * A plain `slice(0, 8)` would show the eight oldest ids, which on this shop is one brand's shelf. The
 * pick walks the list at a stride so the eight come from across the catalogue, then fills any shortfall
 * from the front. Deterministic: no randomness, so the same URL shows the same shelf.
 */
function spread(items: readonly CatalogItem[], limit: number): CatalogItem[] {
  if (items.length <= limit) return [...items];
  const stride = Math.max(1, Math.floor(items.length / limit));
  const picked: CatalogItem[] = [];
  for (let index = 0; index < items.length && picked.length < limit; index += stride) {
    const item = items[index];
    if (item !== undefined) picked.push(item);
  }
  for (const item of items) {
    if (picked.length >= limit) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

export async function loadNotFoundShelf(): Promise<NotFoundShelf> {
  try {
    const catalog = await getStorefrontCatalog();
    const inStock = catalog.products.filter((product) => product.availability === 'in_stock');
    return {
      products: spread(inStock, SHELF_LIMIT),
      categories: catalog.categories,
      inStockTotal: inStock.length,
      unavailable: false,
    };
  } catch {
    return { products: [], categories: [], inStockTotal: 0, unavailable: true };
  }
}
