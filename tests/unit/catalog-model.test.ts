import assert from 'node:assert/strict';
import test from 'node:test';

import { categories } from '@/data/categories';
import { products } from '@/data/catalog';
import {
  categoryIcon,
  fixtureToCatalogCategory,
  fixtureToCatalogItem,
} from '@/features/catalog/model';

/**
 * The fixture adapter is the only translation from the Phase 1 record into the storefront view type.
 * These tests pin the two properties the cutover depends on: it never leaks fixture-only provenance
 * into the view model, and it always marks the result as fixture-sourced.
 */

test('categoryIcon maps the known slugs and degrades to a neutral glyph', () => {
  assert.equal(categoryIcon('skincare'), 'serum');
  assert.equal(categoryIcon('haircare'), 'hair');
  assert.equal(categoryIcon('bodycare'), 'body');
  assert.equal(categoryIcon('lipcare'), 'lip');
  assert.equal(categoryIcon('accessories'), 'tools');

  // An owner-created category has no mapping; it must not inherit another category's glyph.
  assert.equal(categoryIcon('fragrance'), 'other');
  assert.equal(categoryIcon(''), 'other');
});

test('fixtureToCatalogItem carries only view facts and is marked fixture-sourced', () => {
  const [fixture] = products;
  assert.ok(fixture, 'expected at least one fixture product');

  const item = fixtureToCatalogItem(fixture);

  assert.equal(item.source, 'fixture');
  assert.equal(item.id, fixture.id);
  assert.equal(item.slug, fixture.slug);
  assert.equal(item.priceMinor, fixture.priceMinor);
  assert.equal(item.compareAtPriceMinor, fixture.compareAtPriceMinor);
  assert.equal(item.availability, fixture.availability);

  // The category id is the slug in the fixture; both fields agree so filtering keys on one value.
  assert.equal(item.categorySlug, item.categoryId);
  assert.equal(item.categorySlug, fixture.categoryId);

  // No fixture-only provenance may reach the view model.
  assert.deepEqual(
    Object.keys(item).sort(),
    [
      'availability',
      'brand',
      'categoryId',
      'categorySlug',
      'compareAtPriceMinor',
      'createdAt',
      'description',
      'id',
      'images',
      'name',
      'pack',
      'priceMinor',
      'slug',
      'source',
    ],
  );

  // Images are reduced to what renders, and never claim to be cleared.
  for (const image of item.images) {
    assert.deepEqual(Object.keys(image).sort(), ['alt', 'key', 'rights']);
    assert.notEqual(image.rights, 'cleared');
  }

  // Props handed to a client component must survive serialization.
  assert.deepEqual(JSON.parse(JSON.stringify(item)), item);
});

test('fixtureToCatalogCategory derives the icon from the slug', () => {
  const category = categories.find((entry) => entry.slug === 'haircare');
  assert.ok(category, 'expected a haircare fixture category');

  const projected = fixtureToCatalogCategory(category);
  assert.equal(projected.slug, 'haircare');
  assert.equal(projected.icon, 'hair');
  assert.equal(projected.name.en, category.name.en);
  assert.equal(projected.sortOrder, 0);

  // Every fixture category resolves to a mapped glyph, not the neutral fallback.
  for (const entry of categories) {
    assert.notEqual(fixtureToCatalogCategory(entry).icon, 'other', entry.slug);
  }
});
