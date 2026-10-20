/**
 * Deterministic catalog seed.
 *
 * Reproduces the Phase 1 verified fixture catalog (`src/data/catalog.ts`, `src/data/categories.ts`,
 * `src/data/curation.ts`) as rows in the real database, so the Phase 14 storefront cutover can read
 * the same products the fixture already renders.
 *
 * Two properties are load-bearing:
 *
 * 1. **Idempotent.** Every insert is keyed on a natural key - category/brand/product `slug`, variant
 *    `sku`, image `base_key`, collection `code`, collection item `(collection_id,
 *    product_variant_id)` - and skipped when a row already exists. Re-running inserts nothing,
 *    updates nothing and deletes nothing: it never truncates, and it never rewrites a row the owner
 *    has since edited.
 * 2. **Deterministic.** There is no `Date.now()` and no randomness; every timestamp is one fixed
 *    constant, so two fresh runs produce byte-identical rows and a test can assert them.
 *
 * It is a seed, not DDL, and it runs inside **one** transaction: a failure leaves no partial catalog.
 *
 * Deviations from the fixture, recorded rather than hidden:
 *
 * - `product.brand_id` is `NOT NULL`, but two fixture products publish no brand. They are attached to
 *   a single documented placeholder brand (`unbranded`) rather than inventing a brand per product or
 *   dropping the product. The storefront should treat that brand as "no brand published".
 * - Fixture availability is `'in_stock' | 'out_of_stock' | 'unknown'`; the database admits only the
 *   first two (D19, ADR 0010). Anything that is not exactly `'in_stock'` maps to `'out_of_stock'` -
 *   the fail-safe direction, so an unknown product can never become orderable by accident.
 * - Image `rights_status` is always `'pending_confirmation'`. The fixture photography is tagged
 *   `merchant_source_pending_confirmation`, which is a different vocabulary, and `'cleared'` is never
 *   written because no written reuse permission exists (see `docs/catalog.md`).
 *
 * `product_image_derivative` is deliberately not populated here: it exists so a future upload path can
 * record generated variants, and this phase stores none (the storefront derives its paths from the
 * key, `src/lib/images.ts`). Metadata for `product_image` is read from the file bytes via
 * `readAsset`, never from the fixture or the extension.
 */

import { sql } from 'drizzle-orm';

import { getProductById, products } from '@/data/catalog';
import { categories } from '@/data/categories';
import { COLLECTION_PRODUCT_IDS, FEATURED_PRODUCT_IDS } from '@/data/curation';
import type { Availability } from '@/lib/types';
import { listAssetKeys, readAsset } from '@/server/catalog/assets';
import { slugify } from '@/server/catalog/validation';

import { withTransaction, type Transaction } from './client';
import {
  brand,
  category,
  collection,
  collectionItem,
  product,
  productImage,
  productVariant,
} from './schema';
import { UNBRANDED_BRAND_SLUG } from './schema/values';

/** The single fixed instant shared by every seeded row that is not a product. Never `Date.now()`. */
const SEEDED_AT = new Date('2026-10-11T00:00:00Z');

/**
 * The instant the *first* fixture product is recorded as having been added.
 *
 * Every other product is offset one hour later per position in the fixture, so the seed produces 22
 * distinct, strictly increasing `product.created_at` values one day after `SEEDED_AT`.
 *
 * **What this date is, and is not.** It is the local seed's own ordering, derived from the fixture's
 * declaration order - it is *not* a capture date, a supplier date or a claimed arrival date, because
 * no such field exists in the captured data. Using a date tied to declaration order keeps the seed
 * deterministic and lets the "recently added" homepage (D6) be exercised against real, distinct
 * timestamps instead of 22 rows sharing one instant. It makes no claim about the real world, and no
 * production record is ever backdated by it: the seed refuses a non-local target.
 */
const SEEDED_PRODUCT_BASE_AT = new Date('2026-10-12T00:00:00Z');

/** One hour, in milliseconds. The spacing between consecutive seeded products. */
const SEEDED_PRODUCT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The creation instant recorded for the product at `index` in the fixture.
 *
 * Strictly increasing in declaration order, so the fixture's last entries are the newest. Distinct
 * for every index, which is what makes the recency selection testable without relying on tie-breaks.
 */
export function seededProductTimestamp(index: number): Date {
  return new Date(SEEDED_PRODUCT_BASE_AT.getTime() + index * SEEDED_PRODUCT_INTERVAL_MS);
}

/**
 * The documented placeholder brand for a catalog product that publishes no brand. Defined once in
 * `src/db/schema/values.ts` because the catalog read projection must map it back to `null`; a second
 * literal here could drift and leak an invented brand name into the storefront.
 */
const UNBRANDED_NAME = 'Unbranded';

/**
 * Rights note recorded on every seeded image. Factual and non-committal: it states the provenance and
 * that written reuse permission has not been confirmed, so `rights_status` can never be read as a
 * licence. Matches the wording `attachImage` records (`src/server/catalog/service.ts`).
 */
const IMAGE_RIGHTS_NOTE = 'Phase 1 demo photography; written reuse permission not yet confirmed';

const SKU_PREFIX = 'QB-';
/** `product_variant_sku_len` bounds the SKU at 64 characters. */
const SKU_MAX_LENGTH = 64;

/** What a run of the seed inserted. */
export type CatalogSeedReport = {
  categoriesInserted: number;
  brandsInserted: number;
  productsInserted: number;
  variantsInserted: number;
  imagesInserted: number;
  imagesSkipped: number;
  collectionsInserted: number;
  collectionItemsInserted: number;
};

/**
 * The two curated selections, with the exact bilingual titles the homepage already renders
 * (`home.featuredTitle` / `home.collectionTitle` in `src/i18n/dictionaries.ts`), so the database and
 * the storefront cannot drift on what a collection is called.
 */
const COLLECTIONS: readonly {
  code: string;
  titleBn: string;
  titleEn: string;
  ids: readonly string[];
}[] = [
  { code: 'featured', titleBn: 'নির্বাচিত পণ্য', titleEn: 'Featured products', ids: FEATURED_PRODUCT_IDS },
  { code: 'collection', titleBn: 'আরও দেখুন', titleEn: 'More to explore', ids: COLLECTION_PRODUCT_IDS },
];

/**
 * Maps a fixture availability value onto the two database states.
 *
 * Fail-safe: only an exact `'in_stock'` becomes orderable. `'unknown'`, `'out_of_stock'` and anything
 * unforeseen all become `'out_of_stock'`, so a value nobody confirmed can never be ordered.
 */
export function toDatabaseAvailability(value: Availability): 'in_stock' | 'out_of_stock' {
  return value === 'in_stock' ? 'in_stock' : 'out_of_stock';
}

/** A SKU derived from the slug, mirroring the convention `createProduct` uses. */
function skuFor(slug: string): string {
  return `${SKU_PREFIX}${slug}`.toUpperCase().slice(0, SKU_MAX_LENGTH);
}

/** Derives a brand slug, refusing input with no derivable slug rather than inventing one. */
function brandSlug(name: string): string {
  const slug = slugify(name);
  if (slug === null) throw new Error(`the fixture brand ${JSON.stringify(name)} has no derivable slug`);
  return slug;
}

/** Fails loudly if two slugs truncate to the same SKU, rather than relying on a unique violation. */
function assertUniqueSkus(): void {
  const seen = new Map<string, string>();
  for (const item of products) {
    const sku = skuFor(item.slug);
    const previous = seen.get(sku);
    if (previous !== undefined && previous !== item.slug) {
      throw new Error(`SKUs collide after truncation: ${previous} and ${item.slug} both give ${sku}`);
    }
    seen.set(sku, item.slug);
  }
}

/**
 * Fails loudly if a fixture brand name slugifies to the documented placeholder.
 *
 * The placeholder row is inserted with `UNBRANDED_BRAND_SLUG` and skipped when it already exists, so
 * a real brand whose slug matched it would be treated as the placeholder: its insert would be
 * skipped, and the catalog projection maps that slug back to `brand: null`, so the brand would
 * silently vanish from the storefront instead of appearing under its own name.
 */
function assertUnbrandedBrandSlugIsReserved(): void {
  for (const item of products) {
    if (item.brand === null) continue;
    if (brandSlug(item.brand) === UNBRANDED_BRAND_SLUG) {
      throw new Error(
        `the fixture brand ${JSON.stringify(item.brand)} slugifies to the reserved placeholder ${JSON.stringify(UNBRANDED_BRAND_SLUG)}`,
      );
    }
  }
}

export async function seedCatalog(): Promise<CatalogSeedReport> {
  assertUniqueSkus();
  assertUnbrandedBrandSlugIsReserved();
  const inventory = new Set(await listAssetKeys());
  return withTransaction((tx) => seedCatalogIn(tx, inventory));
}

async function seedCatalogIn(
  tx: Transaction,
  inventory: ReadonlySet<string>,
): Promise<CatalogSeedReport> {
  const report: CatalogSeedReport = {
    categoriesInserted: 0,
    brandsInserted: 0,
    productsInserted: 0,
    variantsInserted: 0,
    imagesInserted: 0,
    imagesSkipped: 0,
    collectionsInserted: 0,
    collectionItemsInserted: 0,
  };

  // -------------------------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------------------------
  for (const [index, entry] of categories.entries()) {
    const nameBn = entry.name.bn;
    const nameEn = entry.name.en;
    if (nameBn === null || nameEn === null) {
      throw new Error(`fixture category ${entry.slug} is missing a name`);
    }

    const existing = await tx
      .select({ id: category.id })
      .from(category)
      .where(sql`${category.slug} = ${entry.slug}`);
    if (existing.length > 0) continue;

    await tx.insert(category).values({
      slug: entry.slug,
      nameBn,
      nameEn,
      descriptionBn: entry.blurb.bn,
      descriptionEn: entry.blurb.en,
      sortOrder: index,
      isVisible: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    });
    report.categoriesInserted += 1;
  }

  const categoryIdBySlug = new Map<string, number>(
    (await tx.select({ id: category.id, slug: category.slug }).from(category)).map((row) => [
      row.slug,
      row.id,
    ]),
  );

  // -------------------------------------------------------------------------------------------
  // Brands - one per distinct fixture brand, plus the documented placeholder
  // -------------------------------------------------------------------------------------------
  const fixtureBrandNames = new Set<string>();
  for (const item of products) {
    if (item.brand !== null) fixtureBrandNames.add(item.brand);
  }

  const desiredBrands = [
    ...[...fixtureBrandNames].sort().map((name) => ({ slug: brandSlug(name), name })),
    { slug: UNBRANDED_BRAND_SLUG, name: UNBRANDED_NAME },
  ];

  for (const entry of desiredBrands) {
    const existing = await tx
      .select({ id: brand.id })
      .from(brand)
      .where(sql`${brand.slug} = ${entry.slug}`);
    if (existing.length > 0) continue;

    await tx.insert(brand).values({
      // Brand names are proper nouns and are not translated, so both locales carry the same string.
      slug: entry.slug,
      nameBn: entry.name,
      nameEn: entry.name,
      isActive: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    });
    report.brandsInserted += 1;
  }

  const brandIdBySlug = new Map<string, number>(
    (await tx.select({ id: brand.id, slug: brand.slug }).from(brand)).map((row) => [
      row.slug,
      row.id,
    ]),
  );

  // -------------------------------------------------------------------------------------------
  // Products, their single default variant, and their imagery
  // -------------------------------------------------------------------------------------------
  const variantIdBySlug = new Map<string, number>();

  for (const [productIndex, item] of products.entries()) {
    const categoryId = categoryIdBySlug.get(item.categoryId);
    if (categoryId === undefined) {
      throw new Error(`fixture product ${item.slug} names an unknown category ${item.categoryId}`);
    }
    const brandId = brandIdBySlug.get(
      item.brand === null ? UNBRANDED_BRAND_SLUG : brandSlug(item.brand),
    );
    if (brandId === undefined) {
      throw new Error(`fixture product ${item.slug} names an unknown brand`);
    }

    const nameBn = item.name.bn;
    const nameEn = item.name.en;
    if (nameBn === null || nameEn === null) {
      throw new Error(`fixture product ${item.slug} is missing a name`);
    }

    const existingProduct = await tx
      .select({ id: product.id })
      .from(product)
      .where(sql`${product.slug} = ${item.slug}`);
    let productId = existingProduct[0]?.id;

    if (productId === undefined) {
      const inserted = await tx
        .insert(product)
        .values({
          slug: item.slug,
          brandId,
          categoryId,
          nameBn,
          nameEn,
          descriptionBn: item.description.bn,
          descriptionEn: item.description.en,
          packSize: item.pack,
          availability: toDatabaseAvailability(item.availability),
          isPublished: true,
          // `product_published_needs_timestamp` requires a timestamp whenever a product is published.
          publishedAt: SEEDED_AT,
          // Distinct per product, in fixture order, so the "recently added" homepage has a real
          // ordering to publish instead of 22 rows sharing one instant. See
          // `SEEDED_PRODUCT_BASE_AT` for what this date is and is not.
          createdAt: seededProductTimestamp(productIndex),
          updatedAt: SEEDED_AT,
        })
        .returning({ id: product.id });
      productId = inserted[0]?.id;
      if (productId === undefined) throw new Error('product insert returned no id');
      report.productsInserted += 1;
    }

    // Exactly one default variant per product: the schema holds the price on the variant, and the
    // storefront contract is one price per product.
    const sku = skuFor(item.slug);
    const existingVariant = await tx
      .select({ id: productVariant.id })
      .from(productVariant)
      .where(sql`${productVariant.sku} = ${sku}`);
    let variantId = existingVariant[0]?.id;

    if (variantId === undefined) {
      const inserted = await tx
        .insert(productVariant)
        .values({
          productId,
          sku,
          isDefault: true,
          labelBn: nameBn,
          labelEn: nameEn,
          priceMinor: item.priceMinor,
          compareAtPriceMinor: item.compareAtPriceMinor,
          isActive: true,
          createdAt: SEEDED_AT,
          updatedAt: SEEDED_AT,
        })
        .returning({ id: productVariant.id });
      variantId = inserted[0]?.id;
      if (variantId === undefined) throw new Error('variant insert returned no id');
      report.variantsInserted += 1;
    }
    variantIdBySlug.set(item.slug, variantId);

    for (const [index, image] of item.images.entries()) {
      // Only assets that actually exist in the server's own inventory are attached. A key the fixture
      // declares but the directory lacks is skipped and counted, never inserted as a broken reference.
      if (!inventory.has(image.key)) {
        report.imagesSkipped += 1;
        continue;
      }

      const existingImage = await tx
        .select({ id: productImage.id })
        .from(productImage)
        .where(sql`${productImage.baseKey} = ${image.key}`);
      if (existingImage.length > 0) continue;

      // Format, content type, dimensions and byte size all come from the bytes on disk.
      const asset = await readAsset(image.key);
      if (asset === null) {
        report.imagesSkipped += 1;
        continue;
      }

      await tx.insert(productImage).values({
        productId,
        baseKey: asset.key,
        contentType: asset.contentType,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        altBn: image.alt.bn,
        altEn: image.alt.en,
        sortOrder: index,
        isPrimary: index === 0,
        // Never `'cleared'`: no written reuse permission exists for the fixture photography.
        rightsStatus: 'pending_confirmation',
        rightsNote: IMAGE_RIGHTS_NOTE,
        createdAt: SEEDED_AT,
      });
      report.imagesInserted += 1;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Curated collections
  // -------------------------------------------------------------------------------------------
  for (const definition of COLLECTIONS) {
    const existingCollection = await tx
      .select({ id: collection.id })
      .from(collection)
      .where(sql`${collection.code} = ${definition.code}`);
    let collectionId = existingCollection[0]?.id;

    if (collectionId === undefined) {
      const inserted = await tx
        .insert(collection)
        .values({
          code: definition.code,
          titleBn: definition.titleBn,
          titleEn: definition.titleEn,
          isActive: true,
          createdAt: SEEDED_AT,
        })
        .returning({ id: collection.id });
      collectionId = inserted[0]?.id;
      if (collectionId === undefined) throw new Error('collection insert returned no id');
      report.collectionsInserted += 1;
    }

    // A fixture product id resolves to its slug, then to the seeded default variant. A curated entry
    // therefore points at the same product the fixture names, never a duplicate record.
    for (const [position, fixtureId] of definition.ids.entries()) {
      const fixture = getProductById(fixtureId);
      if (fixture === undefined) {
        throw new Error(`collection ${definition.code} names unknown fixture product id ${fixtureId}`);
      }
      const variantId = variantIdBySlug.get(fixture.slug);
      if (variantId === undefined) {
        throw new Error(`collection ${definition.code} references ${fixture.slug} with no default variant`);
      }

      const existingItem = await tx
        .select({ position: collectionItem.position })
        .from(collectionItem)
        .where(
          sql`${collectionItem.collectionId} = ${collectionId}
              and ${collectionItem.productVariantId} = ${variantId}`,
        );
      if (existingItem.length > 0) continue;

      await tx.insert(collectionItem).values({
        collectionId,
        productVariantId: variantId,
        position,
        addedAt: SEEDED_AT,
      });
      report.collectionItemsInserted += 1;
    }
  }

  return report;
}
