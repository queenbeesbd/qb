/**
 * The two discovery rails' numbers, as pure selection logic.
 *
 * The homepage shows twenty circles on a desktop and fifteen on a phone, and ends the rail with a
 * "View all" circle when the shop has more than the phone draws (owner direction, 2026-11-12). The
 * phone cut itself is CSS, so what has to be true here is the *selection*: the server sends the
 * desktop number, and it says whether anything is left over.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectHomepage } from '../../src/features/catalog/home-selection';
import { RAIL_LIMIT } from '../../src/features/catalog/home/rail-limits';
import { NO_PRODUCT_DELIVERY } from '../../src/lib/delivery';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '../../src/lib/types';

function category(index: number): CatalogCategory {
  return {
    id: String(index),
    slug: `department-${index}`,
    name: { bn: null, en: `Department ${index}` },
    blurb: { bn: null, en: null },
    icon: 'other',
    sortOrder: index,
    parentId: null,
    imageKey: null,
    tagline: null,
  };
}

function brand(index: number): CatalogBrand {
  return {
    id: String(index),
    slug: `brand-${index}`,
    name: { bn: null, en: `Brand ${index}` },
    logoKey: null,
    productCount: 1,
  };
}

function select(categoryCount: number, brandCount: number) {
  return selectHomepage({
    products: [],
    categories: Array.from({ length: categoryCount }, (_, index) => category(index)),
    brands: Array.from({ length: brandCount }, (_, index) => brand(index)),
    featuredIds: [],
    collectionIds: [],
    bestSellerIds: [],
  });
}

function item(index: number, overrides: Partial<CatalogItem> = {}): CatalogItem {
  const base: CatalogItem = {
    id: String(index),
    slug: `product-${index}`,
    name: { bn: null, en: `Product ${index}` },
    description: { bn: null, en: null },
    shortDescription: null,
    brand: null,
    brandSlug: null,
    categoryId: '0',
    categorySlug: 'department-0',
    pack: null,
    deliveryMinor: NO_PRODUCT_DELIVERY,
    priceMinor: 10000,
    compareAtPriceMinor: null,
    ratingHalves: null,
    availability: 'in_stock',
    images: [],
    source: 'database',
    // Undated by default, so a product only joins the recency row when a test dates it.
    createdAt: null,
  };
  return { ...base, ...overrides };
}

describe('homepage discovery rails', () => {
  it('publishes the desktop number of departments and brands, not the whole index', () => {
    const selection = select(30, 40);
    assert.equal(selection.departments.length, RAIL_LIMIT);
    assert.equal(selection.brands.length, RAIL_LIMIT);
  });

  it('offers the way to the index once the shop has more than the rail draws', () => {
    const atTheLimit = select(RAIL_LIMIT, RAIL_LIMIT);
    assert.equal(atTheLimit.departmentsHaveMore, false, 'fifteen is the whole rail');
    assert.equal(atTheLimit.brandsHaveMore, false);
    assert.equal(atTheLimit.departments.length, RAIL_LIMIT);

    const oneMore = select(RAIL_LIMIT + 1, RAIL_LIMIT + 1);
    assert.equal(oneMore.departmentsHaveMore, true, 'the sixteenth is only at the index');
    assert.equal(oneMore.brandsHaveMore, true);
    assert.equal(oneMore.departments.length, RAIL_LIMIT, 'and the rail still draws fifteen');
  });

  it('shows a short shop in full, with no control behind it', () => {
    const selection = select(5, 3);
    assert.deepEqual(
      selection.departments.map((entry) => entry.slug),
      ['department-0', 'department-1', 'department-2', 'department-3', 'department-4'],
    );
    assert.equal(selection.brands.length, 3);
    assert.equal(selection.departmentsHaveMore, false);
    assert.equal(selection.brandsHaveMore, false);
  });

  /*
   * The three product rows end their carousel with an "All offers" / "All best sellers" / "All new
   * arrivals" tile, and only when the row's own claim holds more than the row draws (owner direction,
   * 2026-11-12). The comparison is against the **eligible** set, so a shop whose ten products are all
   * discounted and all shown gets no tile - there is nothing behind it.
   */
  it('offers the product rows a way out only when their own set is larger than the row', () => {
    const categories = [category(0)];
    const rows = (count: number) =>
      selectHomepage({
        products: Array.from({ length: count }, (_, index) =>
          item(index + 1, { priceMinor: 10000, compareAtPriceMinor: 12000 }),
        ),
        categories,
        brands: [],
        featuredIds: [],
        collectionIds: [],
        bestSellerIds: [],
      });

    assert.equal(rows(10).dealsHaveMore, false, 'ten offers complete the row exactly');
    assert.equal(rows(11).dealsHaveMore, true, 'an eleventh is behind the tile');
    assert.equal(rows(11).deals.length, 10);

    // Most Selling counts only what the shop has sold, so an unranked catalog gets no tile.
    const ranked = Array.from({ length: 11 }, (_, index) => item(index + 1));
    const sold = selectHomepage({
      products: ranked,
      categories,
      brands: [],
      featuredIds: [],
      collectionIds: [],
      bestSellerIds: ranked.map((product) => product.id),
    });
    assert.equal(sold.bestSellers.length, 10);
    assert.equal(sold.bestSellersHaveMore, true);
    const unsold = selectHomepage({
      products: ranked,
      categories,
      brands: [],
      featuredIds: [],
      collectionIds: [],
      bestSellerIds: [],
    });
    assert.equal(unsold.bestSellersHaveMore, false, 'a shop that has sold nothing has no ranking');

    // Recency needs a real stored date, so an undated catalog has nothing to see beyond the row.
    const dated = Array.from({ length: 11 }, (_, index) =>
      item(index + 1, { createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    const newest = selectHomepage({
      products: dated,
      categories,
      brands: [],
      featuredIds: [],
      collectionIds: [],
      bestSellerIds: [],
    });
    assert.equal(newest.newArrivals.length, 10);
    assert.equal(newest.newArrivalsHaveMore, true);
    assert.equal(rows(11).newArrivalsHaveMore, false, 'undated products cannot be "new arrivals"');
  });
});
