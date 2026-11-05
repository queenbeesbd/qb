/**
 * The catalog seed against real PostgreSQL.
 *
 * These assertions are about rows, not about a rendered page. They exist to prove the three promises
 * the seed makes: it reproduces the verified fixture catalog field-for-field, it is idempotent (a
 * second run writes nothing), and it never records a claim the fixture does not support - availability
 * stays within the two documented states, and no image is marked as cleared.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { products } from '../../src/data/catalog';
import { categories } from '../../src/data/categories';
import { COLLECTION_PRODUCT_IDS, FEATURED_PRODUCT_IDS } from '../../src/data/curation';
import { withTransaction } from '../../src/db/client';
import {
  brand as brandTable,
  category as categoryTable,
  collection as collectionTable,
  collectionItem,
  product as productTable,
  productImage,
  productVariant,
} from '../../src/db/schema';
import { seedCatalog, toDatabaseAvailability, type CatalogSeedReport } from '../../src/db/seed-catalog';
import { UNBRANDED_BRAND_SLUG } from '../../src/db/schema/values';
import { listAssetKeys } from '../../src/server/catalog/assets';
import { listCollectionSelections, listPublishedProducts } from '../../src/server/catalog/read';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

describe('catalog seed', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let firstReport: CatalogSeedReport;
  let assetKeys: string[];

  /** Row counts for every table the seed writes. Used to prove a second run changed nothing. */
  async function tableCounts(): Promise<Record<string, number>> {
    return withTransaction(async (tx) => {
      const count = async (rows: PromiseLike<{ n: number }[]>): Promise<number> =>
        (await rows)[0]?.n ?? 0;
      return {
        categories: await count(tx.select({ n: sql<number>`count(*)::int` }).from(categoryTable)),
        brands: await count(tx.select({ n: sql<number>`count(*)::int` }).from(brandTable)),
        products: await count(tx.select({ n: sql<number>`count(*)::int` }).from(productTable)),
        variants: await count(tx.select({ n: sql<number>`count(*)::int` }).from(productVariant)),
        images: await count(tx.select({ n: sql<number>`count(*)::int` }).from(productImage)),
        collections: await count(tx.select({ n: sql<number>`count(*)::int` }).from(collectionTable)),
        collectionItems: await count(tx.select({ n: sql<number>`count(*)::int` }).from(collectionItem)),
      };
    });
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    assetKeys = await listAssetKeys();
    // The seed under test runs exactly as production would: through its public entry point.
    firstReport = await seedCatalog();
  });

  after(async () => {
    await fixture.close();
  });

  it('inserts the whole fixture catalog on a fresh database', () => {
    // Distinct fixture brands plus the documented `unbranded` placeholder (product.brand_id is NOT NULL).
    const distinctBrands = new Set(
      products.map((item) => item.brand).filter((name): name is string => name !== null),
    );

    assert.equal(firstReport.categoriesInserted, categories.length);
    assert.equal(firstReport.productsInserted, products.length);
    assert.equal(firstReport.variantsInserted, products.length, 'one default variant per product');
    assert.equal(firstReport.brandsInserted, distinctBrands.size + 1);
    assert.equal(firstReport.collectionsInserted, 2);
    assert.equal(
      firstReport.collectionItemsInserted,
      FEATURED_PRODUCT_IDS.length + COLLECTION_PRODUCT_IDS.length,
    );
    // Every fixture image key resolves to a real asset in the inventory, so nothing is skipped.
    assert.equal(firstReport.imagesSkipped, 0);
  });

  it('is idempotent: a second run inserts nothing and leaves every count unchanged', async () => {
    const before = await tableCounts();

    const second = await seedCatalog();
    assert.deepEqual(second, {
      categoriesInserted: 0,
      brandsInserted: 0,
      productsInserted: 0,
      variantsInserted: 0,
      imagesInserted: 0,
      imagesSkipped: 0,
      collectionsInserted: 0,
      collectionItemsInserted: 0,
    });

    assert.deepEqual(await tableCounts(), before, 'the second run added and removed nothing');
  });

  it('publishes every fixture product with one active default variant', async () => {
    const rows = await withTransaction((tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(productTable)
        .where(
          sql`${productTable.isPublished} and ${productTable.publishedAt} is not null and ${productTable.deletedAt} is null`,
        ),
    );
    assert.equal(rows[0]?.n, products.length);

    const defaults = await withTransaction((tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(productVariant)
        .where(sql`${productVariant.isDefault} and ${productVariant.isActive}`),
    );
    assert.equal(defaults[0]?.n, products.length);
  });

  it('matches the fixture field-for-field, keyed by slug', async () => {
    const published = await withTransaction((tx) => listPublishedProducts(tx));
    const bySlug = new Map(published.map((row) => [row.slug, row] as const));
    assert.equal(published.length, products.length);

    for (const item of products) {
      const row = bySlug.get(item.slug);
      assert.ok(row, `${item.slug} is published`);
      assert.deepEqual(row.name, item.name, `${item.slug} name`);
      assert.deepEqual(row.description, item.description, `${item.slug} description`);
      assert.equal(row.pack, item.pack, `${item.slug} pack`);
      assert.equal(row.priceMinor, item.priceMinor, `${item.slug} price`);
      assert.equal(row.compareAtPriceMinor, item.compareAtPriceMinor, `${item.slug} comparison price`);
      // The fixture category id is its slug, so the two are directly comparable.
      assert.equal(row.categorySlug, item.categoryId, `${item.slug} category`);
      // Two fixture products publish no brand. The database stores those against the documented
      // placeholder brand row, and this projection maps it back to `null` so the catalog never shows
      // a customer an invented brand name. Parity here means the projected value equals the fixture.
      assert.equal(row.brand, item.brand, `${item.slug} brand`);
    }
  });

  it('never projects the placeholder brand as a customer-visible brand', async () => {
    const published = await withTransaction((tx) => listPublishedProducts(tx));

    assert.equal(
      published.some((row) => row.brand === 'Unbranded' || row.brand === UNBRANDED_BRAND_SLUG),
      false,
    );
    // The brand list a filter is built from stays the twelve brands the catalog actually publishes.
    const brands = new Set(published.map((row) => row.brand).filter((entry): entry is string => entry !== null));
    assert.equal(brands.size, 12);
  });

  it('returns 22 published products with integer-poisha prices', async () => {
    const published = await withTransaction((tx) => listPublishedProducts(tx));
    assert.equal(published.length, 22);
    for (const row of published) {
      assert.ok(Number.isInteger(row.priceMinor), `${row.slug} price is an integer number of poisha`);
      assert.ok(row.priceMinor > 0, `${row.slug} price is positive`);
    }
  });

  it('maps fixture availability fail-safe, and seeds every product in stock', async () => {
    assert.equal(toDatabaseAvailability('in_stock'), 'in_stock');
    assert.equal(toDatabaseAvailability('out_of_stock'), 'out_of_stock');
    // The fail-safe direction: anything unconfirmed can never become orderable.
    assert.equal(toDatabaseAvailability('unknown'), 'out_of_stock');

    const rows = await withTransaction((tx) =>
      tx.select({ availability: productTable.availability }).from(productTable),
    );
    assert.equal(rows.length, products.length);
    assert.ok(rows.every((row) => row.availability === 'in_stock'));
  });

  it('stores exactly one image per fixture key that exists in the asset inventory', async () => {
    const fixtureKeys = products.flatMap((item) => item.images.map((image) => image.key));
    const present = fixtureKeys.filter((key) => assetKeys.includes(key));

    /*
     * The asset directory holds three families the seed does not write, and "no asset goes unused" is
     * asserted over the fixture half only:
     *
     * - `zq-*` photography imported from the owner's previous store, attached by the import;
     * - `category-*` and `brand-logo-*` discovery imagery, attached to a category row or a brand row.
     */
    const fixtureInventory = assetKeys.filter(
      (key) => !key.startsWith('zq-') && !key.startsWith('category-') && !key.startsWith('brand-logo-'),
    );

    // No fixture key is missing, and no fixture asset goes unused: the two sets are equal.
    assert.equal(present.length, fixtureKeys.length, 'every fixture key exists on disk');
    assert.equal(present.length, fixtureInventory.length, 'every fixture inventory asset is attached');

    const rows = await withTransaction((tx) =>
      tx.select({ n: sql<number>`count(*)::int` }).from(productImage),
    );
    assert.equal(rows[0]?.n, present.length);
  });

  it('reads image metadata from the file bytes and marks nothing cleared', async () => {
    const primaryKey = 'chaoba-hair-mask-500ml';
    const galleryKey = `${primaryKey}-2`;

    const rows = await withTransaction((tx) =>
      tx
        .select({
          baseKey: productImage.baseKey,
          contentType: productImage.contentType,
          width: productImage.width,
          height: productImage.height,
          byteSize: productImage.byteSize,
          sortOrder: productImage.sortOrder,
          isPrimary: productImage.isPrimary,
          rightsStatus: productImage.rightsStatus,
          rightsNote: productImage.rightsNote,
        })
        .from(productImage)
        .where(sql`${productImage.baseKey} in (${primaryKey}, ${galleryKey})`)
        .orderBy(productImage.sortOrder),
    );

    const primary = rows[0];
    const gallery = rows[1];
    assert.ok(primary && gallery, 'both variants were attached');
    // Content type and dimensions come from the WebP header, never from the name or the fixture.
    assert.equal(primary.contentType, 'image/webp');
    assert.equal(primary.width, 600);
    assert.equal(primary.height, 800);
    assert.ok(primary.byteSize > 0);
    assert.equal(primary.isPrimary, true);
    assert.equal(primary.sortOrder, 0);
    assert.equal(gallery.isPrimary, false, 'only the first image is primary');
    assert.equal(gallery.sortOrder, 1);

    for (const row of rows) {
      // Never `cleared`: no written reuse permission exists for the fixture photography.
      assert.equal(row.rightsStatus, 'pending_confirmation');
      assert.ok(row.rightsNote !== null, 'a rights status carries its recorded basis');
    }

    const cleared = await withTransaction((tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(productImage)
        .where(sql`${productImage.rightsStatus} = 'cleared'`),
    );
    assert.equal(cleared[0]?.n, 0);
  });

  it('resolves the featured and collection selections to disjoint fixture products', async () => {
    const published = await withTransaction((tx) => listPublishedProducts(tx));
    const dbIdBySlug = new Map(published.map((row) => [row.slug, row.id] as const));
    const fixtureById = new Map(products.map((item) => [item.id, item] as const));

    const expected = (fixtureIds: readonly string[]): string[] =>
      fixtureIds.map((fixtureId) => {
        const item = fixtureById.get(fixtureId);
        assert.ok(item, `fixture product ${fixtureId} exists`);
        const dbId = dbIdBySlug.get(item.slug);
        assert.ok(dbId, `seeded product ${item.slug} exists`);
        return dbId;
      });

    const selections = await withTransaction((tx) => listCollectionSelections(tx));
    const featured = selections.get('featured') ?? [];
    const collection = selections.get('collection') ?? [];

    assert.deepEqual(featured, expected(FEATURED_PRODUCT_IDS), 'featured shelf, in order');
    assert.deepEqual(collection, expected(COLLECTION_PRODUCT_IDS), 'collection, in order');
    assert.equal(featured.length, 5);
    assert.equal(collection.length, COLLECTION_PRODUCT_IDS.length);
    assert.equal(collection.length, 5, 'the collection leads the browse row');
    assert.equal(new Set(featured).size, 5, 'no product repeats on the featured row');
    assert.equal(
      new Set(collection).size,
      COLLECTION_PRODUCT_IDS.length,
      'no product repeats in the collection',
    );
    assert.deepEqual(
      featured.filter((id) => collection.includes(id)),
      [],
      'the two selections are disjoint',
    );
  });

  it('gives every published product a readable primary image', async () => {
    const published = await withTransaction((tx) => listPublishedProducts(tx));
    for (const row of published) {
      const primary = row.images[0];
      assert.ok(primary, `${row.slug} has at least one image`);
      assert.ok(
        assetKeys.includes(primary.key),
        `${row.slug} primary image ${primary.key} is a real asset in the inventory`,
      );
    }
  });
});
