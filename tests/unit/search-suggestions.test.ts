/**
 * The header's suggestion selection (ADR 0041).
 *
 * These assertions pin what the popup may show, because it is the one read surface the storefront exposes
 * and its rows are claims: what matches, what order, how many, and whether a struck-through price is
 * backed by a real saving. The matcher itself is covered by `fuzzy-search.test.ts`; here the subject is
 * the ranking and the projection.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectSuggestions } from '@/features/catalog/suggestions';
import { NO_PRODUCT_DELIVERY } from '@/lib/delivery';
import type { CatalogItem } from '@/lib/types';

function product(overrides: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'name'>): CatalogItem {
  const slug = `p-${overrides.id}`;
  return {
    slug,
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
    ...overrides,
  };
}

const CATALOG: readonly CatalogItem[] = [
  product({ id: '1', name: { bn: null, en: 'Dabo Hanbang Peeling Gel 180ml' }, priceMinor: 79900, compareAtPriceMinor: 105000 }),
  product({ id: '2', name: { bn: null, en: 'Dabo Pink Collagen Sunscreen 50ml' }, priceMinor: 54900, compareAtPriceMinor: 73000 }),
  product({ id: '3', name: { bn: null, en: 'Dabo Yuja-C Toner 150ml' }, priceMinor: 105000 }),
  product({ id: '4', name: { bn: null, en: 'Lilac Serum 30ml' }, brand: 'Lilac', pack: '30 ml' }),
  product({ id: '5', name: { bn: null, en: 'Dabo Cream' }, availability: 'out_of_stock' }),
  product({ id: '6', name: { bn: null, en: 'Dabo Cream' }, availability: 'in_stock' }),
  product({ id: '7', name: { bn: null, en: 'Dabo Mask' } }),
  product({ id: '8', name: { bn: null, en: 'Dabo Soap' } }),
];

describe('header search suggestions', () => {
  it('asks for nothing below two letters', () => {
    assert.deepEqual(selectSuggestions(CATALOG, ''), []);
    assert.deepEqual(selectSuggestions(CATALOG, ' '), []);
    assert.deepEqual(selectSuggestions(CATALOG, 'd'), []);
    assert.notDeepEqual(selectSuggestions(CATALOG, 'da'), []);
  });

  it('never returns more rows than the popup shows, and puts a buyable product first', () => {
    const all = selectSuggestions(CATALOG, 'dabo');
    assert.equal(all.length, 6, 'the seventh match is not drawn');
    assert.deepEqual(all.filter((row) => row.name === 'Dabo Cream').map((row) => row.id), ['6', '5']);
  });

  it('ranks a more specific term above a shorter name that only shares its first word', () => {
    // "Dabo" alone ranks the shortest name first (the shared matcher's prefix band); adding the product
    // word is what makes the suggestion specific. Both orders are the listing's own.
    assert.equal(selectSuggestions(CATALOG, 'dabo peeling')[0]?.slug, 'p-1');
    assert.equal(selectSuggestions(CATALOG, 'yuja')[0]?.slug, 'p-3');
    // The listing's matcher searches brand and pack, so the popup does too - and a suggestion must
    // never name a product the page it opens would not contain.
    assert.equal(selectSuggestions(CATALOG, 'lilac')[0]?.slug, 'p-4');
    assert.equal(selectSuggestions(CATALOG, '30ml')[0]?.slug, 'p-4');
  });

  it('prints a comparison price only when the saving is genuine', () => {
    const [first] = selectSuggestions(CATALOG, 'peeling');
    assert.equal(first?.priceMinor, 79900);
    assert.equal(first?.compareAtPriceMinor, 105000);

    const [noSaving] = selectSuggestions(CATALOG, 'toner');
    assert.equal(noSaving?.priceMinor, 105000);
    assert.equal(noSaving?.compareAtPriceMinor, null);
  });

  it('names the product the way a shopper reads it, falling back to Bangla and then the slug', () => {
    const [english] = selectSuggestions(CATALOG, 'lilac');
    assert.equal(english?.name, 'Lilac Serum 30ml');

    const bangla = product({ id: '9', slug: 'bangla-only', name: { bn: 'সিরাম', en: null } });
    assert.equal(selectSuggestions([bangla], 'সিরাম')[0]?.name, 'সিরাম');

    // A record with no name matches on its brand and is drawn under its slug: the slug is not a search
    // field, so it is a label of last resort rather than a way to find something.
    const slugOnly = product({
      id: '10',
      slug: 'slug-named',
      name: { bn: null, en: null },
      brand: 'Ghostbrand',
    });
    assert.equal(selectSuggestions([slugOnly], 'ghostbrand')[0]?.name, 'slug-named');
    assert.deepEqual(selectSuggestions([slugOnly], 'slug-named'), []);
  });

  it('carries the photograph the row draws and no first image when there is none', () => {
    const withPhoto = product({
      id: '11',
      name: { bn: null, en: 'Photo product' },
      images: [
        { key: 'photo-key', alt: { bn: null, en: null }, rights: 'cleared' },
        { key: 'second-key', alt: { bn: null, en: null }, rights: 'cleared' },
      ],
    });
    const [row] = selectSuggestions([withPhoto], 'photo');
    assert.equal(row?.image?.key, 'photo-key');
    assert.equal(selectSuggestions(CATALOG, 'lilac')[0]?.image, null);
  });
});
