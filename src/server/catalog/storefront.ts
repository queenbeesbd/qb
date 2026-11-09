/**
 * The storefront's catalog loader: the one place the storefront obtains products, categories and
 * curation, and the seam that decides which source produced them.
 *
 * Two rules shape this module:
 *
 * 1. **The database is the source of truth.** The loader reads through the typed accessor surface in
 *    `./read` (which is built on the Phase 13 schema) and projects it into the source-agnostic
 *    `CatalogItem` / `CatalogCategory` view types, marking `source: 'database'`.
 * 2. **The fixture is a separate, explicit source, never a fallback.** The Phase 1 fixture is reachable
 *    only when `QUEENBEE'S_FIXTURE` opt-in below is deliberately set in a development environment. It is
 *    never used because a database read failed: a failure propagates to the route's error boundary, so
 *    a broken database cannot silently become a stale fixture catalog. It is refused outright outside
 *    development.
 *
 * The read is cached across requests by `unstable_cache` and deduplicated within a request by React
 * `cache()`. The snapshot is the largest catalog query in the application, and every storefront page
 * needs it, so re-reading it per view was the dominant source of database egress. Catalog writes
 * invalidate its tag; the TTL is only a backstop.
 *
 * Server-only: this module transitively imports the database client, which throws if it reaches a
 * browser bundle.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import { products as fixtureProducts } from '@/data/catalog';
import { categories as fixtureCategories } from '@/data/categories';
import { COLLECTION_PRODUCT_IDS, FEATURED_PRODUCT_IDS } from '@/data/curation';
import { withTransaction } from '@/db/client';
import {
  categoryIcon,
  fixtureToCatalogCategory,
  fixtureToCatalogItem,
} from '@/features/catalog/model';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { STOREFRONT_CATALOG_REVALIDATE_SECONDS, STOREFRONT_CATALOG_TAG } from './cache';
import { EnvironmentError } from '@/server/env';

import type {
  CatalogBrand as CatalogBrandRecord,
  CatalogCategory as CatalogCategoryRecord,
  CatalogProduct,
} from './read';
import {
  listCollectionSelections,
  listPublishedProducts,
  listVisibleBrands,
  listVisibleCategories,
} from './read';

/** Collection `code` values the storefront reads. Seeded, not invented per request. */
export const FEATURED_COLLECTION_CODE = 'featured';
export const SECONDARY_COLLECTION_CODE = 'collection';

export type StorefrontCatalog = {
  /** Which source produced every record in this snapshot. */
  readonly source: 'database' | 'fixture';
  readonly products: readonly CatalogItem[];
  readonly categories: readonly CatalogCategory[];
  /**
   * Brands with something to sell, busiest first. Derived from the same snapshot as the products, so a
   * brand tile's count and the listing it links into can never disagree.
   */
  readonly brands: readonly CatalogBrand[];
  /** Product ids of the featured selection, in position order. */
  readonly featuredIds: readonly string[];
  /** Product ids of the secondary curated selection, in position order. */
  readonly collectionIds: readonly string[];
};

/**
 * Explicit, development-only opt-in for the fixture catalog.
 *
 * Read straight from the process environment rather than through `serverEnv()` on purpose: the
 * fixture source must be usable when no database is configured at all, and `serverEnv()` requires a
 * `DATABASE_URL`. Enabling the flag outside development is a refusal, not a warning - a fixture
 * catalog in production would publish captured vendor data as this store's own.
 */
function fixtureFallbackEnabled(): boolean {
  const flag = process.env.QUEENBEES_STOREFRONT_FIXTURE;
  if (flag !== '1') return false;

  const environment = process.env.QUEENBEES_ENV ?? process.env.NODE_ENV ?? 'development';
  if (environment !== 'development') {
    throw new EnvironmentError(
      'QUEENBEES_STOREFRONT_FIXTURE may only be enabled in a development environment. The fixture ' +
        'catalog is captured vendor data and must never be served from test, preview or production.',
    );
  }
  return true;
}

function toCatalogItem(record: CatalogProduct): CatalogItem {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    description: record.description,
    shortDescription: record.shortDescription,
    brand: record.brand,
    brandSlug: record.brandSlug,
    categoryId: record.categoryId,
    categorySlug: record.categorySlug,
    pack: record.pack,
    deliveryMinor: record.deliveryMinor,
    priceMinor: record.priceMinor,
    compareAtPriceMinor: record.compareAtPriceMinor,
    availability: record.availability,
    images: record.images.map((image) => ({
      key: image.key,
      alt: image.alt,
      rights: image.rights,
    })),
    source: 'database',
    // A database row always carries a real creation instant; the column is NOT NULL.
    createdAt: record.createdAt.toISOString(),
  };
}

function toCatalogCategory(record: CatalogCategoryRecord): CatalogCategory {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    blurb: record.blurb,
    icon: categoryIcon(record.slug),
    sortOrder: record.sortOrder,
    parentId: record.parentId,
    imageKey: record.imageKey,
    tagline: record.tagline,
  };
}

function toCatalogBrand(record: CatalogBrandRecord): CatalogBrand {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    logoKey: record.logoKey,
    productCount: record.productCount,
  };
}

/**
 * Brands for the fixture path: one per distinct brand name in the fixture, counted from those products
 * and ordered busiest first. No logo is invented - the fixture carries no such field, and the tile's
 * initials fallback is the honest answer.
 */
function fixtureBrands(products: readonly CatalogItem[]): CatalogBrand[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (product.brand === null) continue;
    counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, productCount]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name: { bn: null, en: name },
      logoKey: null,
      productCount,
    }))
    .sort((a, b) => b.productCount - a.productCount || a.slug.localeCompare(b.slug));
}

function readFixtureCatalog(): StorefrontCatalog {
  /**
   * The fixture records carry **no capture dates** - they were transcribed from a public storefront
   * that publishes no date-added field - so `createdAt` stays `null` here rather than being filled
   * with a plausible-looking constant. A fixture-backed homepage therefore shows its honest
   * "recently added" gap instead of presenting a made-up arrival order.
   */
  const products = fixtureProducts.map(fixtureToCatalogItem);
  const ids = new Set(products.map((product) => product.id));
  const resolve = (selection: readonly string[]): string[] =>
    selection.filter((id) => ids.has(id));

  return {
    source: 'fixture',
    products,
    categories: fixtureCategories.map(fixtureToCatalogCategory),
    /*
     * A fixture brand carries no logo and no count of its own; both are derived here the same way the
     * database projection derives them - from the products in this snapshot - so the fixture path
     * renders the identical brand rail without inventing a single extra fact.
     */
    brands: fixtureBrands(products),
    featuredIds: resolve(FEATURED_PRODUCT_IDS),
    collectionIds: resolve(COLLECTION_PRODUCT_IDS),
  };
}

/**
 * Reads and projects one catalog snapshot.
 *
 * An empty result is a real, reportable state - it is returned as an empty list and the view states
 * the gap; it is never replaced by the fixture or by placeholder rows.
 */
async function readStorefrontCatalog(): Promise<StorefrontCatalog> {
  if (fixtureFallbackEnabled()) return readFixtureCatalog();

  const snapshot = await withTransaction(async (tx) => {
    const [products, categories, brands, selections] = await Promise.all([
      listPublishedProducts(tx),
      listVisibleCategories(tx),
      listVisibleBrands(tx),
      listCollectionSelections(tx),
    ]);
    return { products, categories, brands, selections };
  });

  return {
    source: 'database',
    products: snapshot.products.map(toCatalogItem),
    categories: snapshot.categories.map(toCatalogCategory),
    brands: snapshot.brands.map(toCatalogBrand),
    featuredIds: snapshot.selections.get(FEATURED_COLLECTION_CODE) ?? [],
    collectionIds: snapshot.selections.get(SECONDARY_COLLECTION_CODE) ?? [],
  };
}

/**
 * The same snapshot, reused across requests in a production server.
 *
 * The read is roughly 1.5 MB of rows and every storefront page needs it, so re-reading it per view
 * was the largest source of database transfer. Route handlers that write catalog rows invalidate
 * `STOREFRONT_CATALOG_TAG` after their transaction commits, so an owner's change is visible on the
 * next request rather than after the five-minute backstop. Development and the test runner read
 * directly: `unstable_cache` needs Next's incremental cache, which only exists inside a running
 * Next server, and a dev edit should never wait for a tag.
 */
const readStorefrontCatalogCached = unstable_cache(
  readStorefrontCatalog,
  ['storefront-catalog'],
  { tags: [STOREFRONT_CATALOG_TAG], revalidate: STOREFRONT_CATALOG_REVALIDATE_SECONDS },
);

/**
 * The catalog for the current request.
 *
 * `cache()` deduplicates the call within one render; the production branch also shares one snapshot
 * across requests.
 */
export const getStorefrontCatalog = cache(async (): Promise<StorefrontCatalog> =>
  process.env.NODE_ENV === 'production'
    ? readStorefrontCatalogCached()
    : readStorefrontCatalog(),
);
