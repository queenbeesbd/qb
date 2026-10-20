import type { CatalogItem } from '@/lib/types';

/**
 * How many products the "Recently added" selection publishes. Exactly three: enough to read as a
 * selection rather than a single highlight, few enough to stay one row on desktop.
 */
export const RECENT_LIMIT = 3;

/**
 * The most recently added products, newest first.
 *
 * Ordering is decided by `createdAt` - a real stored timestamp - and never by list position, id
 * magnitude alone or a name heuristic. The comparison is applied here rather than trusting the query's
 * order, so a caller that hands over an unordered list still gets a correct selection. `id` breaks a tie
 * deterministically and descending, because two products created in one transaction can share an
 * instant, and an unstable order would make "the three newest" change between identical requests.
 *
 * A product whose `createdAt` is `null` cannot participate: the source has not stated when it was
 * added, and placing it anywhere in the row would publish an invented arrival date. That is why a
 * fixture-backed catalog shows fewer than three - or no section at all - rather than three
 * plausible-looking cards.
 */
export function selectRecentlyAdded(
  products: readonly CatalogItem[],
  limit: number = RECENT_LIMIT,
): CatalogItem[] {
  return products
    .filter(
      (product): product is CatalogItem & { createdAt: string } =>
        typeof product.createdAt === 'string' && !Number.isNaN(Date.parse(product.createdAt)),
    )
    .sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (delta !== 0) return delta;
      // Descending id: the identity sequence follows insert order, so a tie still resolves to the
      // later-created row.
      return Number(b.id) - Number(a.id);
    })
    .slice(0, limit);
}
