import { discountAmount } from '@/lib/money';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { selectDepartments } from './departments';
import { HOMEPAGE_SECTION_SIZE, selectHeroProducts, selectRecentlyAdded } from './recent';

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
 * How many categories the homepage rail publishes.
 *
 * Four across on a phone and seven on a desktop. Every visible department is offered, because the
 * rail is the *only* category discovery on a phone - the tab bar links to the index, but a shopper
 * scanning the home screen should not have to leave it to find out the shop sells lipstick.
 */
const CATEGORY_LIMIT = 14;

/** How many brands the rail shows before deferring to the brand index. */
const BRAND_LIMIT = 10;

/** How many products the new-arrivals row publishes: one full desktop row. */
const NEW_ARRIVALS_LIMIT = HOMEPAGE_SECTION_SIZE;

export type HomepageSelection = {
  departments: CatalogCategory[];
  hero: CatalogItem[];
  featured: CatalogItem[];
  deals: CatalogItem[];
  newArrivals: CatalogItem[];
  browse: CatalogItem[];
  brands: CatalogBrand[];
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
 * 3. **New arrivals** is the newest by stored `created_at`, and it yields to nothing: recency is a
 *    fact, so the other rows drop whatever it already shows.
 * 4. **Browse** is the shop's second curation followed by the rest of the catalog, so the page ends
 *    with a way into everything rather than a dead end.
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
}: {
  products: readonly CatalogItem[];
  categories: readonly CatalogCategory[];
  brands: readonly CatalogBrand[];
  featuredIds: readonly string[];
  collectionIds: readonly string[];
}): HomepageSelection {
  const productById = new Map(products.map((product) => [product.id, product]));

  /** The busiest departments first, then everything else in the catalog's own order. */
  const primary = selectDepartments(categories, products, 4);
  const primarySlugs = new Set(primary.map((category) => category.slug));
  const departments = [
    ...primary,
    ...categories.filter((category) => !primarySlugs.has(category.slug)),
  ].slice(0, CATEGORY_LIMIT);

  const byCuratedId = (ids: readonly string[]): CatalogItem[] =>
    ids
      .map((id) => productById.get(id))
      .filter((product): product is CatalogItem => Boolean(product));
  const featured = byCuratedId(featuredIds).slice(0, HOMEPAGE_SECTION_SIZE);
  const featuredShown = new Set(featured.map((product) => product.id));

  const deals = products
    .filter((product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null)
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
          discountAmount(a.priceMinor, a.compareAtPriceMinor)! ||
        a.id.localeCompare(b.id),
    )
    .slice(0, DEALS_LIMIT);

  const featuredDealShown = new Set([...featured, ...deals].map((product) => product.id));

  const newArrivals = selectRecentlyAdded(products).filter(
    (product) => !featuredShown.has(product.id) && !featuredDealShown.has(product.id),
  );

  const shownIds = new Set(
    [...featured, ...deals, ...newArrivals, ...selectHeroProducts(products)].map((product) => product.id),
  );
  const curated = byCuratedId(collectionIds).filter((product) => !shownIds.has(product.id));
  const curatedIds = new Set(curated.map((product) => product.id));
  const remainder = products.filter(
    (product) => !shownIds.has(product.id) && !curatedIds.has(product.id),
  );
  const browse = [...curated, ...remainder].slice(0, HOMEPAGE_SECTION_SIZE);

  return {
    departments,
    hero: selectHeroProducts(products),
    featured,
    deals,
    newArrivals: newArrivals.slice(0, NEW_ARRIVALS_LIMIT),
    browse,
    brands: brands.slice(0, BRAND_LIMIT),
    isEmpty: products.length === 0,
  };
}
