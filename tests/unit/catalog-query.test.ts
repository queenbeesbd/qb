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

import {
  buildCatalogFacets,
  filterProducts,
  parseCatalogQuery,
  selectCatalog,
  type CatalogQuery,
} from '@/features/catalog/query';
import { listingHref } from '@/features/catalog/listing/url';
import { NO_PRODUCT_DELIVERY } from '@/lib/delivery';
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
    parentId: null,
    imageKey: null,
    tagline: null,
  },
  {
    id: CATEGORY_40,
    slug: CATEGORY_40,
    name: { bn: null, en: 'Long slug' },
    blurb: { bn: null, en: null },
    icon: 'other',
    sortOrder: 1,
    parentId: null,
    imageKey: null,
    tagline: null,
  },
];

const products: CatalogItem[] = [
  {
    id: '1',
    slug: 'serum',
    name: { bn: null, en: 'Serum' },
    description: { bn: null, en: null },
    shortDescription: null,
    brand: null,

    brandSlug: null,
    categoryId: 'skincare',
    categorySlug: 'skincare',
    pack: null,
    deliveryMinor: NO_PRODUCT_DELIVERY,
    priceMinor: 10000,
    compareAtPriceMinor: null,
    ratingHalves: null,
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
    shortDescription: null,
    brand: null,

    brandSlug: null,
    categoryId: 'haircare',
    categorySlug: 'haircare',
    pack: null,
    deliveryMinor: NO_PRODUCT_DELIVERY,
    priceMinor: 20000,
    compareAtPriceMinor: null,
    ratingHalves: null,
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
    parentId: null,
    imageKey: null,
    tagline: null,
      },
    ];
    assert.equal(parseCatalogQuery({ category: longSlug }, longCategories).category, '');
  });
});

/*
 * The listing's filter contract beyond category: multi-brand, price bounds, availability,
 * recency and the counts the rail actually renders. Each value below is derived from the same
 * records the grid would select, so a facet can never advertise a count the filter cannot yield.
 */
describe('catalog filter facets', () => {
  const listingCategories: CatalogCategory[] = [
    {
      id: 'skincare',
      slug: 'skincare',
      name: { bn: null, en: 'Skincare' },
      blurb: { bn: null, en: null },
      icon: 'serum',
      sortOrder: 0,
    parentId: null,
    imageKey: null,
    tagline: null,
    },
    {
      id: 'haircare',
      slug: 'haircare',
      name: { bn: null, en: 'Haircare' },
      blurb: { bn: null, en: null },
      icon: 'hair',
      sortOrder: 1,
    parentId: null,
    imageKey: null,
    tagline: null,
    },
  ];

  const listingProducts: CatalogItem[] = [
    {
      id: '1',
      slug: 'serum',
      name: { bn: null, en: 'Serum' },
      description: { bn: null, en: null },
      shortDescription: null,
      brand: 'Lilac',

      brandSlug: null,
      categoryId: 'skincare',
      categorySlug: 'skincare',
      pack: '30 ml',
      deliveryMinor: NO_PRODUCT_DELIVERY,
      priceMinor: 10000,
      compareAtPriceMinor: null,
      ratingHalves: null,
      availability: 'in_stock',
      images: [],
      source: 'database',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: '2',
      slug: 'shampoo',
      name: { bn: null, en: 'Shampoo' },
      description: { bn: null, en: null },
      shortDescription: null,
      brand: 'Aura',

      brandSlug: null,
      categoryId: 'haircare',
      categorySlug: 'haircare',
      pack: null,
      deliveryMinor: NO_PRODUCT_DELIVERY,
      priceMinor: 20000,
      compareAtPriceMinor: null,
      ratingHalves: null,
      availability: 'out_of_stock',
      images: [],
      source: 'database',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '3',
      slug: 'toner',
      name: { bn: null, en: 'Toner' },
      description: { bn: null, en: null },
      shortDescription: null,
      brand: 'Lilac',

      brandSlug: null,
      categoryId: 'skincare',
      categorySlug: 'skincare',
      pack: null,
      deliveryMinor: NO_PRODUCT_DELIVERY,
      priceMinor: 30000,
      compareAtPriceMinor: null,
      ratingHalves: null,
      availability: 'in_stock',
      images: [],
      source: 'database',
      createdAt: null,
    },
    {
      id: '4',
      slug: 'mask',
      name: { bn: null, en: 'Mask' },
      description: { bn: null, en: null },
      shortDescription: null,
      brand: null,

      brandSlug: null,
      categoryId: 'skincare',
      categorySlug: 'skincare',
      pack: null,
      deliveryMinor: NO_PRODUCT_DELIVERY,
      priceMinor: 5000,
      compareAtPriceMinor: null,
      ratingHalves: null,
      availability: 'in_stock',
      images: [],
      source: 'database',
      createdAt: '2026-01-03T00:00:00.000Z',
    },
  ];

  it('reads repeated brand parameters as a multi-select and matches any chosen brand', () => {
    const query = parseCatalogQuery({ brand: ['Lilac', 'Aura'] }, listingCategories);
    assert.deepEqual(query.brands, ['Lilac', 'Aura']);

    assert.deepEqual(
      selectCatalog(listingProducts, query).map((item) => item.slug),
      ['serum', 'shampoo', 'toner'],
    );
  });

  it('parses whole-taka price bounds into poisha, swaps a reversed pair and refuses a formatted amount', () => {
    const bounded = parseCatalogQuery({ min: '120', max: '250' }, listingCategories);
    assert.equal(bounded.minPrice, 12000);
    assert.equal(bounded.maxPrice, 25000);

    const reversed = parseCatalogQuery({ min: '250', max: '120' }, listingCategories);
    assert.equal(reversed.minPrice, 12000, 'a reversed pair is still a range, not an empty result');
    assert.equal(reversed.maxPrice, 25000);

    const formatted = parseCatalogQuery({ min: 'Tk 1,200' }, listingCategories);
    assert.equal(formatted.minPrice, null, 'a formatted amount is not guessed into a boundary');
  });

  it('keeps only availability states the shop actually has', () => {
    const query = parseCatalogQuery(
      { availability: ['out_of_stock', 'not-a-state'] },
      listingCategories,
    );
    assert.deepEqual(query.availability, ['out_of_stock']);
    assert.deepEqual(
      selectCatalog(listingProducts, query).map((item) => item.slug),
      ['shampoo'],
    );
  });

  it('sorts newest by the stored timestamp and leaves undated records last', () => {
    const query = parseCatalogQuery({ sort: 'newest' }, listingCategories);
    assert.deepEqual(
      selectCatalog(listingProducts, query).map((item) => item.slug),
      ['mask', 'serum', 'shampoo', 'toner'],
    );
  });

  it('derives facet counts and price bounds from the same catalog snapshot', () => {
    const facets = buildCatalogFacets(listingProducts, listingCategories, 'skincare');

    assert.deepEqual(facets.brands, [{ name: 'Lilac', count: 2 }]);
    assert.deepEqual(facets.categories, [
      { slug: 'skincare', count: 3 },
      { slug: 'haircare', count: 1 },
    ]);
    assert.deepEqual(facets.availability, { in_stock: 3, out_of_stock: 0 });
    assert.deepEqual(facets.price, { min: 5000, max: 30000 });
  });

  it('writes a canonical listing URL, with repeated facets and the category as a route', () => {
    const query: CatalogQuery = {
      q: 'rose',
      category: 'skincare',
      brands: ['Lilac', 'Aura'],
      minPrice: 12000,
      maxPrice: null,
      availability: ['in_stock'],
      sort: 'newest',
      page: 2,
    };

    assert.equal(
      listingHref(query),
      '/categories/skincare?q=rose&brand=Lilac&brand=Aura&min=120&availability=in_stock&sort=newest&page=2',
    );

    assert.equal(
      listingHref({ ...query, q: '', category: '', brands: [], minPrice: null, availability: [], sort: 'relevance', page: 1 }),
      '/products',
    );
  });

  it('matches a typed prefix without pressing search, and a one-letter misspelling', () => {
    const prefix = selectCatalog(listingProducts, parseCatalogQuery({ q: 'sha' }, listingCategories));
    assert.deepEqual(
      prefix.map((item) => item.slug),
      ['shampoo'],
      'a term finds the product whose name starts with it, which is the search-as-you-type case',
    );

    const typo = selectCatalog(listingProducts, parseCatalogQuery({ q: 'serun' }, listingCategories));
    assert.deepEqual(
      typo.map((item) => item.slug),
      ['serum'],
      'one wrong character is still the word the shopper meant',
    );
  });

  it('searches the brand field too, and an exact name does not drag in unrelated rows', () => {
    const byBrand = selectCatalog(listingProducts, parseCatalogQuery({ q: 'lilac' }, listingCategories));
    assert.deepEqual(byBrand.map((item) => item.slug).sort(), ['serum', 'toner']);

    const prefix = selectCatalog(listingProducts, parseCatalogQuery({ q: 'ser' }, listingCategories));
    assert.deepEqual(prefix.map((item) => item.slug), ['serum']);
  });
});

describe('subcategory listing scope', () => {
  const parent: CatalogCategory = {
    id: '10',
    slug: 'skincare',
    name: { bn: null, en: 'Skincare' },
    blurb: { bn: null, en: null },
    icon: 'serum',
    sortOrder: 0,
    parentId: null,
    imageKey: null,
    tagline: null,
  };
  const child: CatalogCategory = {
    id: '11',
    slug: 'face-masks',
    name: { bn: null, en: 'Face masks' },
    blurb: { bn: null, en: null },
    icon: 'other',
    sortOrder: 1,
    parentId: parent.id,
    imageKey: null,
    tagline: null,
  };

  const item = (id: string, categoryId: string, categorySlug: string): CatalogItem => ({
    id,
    slug: id,
    name: { bn: null, en: id },
    description: { bn: null, en: null },
    shortDescription: null,
    brand: null,
    brandSlug: null,
    categoryId,
    categorySlug,
    pack: null,
    deliveryMinor: NO_PRODUCT_DELIVERY,
    priceMinor: 10_000,
    compareAtPriceMinor: null,
    ratingHalves: null,
    availability: 'in_stock',
    images: [],
    source: 'database',
    createdAt: null,
  });

  const products = [item('toner', parent.id, parent.slug), item('mask', child.id, child.slug)];

  it('includes a subcategory\u2019s products on its parent page, and only its own elsewhere', () => {
    const query = {
      q: '',
      category: parent.slug,
      categorySlugs: [parent.slug, child.slug],
      brands: [],
      minPrice: null,
      maxPrice: null,
      availability: [],
      sort: 'relevance' as const,
      page: 1,
    };
    assert.equal(filterProducts(products, query).length, 2);
    assert.equal(filterProducts(products, { ...query, categorySlugs: undefined }).length, 1);
    assert.equal(
      filterProducts(products, { ...query, category: child.slug, categorySlugs: [child.slug] }).length,
      1,
    );
  });

  it('scopes the facet counts to the same parent-and-children set', () => {
    const scoped = buildCatalogFacets(products, [parent, child], parent.slug, [
      parent.slug,
      child.slug,
    ]);
    assert.deepEqual(scoped.availability, { in_stock: 2, out_of_stock: 0 });
    assert.deepEqual(
      scoped.categories,
      [
        // Choosing the parent yields both products; the child states its own direct count.
        { slug: 'skincare', count: 2 },
        { slug: 'face-masks', count: 1 },
      ],
    );

    const direct = buildCatalogFacets(products, [parent, child], parent.slug);
    assert.deepEqual(direct.availability, { in_stock: 1, out_of_stock: 0 });
  });
});
