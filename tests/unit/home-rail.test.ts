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
import { RAIL_DESKTOP_LIMIT, RAIL_MOBILE_LIMIT } from '../../src/features/catalog/home/rail-limits';
import type { CatalogBrand, CatalogCategory } from '../../src/lib/types';

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

describe('homepage discovery rails', () => {
  it('publishes the desktop number of departments and brands, not the whole index', () => {
    const selection = select(30, 40);
    assert.equal(selection.departments.length, RAIL_DESKTOP_LIMIT);
    assert.equal(selection.brands.length, RAIL_DESKTOP_LIMIT);
  });

  it('offers the way to the index once the phone rail would hide something', () => {
    const atTheLimit = select(RAIL_MOBILE_LIMIT, RAIL_MOBILE_LIMIT);
    assert.equal(atTheLimit.departmentsHaveMore, false, 'fifteen all fit on a phone');
    assert.equal(atTheLimit.brandsHaveMore, false);
    assert.equal(atTheLimit.departments.length, RAIL_MOBILE_LIMIT);

    const oneMore = select(RAIL_MOBILE_LIMIT + 1, RAIL_MOBILE_LIMIT + 1);
    assert.equal(oneMore.departmentsHaveMore, true);
    assert.equal(oneMore.brandsHaveMore, true);
    assert.equal(oneMore.departments.length, RAIL_MOBILE_LIMIT + 1);
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
});
