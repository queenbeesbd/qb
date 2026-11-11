import { discountAmount } from '@/lib/money';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { selectDepartments } from './departments';
import { RAIL_LIMIT } from './home/rail-limits';
import { HOMEPAGE_SECTION_SIZE, selectRecentlyAdded } from './recent';

/**
 * How many products the offer carousel publishes.
 *
 * The carousel is a shelf, not a grid: it holds two desktop slides of five plus one slide on a
 * phone, so a shopper can swipe two or three times and still reach products that are on offer now.
 * Every entry is derived from a published comparison price, so the row is exactly as long as the
 * shop's real discounts make it - or exactly as long as the owner's own picks make it, filtered by
 * the same rule.
 */
const DEALS_LIMIT = 10;

/**
 * How many departments and brands a discovery rail publishes.
 *
 * Fifteen, on every width (owner direction, 2026-11-12): the number is a fact about the row rather
 * than about the screen, and the owner chooses *which* fifteen in the admin panel. The trailing
 * "View all" circle appears when the shop has more than the rail shows.
 */
const CATEGORY_LIMIT = RAIL_LIMIT;
const BRAND_LIMIT = RAIL_LIMIT;

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
 * How deep the homepage asks for the ranking: the row, plus one.
 *
 * The eleventh is the evidence that there is more behind the row's "All best sellers" tile. Asking for
 * exactly the row's length would make that tile impossible to draw, because a page can only know what
 * it asked for.
 */
export const HOMEPAGE_BEST_SELLER_DEPTH = BEST_SELLING_LIMIT + 1;

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
  /** The shop has more ranked products than the row draws - it then ends in "All best sellers". */
  bestSellersHaveMore: boolean;
  deals: CatalogItem[];
  /** The shop has more genuinely discounted products than the row draws - "All offers". */
  dealsHaveMore: boolean;
  newArrivals: CatalogItem[];
  /** The shop has more dated products than the row draws - "All new arrivals". */
  newArrivalsHaveMore: boolean;
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
  picks = { categorySlugs: [], brandSlugs: [], offerProductIds: [] },
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
  /**
   * The owner's own picks for the three curatable rows (`storefront_pick`, read into the snapshot).
   *
   * **An empty list means automatic** - the shop's own selection - so a shop that has never opened the
   * editor still has a homepage. A pick that no longer resolves (archived, unpublished, no longer
   * discounted) is dropped here rather than rendered: the editor's rule is re-applied at read time,
   * because the catalog can change after the save.
   */
  picks?: {
    readonly categorySlugs: readonly string[];
    readonly brandSlugs: readonly string[];
    readonly offerProductIds: readonly string[];
  };
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
  const automaticDepartments = [
    ...primary,
    ...roots.filter((category) => !primarySlugs.has(category.slug)),
  ].slice(0, CATEGORY_LIMIT);

  /*
   * The owner's own departments, in the owner's order, when there are any. A slug that no longer names
   * a live root drops out; the editor only offers roots, so nothing else can be stored.
   */
  const pickedDepartments = picks.categorySlugs.flatMap((slug) => {
    const found = roots.find((category) => category.slug === slug);
    return found === undefined ? [] : [found];
  });
  const departments =
    pickedDepartments.length > 0 ? pickedDepartments.slice(0, CATEGORY_LIMIT) : automaticDepartments;

  const byCuratedId = (ids: readonly string[]): CatalogItem[] =>
    ids
      .map((id) => productById.get(id))
      .filter((product): product is CatalogItem => Boolean(product));

  /* The owner's own brands, in the owner's order; a brand no longer sold simply drops out. */
  const pickedBrands = picks.brandSlugs.flatMap((slug) => {
    const found = brands.find((entry) => entry.slug === slug);
    return found === undefined ? [] : [found];
  });
  const railBrands =
    pickedBrands.length > 0 ? pickedBrands.slice(0, BRAND_LIMIT) : brands.slice(0, BRAND_LIMIT);
  /*
   * **Recency goes first, and the other rows yield to it.** New arrivals is a fact about the catalog
   * (`created_at`), not a choice, so it cannot be filtered to avoid a collision - the curated rows are
   * the ones that drop a product already shown as new. Doing it the other way round (filtering the
   * newest row) would publish a "Recently added" list that is not the newest products, which is a
   * different, false claim.
   *
   * One extra row is read, and the eleventh is the evidence that there is more behind the row's
   * "All new arrivals" tile. `selectNewestProducts` owns the dating rule, so nothing here re-states it.
   */
  const recentlyAdded = selectRecentlyAdded(purchasable, NEW_ARRIVALS_LIMIT + 1);
  const newArrivals = recentlyAdded.slice(0, NEW_ARRIVALS_LIMIT);
  const recentShown = new Set(newArrivals.map((product) => product.id));

  /*
   * Everything the "All offers" listing would show, in the shop's own availability state. This is the
   * count the tile is measured against, so a row shortened by the exclusions below still offers the
   * way through to products it did not have room for.
   */
  const onOffer = purchasable.filter(
    (product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
  );

  /*
   * **Most Selling is the second fact row, and it yields only to recency.** Its ranking comes from the
   * order lines; the one exclusion is a product already drawn as new, because the newest-products row
   * cannot be filtered without becoming a different, false claim.
   */
  const ranked = byCuratedId(bestSellerIds).filter((product) => !recentShown.has(product.id));
  const bestSellers = ranked.slice(0, BEST_SELLING_LIMIT);
  const bestSellingShown = new Set(bestSellers.map((product) => product.id));
  /*
   * The listing's own ranking depth: every ranked product the shop still sells, before this page's
   * exclusions. That is what "All best sellers" will list, so that is what the tile is measured on.
   */
  const purchasableBestSellerIds = bestSellerIds.filter((id) => productById.has(id)).length;

  const featured = byCuratedId(featuredIds)
    .filter((product) => !recentShown.has(product.id))
    .slice(0, HOMEPAGE_SECTION_SIZE);
  const featuredShown = new Set(featured.map((product) => product.id));

  const offerable = purchasable
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
    );

  /*
   * The owner's own offers, in the owner's order, when there are any.
   *
   * The two rules the editor enforces are re-applied here because the catalog moves after a save: the
   * product must still be purchasable and must still carry a **genuine** saving (the rows above already
   * dropped the ones drawn as new, most-selling or featured, so a pick cannot repeat a card). Anything
   * that fails is skipped rather than rendered under a heading it no longer earns.
   */
  const pickedOffers = picks.offerProductIds.flatMap((id) => {
    const product = productById.get(id);
    if (product === undefined) return [];
    if (discountAmount(product.priceMinor, product.compareAtPriceMinor) === null) return [];
    if (!offerable.some((entry) => entry.id === id)) return [];
    return [product];
  });
  const deals = (pickedOffers.length > 0 ? pickedOffers : offerable).slice(0, DEALS_LIMIT);

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
    // The rail draws what the owner chose (or the automatic fifteen); the index is the way to the rest.
    departmentsHaveMore: roots.length > departments.length,
    featured,
    bestSellers,
    /*
     * Each product row ends in a "see everything" tile when the listing behind it holds more than the
     * row draws (owner direction, 2026-11-12).
     *
     * The comparison is against **the same set the tile's destination lists**, not against the row's
     * own exclusions. The rows drop products already shown elsewhere on the page, so on a small
     * catalog the offer row can be four cards while the offers listing holds thirteen: the shopper is
     * owed the way through, and the count behind the tile has to be the listing's count or the tile
     * would be missing exactly when it is needed.
     */
    bestSellersHaveMore: purchasableBestSellerIds > bestSellers.length,
    deals,
    dealsHaveMore: onOffer.length > deals.length,
    newArrivals,
    newArrivalsHaveMore: recentlyAdded.length > newArrivals.length,
    browse,
    brands: railBrands,
    brandsHaveMore: brands.length > railBrands.length,
    isEmpty: products.length === 0,
  };
}
