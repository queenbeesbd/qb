import assert from 'node:assert/strict';
import test from 'node:test';

import { getStorefrontCatalog } from '@/server/catalog/storefront';

/**
 * The development opt-in path. It must serve the fixture without a database at all, because that is
 * the only reason the escape hatch exists - a "fallback" that still requires the database would be a
 * fallback for a failure mode nobody has.
 */

test('an enabled dev opt-in serves the fixture catalog with no database connection', async () => {
  delete process.env.DATABASE_URL;
  process.env.QUEENBEES_STOREFRONT_FIXTURE = '1';
  process.env.QUEENBEES_ENV = 'development';

  const catalog = await getStorefrontCatalog();

  assert.equal(catalog.source, 'fixture');
  assert.equal(catalog.products.length, 22);
  assert.equal(catalog.categories.length, 5);
  assert.equal(catalog.featuredIds.length, 5);
  assert.equal(catalog.collectionIds.length, 5);

  // Every record is marked fixture-sourced, and the selections resolve to real records.
  const ids = new Set(catalog.products.map((product) => product.id));
  for (const product of catalog.products) assert.equal(product.source, 'fixture');
  for (const id of [...catalog.featuredIds, ...catalog.collectionIds]) assert.ok(ids.has(id));

  // The two curated selections stay disjoint, as the Phase 1 curation invariant requires.
  const overlap = catalog.featuredIds.filter((id) => catalog.collectionIds.includes(id));
  assert.deepEqual(overlap, []);
});
