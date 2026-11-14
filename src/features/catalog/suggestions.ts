/**
 * The header's suggestions, as a pure function over the catalog snapshot (ADR 0041).
 *
 * Pure so the ordering rules are testable without a database, and so the route that answers
 * `GET /api/search` is only transport. The rules themselves are three:
 *
 * 1. **The listing's own matcher decides what matches**, via `searchScore`, so a suggestion can never
 *    name a product the listing it links into would not contain.
 * 2. **Relevance first**, then in stock before out of stock - a dead end never outranks a product that
 *    can actually be bought at the same relevance - then name and id, so the same term always yields
 *    the same six rows.
 * 3. **A struck-through price needs a genuine saving**, read through `discountAmount` exactly as a card
 *    reads it. A comparison price that is not higher is not printed.
 */

import { normaliseForSearch } from '@/lib/format';
import { discountAmount } from '@/lib/money';
import {
  MAX_SUGGESTIONS,
  MIN_SUGGESTION_LETTERS,
  type SearchSuggestion,
} from '@/lib/search-suggestions';
import type { CatalogItem } from '@/lib/types';

import { displayName, searchScore } from './query';

export function selectSuggestions(
  products: readonly CatalogItem[],
  query: string,
): readonly SearchSuggestion[] {
  if (normaliseForSearch(query).length < MIN_SUGGESTION_LETTERS) return [];

  return products
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((entry): entry is { item: CatalogItem; score: number } => entry.score !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        stockRank(a.item) - stockRank(b.item) ||
        displayName(a.item).localeCompare(displayName(b.item), 'en') ||
        a.item.id.localeCompare(b.item.id),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => toSuggestion(entry.item));
}

/** In stock first at equal relevance. An unverified state is not better than an available product. */
function stockRank(item: CatalogItem): number {
  return item.availability === 'in_stock' ? 0 : 1;
}

function toSuggestion(item: CatalogItem): SearchSuggestion {
  return {
    id: item.id,
    slug: item.slug,
    name: displayName(item),
    brand: item.brand,
    pack: item.pack,
    priceMinor: item.priceMinor,
    compareAtPriceMinor:
      discountAmount(item.priceMinor, item.compareAtPriceMinor) === null
        ? null
        : item.compareAtPriceMinor,
    availability: item.availability,
    image: item.images[0] ?? null,
  };
}
