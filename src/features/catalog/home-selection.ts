import { discountAmount } from '@/lib/money';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { selectDepartments } from './departments';
import { RAIL_DESKTOP_LIMIT, RAIL_MOBILE_LIMIT } from './home/rail-limits';
import { HOMEPAGE_SECTION_SIZE, selectRecentlyAdded } from './recent';

/**
 * How many products the offer carousel publishes.
 *
 * The carousel is a shelf, not a grid: it holds two desktop slides of five plus one slide on a
 * phone, so a shopper can swipe two or three times and still reach products that are on offer now.
 * Every entry is derived from a published comparison price, so the row is exactly as long as the
 * shop's real discounts make it.
 */
const DEALS_LIMIT = 10;

/**
 * How many categories and brands the two discovery rails publish before deferring to their index.
 *
 * The owner's number (2026-11-12): twenty circles on a desktop, fifteen on a phone - the shelf shows
 * the range, and the trailing "View all" circle takes the shopper to the full index. Both numbers and
 * the reason live in `home/rail-limits.ts`; the phone cut is applied in CSS so the server renders one
 * list.
 */
const CATEGORY_LIMIT = RAIL_DESKTOP_LIMIT;
const BRAND_LIMIT = RAIL_DESKTOP_LIMIT;

/** How many products the new-arrivals carousel publishes: two desktop rows, five phone pages. */
const NEW_ARRIVALS_LIMIT = 10;

/**
 * How many products the Most Selling row publishes.
 *
 * Ten, like the other shelves. The list itself is shorter than that until the shop has sold enough
 * distinct products, and empty until it has sold anything at all.
 */
const BEST_SELLING_LIMIT = 10;

/**
 * How many products "More to explore" publishes: two desktop rows of five.
 *
 * On a phone the section draws eight of them (four rows of two) because an even count fills the
 * two-column grid; that is a stylesheet decision made on the rendered list, not a second selection.
 */
const BROWSE_LIMIT = HOMEPAGE_SECTION_SIZE * 2;

export type HomepageSelection = {
  departments: CatalogCategory[];
  /**
   * True when the shop has more departments than the **phone** rail draws, so the rail ends with a
   * "View all" circle. Derived from the category list, not counted in the browser.
   */
  departmentsHaveMore: boolean;
  /** The owner's curated selection. Kept in the snapshot; the homepage rows no longer draw it. */
  featured: CatalogItem[];
  /** Real ordered units, most first. Empty until the shop has sold something. */
  bestSellers: CatalogItem[];
  deals: CatalogItem[];
  newArrivals: CatalogItem[];
  browse: CatalogItem[];
  brands: CatalogBrand[];
  /** The brand rail's own "View all" condition - see `departmentsHaveMore`. */
  brandsHaveMore: boolean;
  isEmpty: boolean;
};

/**
 * Everything the homepage shows, selected on the server from one catalog snapshot.
 *
 * This runs on the server for the reason it always did: the client receives the cards the page
 * renders, never the catalog it selected them from. The rules below are the whole of the homepage's
 * editorial policy, and each is stated in terms of stored facts:
 *
 * 1. **Featured** is the owner's curation (`collection_item`), in the owner's order.
 * 2. **Offers** is every product whose stored comparison price is genuinely higher than its price,
 *    largest saving first. Nothing is discounted to fill a slide.
 * 3. **New arrivals** is the newest ten by stored `created_at`, and it yields to nothing: recency is
 *    a fact, so the other rows drop whatever it already shows.
 * 4. **Browse** is the shop's second curation followed by the rest of the catalog, ten cards so the
 *    page ends with two full rows and a way into everything rather than a dead end.
 *
 * No section repeats a card from another, and no section is padded: a short catalog renders shorter
 * rows instead of the same product twice.
 */
export function selectHomepage({
  products,
  categories,
  brands,
  featuredIds,
  collectionIds,
  bestSellerIds,
}: {
  products: readonly CatalogItem[];
  categories: readonly CatalogCategory[];
  brands: readonly CatalogBrand[];
  featuredIds: readonly string[];
  collectionIds: readonly string[];
  /**
   * Product ids ranked by real ordered units (`listBestSellingProductIds`). Read from the shop's own
   * order lines, never from a curation - see `src/server/orders/best-sellers.ts`.
   */
  bestSellerIds: readonly string[];
}): HomepageSelection {
  /*
   * **The homepage never advertises something that cannot be ordered.** Availability is the only
   * ordering gate (ADR 0013), so a shelf of out-of-stock cards would be a row of dead ends. The
   * catalogue row is filtered once here, on the server, and every selection below reads it - the
   * empty state still describes the catalogue, not the filtered list, so a shop whose whole stock is
   * unavailable says so rather than pretending it has no products.
   */
  const purchasable = products.filter((product) => product.availability === 'in_stock');
  const productById = new Map(purchasable.map((product) => [product.id, product]));

  /*
   * The homepage rail is a list of **departments**, so a subcategory is reached through its parent
   * rather than promoted beside it. A child whose parent is not in the visible set stays, so a hidden
   * parent cannot make the child unreachable.
   */
  const presentIds = new Set(categories.map((category) => category.id));
  const roots = categories.filter(
    (category) => category.parentId === null || !presentIds.has(category.parentId),
  );

  /** The busiest departments first, then everything else in the catalog's own order. */
  const primary = selectDepartments(roots, products, 4);
  const primarySlugs = new Set(primary.map((category) => category.slug));
  const departments = [
    ...primary,
    ...roots.filter((category) => !primarySlugs.has(category.slug)),
  ].slice(0, CATEGORY_LIMIT);

  const byCuratedId = (ids: readonly string[]): CatalogItem[] =>
    ids
      .map((id) => productById.get(id))
      .filter((product): product is CatalogItem => Boolean(product));
  /*
   * **Recency goes first, and the other rows yield to it.** New arrivals is a fact about the catalog
   * (`created_at`), not a choice, so it cannot be filtered to avoid a collision - the curated rows are
   * the ones that drop a product already shown as new. Doing it the other way round (filtering the
   * newest row) would publish a "Recently added" list that is not the newest products, which is a
   * different, false claim.
   */
  const newArrivals = selectRecentlyAdded(purchasable).slice(0, NEW_ARRIVALS_LIMIT);
  const recentShown = new Set(newArrivals.map((product) => product.id));

  /*
   * **Most Selling is the second fact row, and it yields only to recency.** Its ranking comes from the
   * order lines; the one exclusion is a product already drawn as new, because the newest-products row
   * cannot be filtered without becoming a different, false claim.
   */
  const bestSellers = byCuratedId(bestSellerIds)
    .filter((product) => !recentShown.has(product.id))
    .slice(0, BEST_SELLING_LIMIT);
  const bestSellingShown = new Set(bestSellers.map((product) => product.id));

  const featured = byCuratedId(featuredIds)
    .filter((product) => !recentShown.has(product.id))
    .slice(0, HOMEPAGE_SECTION_SIZE);
  const featuredShown = new Set(featured.map((product) => product.id));

  const deals = purchasable
    .filter(
      (product) =>
        !recentShown.has(product.id) &&
        !bestSellingShown.has(product.id) &&
        !featuredShown.has(product.id),
    )
    .filter((product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null)
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
          discountAmount(a.priceMinor, a.compareAtPriceMinor)! ||
        a.id.localeCompare(b.id),
    )
    .slice(0, DEALS_LIMIT);

  const shownIds = new Set(
    [...newArrivals, ...bestSellers, ...featured, ...deals].map((product) => product.id),
  );
  const curated = byCuratedId(collectionIds).filter((product) => !shownIds.has(product.id));
  const curatedIds = new Set(curated.map((product) => product.id));
  const remainder = purchasable.filter(
    (product) => !shownIds.has(product.id) && !curatedIds.has(product.id),
  );
  const browse = [...curated, ...remainder].slice(0, BROWSE_LIMIT);

  return {
    departments,
    // The rail draws `min(total, 20)`; the phone hides everything past 15, so a shop with more than
    // fifteen needs the trailing circle or those departments would be unreachable there.
    departmentsHaveMore: roots.length > RAIL_MOBILE_LIMIT,
    featured,
    bestSellers,
    deals,
    newArrivals,
    browse,
    brands: brands.slice(0, BRAND_LIMIT),
    brandsHaveMore: brands.length > RAIL_MOBILE_LIMIT,
    isEmpty: products.length === 0,
  };
}
