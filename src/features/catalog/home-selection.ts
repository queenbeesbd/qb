import { discountAmount } from '@/lib/money';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { selectDepartments } from './departments';
import { HOMEPAGE_SECTION_SIZE, selectHeroProducts, selectRecentlyAdded } from './recent';

/**
 * How many products "More to explore" publishes: two rows of the five-column desktop grid.
 *
 * It is a browse row, not a fixed selection, so it takes the shop's own collection first and then the
 * rest of the catalog that the rows above have not shown.
 */
const EXPLORE_LIMIT = 10;

export type HomepageSelection = {
  departments: CatalogCategory[];
  hero: CatalogItem[];
  featured: CatalogItem[];
  deals: CatalogItem[];
  recentlyAdded: CatalogItem[];
  explore: CatalogItem[];
  isEmpty: boolean;
};

/**
 * Everything the homepage shows, selected on the server.
 *
 * This used to run inside the page's client component, which meant the **whole catalog** crossed into
 * the browser so that twenty-eight cards could be picked from it: about 318 KB gzipped on the one route
 * a first-time visitor lands on. The selection is pure, so it belongs here - the client receives the
 * cards, not the catalog.
 *
 * The rules are unchanged: recency is a fact and yields to nothing, the featured row is a choice and
 * yields to recency, the offer row is derived from a real comparison price, and "More to explore" is
 * the rest of the shop up to ten cards.
 */
export function selectHomepage({
  products,
  categories,
  featuredIds,
  collectionIds,
}: {
  products: readonly CatalogItem[];
  categories: readonly CatalogCategory[];
  featuredIds: readonly string[];
  collectionIds: readonly string[];
}): HomepageSelection {
  const departments = selectDepartments(categories, products);

  const productById = new Map(products.map((product) => [product.id, product]));
  const resolve = (ids: readonly string[]): CatalogItem[] =>
    ids.map((id) => productById.get(id)).filter((product): product is CatalogItem => Boolean(product));

  const recentlyAdded = selectRecentlyAdded(products);
  const recentIds = new Set(recentlyAdded.map((product) => product.id));

  const featured = resolve(featuredIds)
    .filter((product) => !recentIds.has(product.id))
    .slice(0, HOMEPAGE_SECTION_SIZE);
  const featuredShown = new Set(featured.map((product) => product.id));

  const deals = products
    .filter(
      (product) =>
        !recentIds.has(product.id) &&
        !featuredShown.has(product.id) &&
        discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
    )
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
        discountAmount(a.priceMinor, a.compareAtPriceMinor)!,
    )
    .slice(0, HOMEPAGE_SECTION_SIZE);

  const shownIds = new Set([...recentlyAdded, ...featured, ...deals].map((product) => product.id));
  const curatedRest = resolve(collectionIds).filter((product) => !shownIds.has(product.id));
  const curatedRestIds = new Set(curatedRest.map((product) => product.id));
  const remainder = products.filter(
    (product) => !shownIds.has(product.id) && !curatedRestIds.has(product.id),
  );
  const explore = [...curatedRest, ...remainder].slice(0, EXPLORE_LIMIT);

  return {
    departments,
    hero: selectHeroProducts(products),
    featured,
    deals,
    recentlyAdded,
    explore,
    isEmpty: products.length === 0,
  };
}
