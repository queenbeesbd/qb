/**
 * The empty catalog: a migrated database with no seeded rows.
 *
 * This is deliberately a **separate file**. `getStorefrontCatalog` is memoised with React `cache()`,
 * and `npm run test:db` runs each test file in its own process, so the empty snapshot cannot be
 * observed by a file that has already seeded the catalog - and vice versa.
 *
 * The property under test is the cutover's honesty rule: an empty result is a real, reportable state
 * carried as an empty list, **never** silently replaced by the Phase 1 fixture. A fixture served
 * from a broken database would publish captured vendor data as this store's own catalog, so the
 * `source` discriminator is asserted even when there is nothing to show.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { StorefrontCatalog } from '../../src/server/catalog/storefront';
import { getStorefrontCatalog } from '../../src/server/catalog/storefront';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

describe('storefront catalog (migrated but unseeded)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let catalog: StorefrontCatalog;

  before(async () => {
    // Migrations only - the seed is deliberately never run here.
    fixture = await startMigratedDatabase();

    // The fixture opt-in must be off, or this would prove the opposite of what it claims.
    delete process.env.QUEENBEES_STOREFRONT_FIXTURE;
    catalog = await getStorefrontCatalog();
  });

  after(async () => {
    await fixture.close();
  });

  it('reports the database source even when there is nothing to publish', () => {
    assert.equal(catalog.source, 'database');
  });

  it('returns empty lists rather than falling back to the fixture catalog', () => {
    assert.equal(catalog.products.length, 0);
    assert.equal(catalog.categories.length, 0);
    assert.equal(catalog.featuredIds.length, 0);
    assert.equal(catalog.collectionIds.length, 0);
  });
});
