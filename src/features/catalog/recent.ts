import type { CatalogItem } from '@/lib/types';

/**
 * How many products one homepage selection publishes.
 *
 * **Five since the 2026-10-23 revision (owner decision: five across on a desktop).** The full-width grid
 * is five columns from 1200px, so five completes a row exactly; on a phone the two-column grid lets the
 * final card take the row (see `ProductGrid`). The earlier six belonged to the three-column grid and
 * would now leave one card stranded on a wide screen.
 */
export const HOMEPAGE_SECTION_SIZE = 5;

/** The "Recently added" selection publishes one complete row of the homepage grid. */
export const RECENT_LIMIT = HOMEPAGE_SECTION_SIZE;

/**
 * How many product photographs the hero composition shows. Three is the composition's own shape (one
 * lead image and two supporting ones), not a data limit - the selection behind it is the newest products
 * in the catalog.
 */
export const HERO_IMAGE_COUNT = 3;

type DatedProduct = CatalogItem & { createdAt: string };

/**
 * A product the catalog can actually place in time.
 *
 * A `null` or unparseable `createdAt` means the source has not stated when the product was added, so it
 * cannot take part in an ordering that claims to be recency: placing it anywhere would publish an
 * invented arrival date.
 */
function isDated(product: CatalogItem): product is DatedProduct {
  return typeof product.createdAt === 'string' && !Number.isNaN(Date.parse(product.createdAt));
}

/**
 * The newest products in the catalog, newest first.
 *
 * This is the one ordering rule behind both recency surfaces - the hero images and the "Recently
 * added" section - so the page cannot publish two different answers to "which products are newest".
 *
 * Ordering is decided by `createdAt` - a real stored timestamp - and never by list position, id
 * magnitude alone or a name heuristic. The comparison is applied here rather than trusting the query's
 * order, so a caller that hands over an unordered list still gets a correct selection. `id` breaks a
 * tie deterministically and descending, because two products created in one transaction can share an
 * instant, and an unstable order would make "the three newest" change between identical requests.
 *
 * A product whose `createdAt` is `null` cannot participate: that is why a fixture-backed catalog shows
 * fewer than three - or no section at all - rather than three plausible-looking cards.
 */
export function selectNewestProducts(
  products: readonly CatalogItem[],
  limit: number,
): CatalogItem[] {
  return products
    .filter(isDated)
    .sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (delta !== 0) return delta;
      // Descending id: the identity sequence follows insert order, so a tie still resolves to the
      // later-created row.
      return Number(b.id) - Number(a.id);
    })
    .slice(0, limit);
}

/**
 * The most recently added products, newest first (D6). Exactly `RECENT_LIMIT` of them, and never
 * padded: fewer dated products means fewer cards.
 */
export function selectRecentlyAdded(
  products: readonly CatalogItem[],
  limit: number = RECENT_LIMIT,
): CatalogItem[] {
  return selectNewestProducts(products, limit);
}

/**
 * The product photographs for the hero composition: the newest products that can actually be shown.
 *
 * The hero renders images only, so a product with no photograph is skipped rather than taking a slot
 * the composition cannot fill - an empty frame in the hero is a broken image, not an honest gap. The
 * ordering is the same one "Recently added" uses, so the two surfaces agree about what is newest.
 */
export function selectHeroProducts(
  products: readonly CatalogItem[],
  limit: number = HERO_IMAGE_COUNT,
): CatalogItem[] {
  return selectNewestProducts(
    products.filter((product) => product.images.length > 0),
    limit,
  );
}
