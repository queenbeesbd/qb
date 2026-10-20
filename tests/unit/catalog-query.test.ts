/**
 * Untrusted search-parameter parsing, as a pure function.
 *
 * The listing URL is the one place a value that is not a database identity a customer can paste - a
 * category slug - is compared for equality against the served set. These assertions pin the narrow
 * contract that comparison must obey: surrounding whitespace is clerical, not part of the slug, so a
 * pasted link must not widen the listing to the whole catalog, while a genuinely unknown slug is
 * still dropped rather than selecting an empty result set.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCatalogQuery, selectCatalog } from '@/features/catalog/query';
import type { CatalogCategory, CatalogItem } from '@/lib/types';

const CATEGORY_40 = 'a'.repeat(40);

const categories: CatalogCategory[] = [
  {
    id: 'skincare',
    slug: 'skincare',
    name: { bn: 'স্কিনকেয়ার', en: 'Skincare' },
    blurb: { bn: null, en: null },
    icon: 'serum',
    sortOrder: 0,
  },
  {
    id: CATEGORY_40,
    slug: CATEGORY_40,
    name: { bn: null, en: 'Long slug' },
    blurb: { bn: null, en: null },
    icon: 'other',
    sortOrder: 1,
  },
];

const products: CatalogItem[] = [
  {
    id: '1',
    slug: 'serum',
    name: { bn: null, en: 'Serum' },
    description: { bn: null, en: null },
    brand: null,
    categoryId: 'skincare',
    categorySlug: 'skincare',
    pack: null,
    priceMinor: 10000,
    compareAtPriceMinor: null,
    availability: 'in_stock',
    images: [],
    source: 'database',
    createdAt: null,
  },
  {
    id: '2',
    slug: 'shampoo',
    name: { bn: null, en: 'Shampoo' },
    description: { bn: null, en: null },
    brand: null,
    categoryId: 'haircare',
    categorySlug: 'haircare',
    pack: null,
    priceMinor: 20000,
    compareAtPriceMinor: null,
    availability: 'in_stock',
    images: [],
    source: 'database',
    createdAt: null,
  },
];

describe('parseCatalogQuery category', () => {
  it('accepts a known slug with surrounding whitespace and filters to it', () => {
    const query = parseCatalogQuery({ category: '  skincare  ' }, categories);
    assert.equal(query.category, 'skincare', 'the slug is trimmed before it is compared');

    const selected = selectCatalog(products, query);
    assert.deepEqual(
      selected.map((item) => item.slug),
      ['serum'],
      'a trimmed valid slug narrows the listing instead of widening it',
    );
  });

  it('drops an unknown slug rather than selecting an empty result set', () => {
    const query = parseCatalogQuery({ category: 'not-a-category' }, categories);
    assert.equal(query.category, '', 'an unknown slug clears the filter');

    // The filter is cleared, so the listing is the whole catalog - not an empty page.
    assert.equal(selectCatalog(products, query).length, products.length);
  });

  it('keeps the 40-character cap', () => {
    // A known slug of exactly 40 characters is selectable.
    assert.equal(parseCatalogQuery({ category: CATEGORY_40 }, categories).category, CATEGORY_40);

    // Anything beyond 40 characters is truncated to 40 before comparison, so a longer value still
    // resolves to the 40-character slug rather than being dropped.
    assert.equal(
      parseCatalogQuery({ category: `${'a'.repeat(45)}` }, categories).category,
      CATEGORY_40,
    );

    // A real slug longer than 40 characters can never be selected: it truncates to 40 and matches
    // nothing.
    const longSlug = 'b'.repeat(41);
    const longCategories: CatalogCategory[] = [
      {
        id: longSlug,
        slug: longSlug,
        name: { bn: null, en: 'Too long' },
        blurb: { bn: null, en: null },
        icon: 'other',
        sortOrder: 0,
      },
    ];
    assert.equal(parseCatalogQuery({ category: longSlug }, longCategories).category, '');
  });
});
