/**
 * "Recently added" selection logic (D6, Phase 26).
 *
 * The homepage publishes a fixed number of products "most recently added" - five since the 2026-10-23
 * revision, one complete row of the five-column grid. That is a factual claim about arrival order, so
 * the selection is tested directly rather than only through a rendered page: the ordering must come
 * from `createdAt`, ties must resolve deterministically, undated records must not participate, and the
 * row must never be padded to the limit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HERO_IMAGE_COUNT,
  RECENT_LIMIT,
  selectHeroProducts,
  selectRecentlyAdded,
} from '../../src/features/catalog/recent';
import type { CatalogItem } from '../../src/lib/types';

function item(
  id: string,
  createdAt: string | null,
  imageKey: string | null = `photo-${id}`,
): CatalogItem {
  return {
    id,
    slug: `product-${id}`,
    name: { bn: `পণ্য ${id}`, en: `Product ${id}` },
    description: { bn: null, en: null },
    shortDescription: null,
    brand: null,
    categoryId: 'skincare',
    categorySlug: 'skincare',
    pack: null,
    priceMinor: 10_000,
    compareAtPriceMinor: null,
    availability: 'in_stock',
    images:
      imageKey === null
        ? []
        : [{ key: imageKey, alt: { bn: null, en: null }, rights: 'merchant_source_pending_confirmation' }],
    source: 'database',
    createdAt,
  };
}

describe('selectRecentlyAdded', () => {
  it('publishes exactly the section size', () => {
    const catalog = Array.from({ length: 8 }, (_, index) =>
      item(String(index + 1), `2026-10-0${index + 1}T00:00:00.000Z`),
    );
    const selected = selectRecentlyAdded(catalog);
    assert.equal(RECENT_LIMIT, 5);
    assert.equal(selected.length, 5);
  });

  it('returns the newest products, newest first', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('5', '2026-10-05T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z'),
      item('6', '2026-10-06T00:00:00.000Z'),
      item('4', '2026-10-04T00:00:00.000Z'),
    ];
    assert.deepEqual(
      selectRecentlyAdded(catalog).map((product) => product.id),
      ['6', '5', '4', '3', '1'],
    );
  });

  it('ignores the incoming array order', () => {
    const ascending = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z'),
      item('4', '2026-10-04T00:00:00.000Z'),
    ];
    const shuffled = [ascending[2]!, ascending[0]!, ascending[3]!, ascending[1]!];
    assert.deepEqual(
      selectRecentlyAdded(ascending).map((product) => product.id),
      selectRecentlyAdded(shuffled).map((product) => product.id),
    );
  });

  it('resolves equal timestamps by descending id, deterministically', () => {
    const instant = '2026-10-20T12:00:00.000Z';
    const tied = [item('7', instant), item('9', instant), item('8', instant), item('1', instant)];

    const first = selectRecentlyAdded(tied).map((product) => product.id);
    const second = selectRecentlyAdded([...tied].reverse()).map((product) => product.id);

    assert.deepEqual(first, ['9', '8', '7', '1'], 'higher id wins when instants are equal');
    assert.deepEqual(first, second, 'the result does not depend on input order');
  });

  it('excludes a record that carries no stated creation date', () => {
    const catalog = [
      item('1', null),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('3', null),
      item('4', '2026-10-04T00:00:00.000Z'),
    ];
    assert.deepEqual(
      selectRecentlyAdded(catalog).map((product) => product.id),
      ['4', '2'],
      'undated records are omitted, never placed by guesswork',
    );
  });

  it('excludes a record whose date cannot be parsed', () => {
    const catalog = [item('1', 'not-a-date'), item('2', '2026-10-02T00:00:00.000Z')];
    assert.deepEqual(
      selectRecentlyAdded(catalog).map((product) => product.id),
      ['2'],
    );
  });

  it('returns every dated product when fewer than the section size exist, without padding', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
    ];
    const selected = selectRecentlyAdded(catalog);
    assert.equal(selected.length, 2, 'two real products, not five slots filled');
    assert.equal(new Set(selected.map((product) => product.id)).size, 2, 'no duplicate entries');
  });

  it('returns nothing when no product is dated', () => {
    assert.deepEqual(selectRecentlyAdded([item('1', null), item('2', null)]), []);
    assert.deepEqual(selectRecentlyAdded([]), []);
  });

  it('never repeats a product across the section slots', () => {
    const catalog = Array.from({ length: 8 }, (_, index) =>
      item(String(index + 1), `2026-10-${String(index + 10)}T00:00:00.000Z`),
    );
    const ids = selectRecentlyAdded(catalog).map((product) => product.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('selectHeroProducts', () => {
  it('shows exactly three photographs, newest first', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('4', '2026-10-04T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('5', '2026-10-05T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z'),
    ];
    const selected = selectHeroProducts(catalog);
    assert.equal(HERO_IMAGE_COUNT, 3, 'the hero composition has three frames');
    assert.deepEqual(selected.map((product) => product.id), ['5', '4', '3']);
  });

  it('takes each frame from that product record, not from a curated list', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z'),
    ];
    const selected = selectHeroProducts(catalog);
    assert.deepEqual(
      selected.map((product) => product.slug),
      ['product-3', 'product-2', 'product-1'],
    );
    // The rendered src is derived from this key, so the key is what a browser check can verify.
    assert.deepEqual(
      selected.map((product) => product.images[0]?.key),
      ['photo-3', 'photo-2', 'photo-1'],
    );
  });

  it('promotes a newly added product to the lead frame', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z'),
    ];
    assert.equal(selectHeroProducts(catalog)[0]?.id, '3');

    const withNewArrival = [...catalog, item('9', '2026-10-09T00:00:00.000Z')];
    assert.deepEqual(
      selectHeroProducts(withNewArrival).map((product) => product.id),
      ['9', '3', '2'],
      'the newest product leads, and the row still holds three',
    );
  });

  it('resolves equal timestamps by descending id, deterministically', () => {
    const instant = '2026-10-20T12:00:00.000Z';
    const tied = [item('4', instant), item('6', instant), item('5', instant)];
    assert.deepEqual(selectHeroProducts(tied).map((product) => product.id), ['6', '5', '4']);
    assert.deepEqual(
      selectHeroProducts([...tied].reverse()).map((product) => product.id),
      ['6', '5', '4'],
      'the order does not depend on the incoming array',
    );
  });

  it('skips a product with no photograph instead of rendering an empty frame', () => {
    const catalog = [
      item('1', '2026-10-01T00:00:00.000Z'),
      item('2', '2026-10-02T00:00:00.000Z'),
      item('3', '2026-10-03T00:00:00.000Z', null),
    ];
    assert.deepEqual(
      selectHeroProducts(catalog).map((product) => product.id),
      ['2', '1'],
      'the newer undated-photograph product does not take a slot it cannot fill',
    );
  });

  it('shows fewer than three rather than inventing or repeating a product', () => {
    const catalog = [item('1', '2026-10-01T00:00:00.000Z'), item('2', '2026-10-02T00:00:00.000Z')];
    const selected = selectHeroProducts(catalog);
    assert.equal(selected.length, 2);
    assert.equal(new Set(selected.map((product) => product.id)).size, 2);
  });

  it('shows nothing for an empty or undated catalog', () => {
    assert.deepEqual(selectHeroProducts([]), []);
    assert.deepEqual(selectHeroProducts([item('1', null), item('2', null)]), []);
  });
});
