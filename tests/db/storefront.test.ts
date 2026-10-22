/**
 * The storefront catalog loader against real PostgreSQL: the Phase 14 cutover, at the seam.
 *
 * These assertions are about the *snapshot the storefront receives*, not about SQL and not about a
 * rendered page. They exist to prove the cutover's promise: the storefront is served the seeded
 * database catalog, it is marked as database-sourced (so a fixture record can never be presented as
 * a database record), and the typed query layer applied to that snapshot reproduces exactly the
 * listing behaviour the storefront published before the cutover.
 *
 * The five filter/sort cases below are the same parity contract `scripts/verify-browser.cjs`
 * enforces over HTTP. Asserting them here as well means a regression names the layer it lives in -
 * the query layer, the loader, or the browser - instead of only "the catalogue page is wrong".
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { seedCatalog } from '../../src/db/seed-catalog';
import { UNBRANDED_BRAND_SLUG } from '../../src/db/schema/values';
import { parseCatalogQuery, selectCatalog } from '../../src/features/catalog/query';
import type { StorefrontCatalog } from '../../src/server/catalog/storefront';
import { getStorefrontCatalog } from '../../src/server/catalog/storefront';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

describe('storefront catalog (database)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let catalog: StorefrontCatalog;

  before(async () => {
    fixture = await startMigratedDatabase();
    const report = await seedCatalog();
    assert.equal(report.productsInserted, 22, 'the seed publishes the whole fixture catalog');

    // The fixture opt-in must be off: this test is about the database path, so a stray value in the
    // caller's environment would make it prove nothing.
    delete process.env.QUEENBEES_STOREFRONT_FIXTURE;
    catalog = await getStorefrontCatalog();
  });

  after(async () => {
    await fixture.close();
  });

  it('serves the database as the catalog source, never the fixture', () => {
    assert.equal(catalog.source, 'database');
    assert.equal(catalog.products.length, 22);
    assert.equal(catalog.categories.length, 5);
    for (const product of catalog.products) {
      assert.equal(product.source, 'database', `${product.slug} is database-sourced`);
    }
  });

  it('returns the two curated selections as disjoint product-id lists', () => {
    assert.equal(catalog.featuredIds.length, 5);
    assert.equal(catalog.collectionIds.length, 5);
    assert.equal(new Set(catalog.featuredIds).size, 5, 'no product repeats on the featured shelf');
    assert.equal(new Set(catalog.collectionIds).size, 5, 'no product repeats in the collection');
    assert.deepEqual(
      catalog.featuredIds.filter((id) => catalog.collectionIds.includes(id)),
      [],
      'the two selections are disjoint',
    );

    // A curated id resolves to a real product: an id that names nothing would render an empty shelf.
    const ids = new Set(catalog.products.map((product) => product.id));
    for (const id of [...catalog.featuredIds, ...catalog.collectionIds]) {
      assert.ok(ids.has(id), `curated id ${id} names a published product`);
    }
  });

  it('projects to plain JSON-serializable values', () => {
    // The records cross the server/client boundary as props, so every value must survive
    // serialization unchanged. A `bigint`, a `Date` or a class instance would not.
    const serialized = JSON.stringify(catalog.products);
    const roundTripped = JSON.parse(serialized) as unknown;
    assert.deepEqual(roundTripped, catalog.products);

    assert.doesNotThrow(() => JSON.stringify(catalog.categories));
    assert.doesNotThrow(() => JSON.stringify(catalog.featuredIds));
    assert.doesNotThrow(() => JSON.stringify(catalog.collectionIds));
  });

  it('reproduces the published listing parity through the typed query layer', () => {
    const query = (params: Record<string, string | string[] | undefined>) =>
      parseCatalogQuery(params, catalog.categories);

    // Every product, no filter, default ordering.
    const all = selectCatalog(catalog.products, query({}));
    assert.equal(all.length, 22);

    // Price, ascending: the cheapest and dearest are the published ones.
    const ascending = selectCatalog(catalog.products, query({ sort: 'price-asc' }));
    assert.equal(ascending.length, 22);
    assert.equal(ascending[0]?.priceMinor, 3000, 'cheapest is 30.00 BDT');
    assert.equal(ascending[21]?.priceMinor, 115000, 'dearest is 1150.00 BDT');

    // Search resolves from the published names, brand and pack size only.
    assert.equal(selectCatalog(catalog.products, query({ q: 'niacinamide' })).length, 1);

    // Category browse, and a composed category + brand filter.
    assert.equal(selectCatalog(catalog.products, query({ category: 'haircare' })).length, 6);
    assert.equal(
      selectCatalog(catalog.products, query({ category: 'skincare', brand: 'Lilac' })).length,
      1,
    );
  });

  it('never publishes the placeholder brand or a cleared image', () => {
    // Two fixture products publish no brand. The database stores them against the documented
    // `unbranded` placeholder, and the loader must project that back to `null` - an invented brand
    // name is exactly the kind of claim the storefront is not allowed to make.
    assert.equal(
      catalog.products.some(
        (product) => product.brand === UNBRANDED_BRAND_SLUG || product.brand === 'Unbranded',
      ),
      false,
    );

    for (const product of catalog.products) {
      const primary = product.images[0];
      assert.ok(primary, `${product.slug} has at least one image`);
      // `cleared` would be a licence claim; no written reuse permission exists for this photography.
      for (const image of product.images) {
        assert.notEqual(image.rights, 'cleared', `${product.slug} image ${image.key} is not cleared`);
      }
    }
  });

  it('carries a comparison price on exactly the products that publish one', () => {
    const withComparison = catalog.products.filter(
      (product) => product.compareAtPriceMinor !== null,
    );
    assert.equal(withComparison.length, 13);
    // A comparison price is only ever shown when it is genuinely greater than the current price.
    for (const product of withComparison) {
      assert.ok(
        (product.compareAtPriceMinor ?? 0) > product.priceMinor,
        `${product.slug} comparison price exceeds the current price`,
      );
    }
  });
});
