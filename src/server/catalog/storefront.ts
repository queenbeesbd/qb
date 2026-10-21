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
 * The read is wrapped in React `cache()`, so a single request performs one snapshot read no matter how
 * many server components (layout, page, cart) ask for the catalog.
 *
 * Server-only: this module transitively imports the database client, which throws if it reaches a
 * browser bundle.
 */

import { cache } from 'react';

import { products as fixtureProducts } from '@/data/catalog';
import { categories as fixtureCategories } from '@/data/categories';
import { COLLECTION_PRODUCT_IDS, FEATURED_PRODUCT_IDS } from '@/data/curation';
import { withTransaction } from '@/db/client';
import {
  categoryIcon,
  fixtureToCatalogCategory,
  fixtureToCatalogItem,
} from '@/features/catalog/model';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { EnvironmentError } from '@/server/env';

import type { CatalogCategory as CatalogCategoryRecord, CatalogProduct } from './read';
import { listCollectionSelections, listPublishedProducts, listVisibleCategories } from './read';

/** Collection `code` values the storefront reads. Seeded, not invented per request. */
export const FEATURED_COLLECTION_CODE = 'featured';
export const SECONDARY_COLLECTION_CODE = 'collection';

export type StorefrontCatalog = {
  /** Which source produced every record in this snapshot. */
  readonly source: 'database' | 'fixture';
  readonly products: readonly CatalogItem[];
  readonly categories: readonly CatalogCategory[];
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
    categoryId: record.categoryId,
    categorySlug: record.categorySlug,
    pack: record.pack,
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
  };
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
    featuredIds: resolve(FEATURED_PRODUCT_IDS),
    collectionIds: resolve(COLLECTION_PRODUCT_IDS),
  };
}

/**
 * The catalog for the current request.
 *
 * One snapshot per request. An empty result is a real, reportable state - it is returned as an empty
 * list and the view states the gap; it is never replaced by the fixture or by placeholder rows.
 */
export const getStorefrontCatalog = cache(async (): Promise<StorefrontCatalog> => {
  if (fixtureFallbackEnabled()) return readFixtureCatalog();

  const snapshot = await withTransaction(async (tx) => {
    const [products, categories, selections] = await Promise.all([
      listPublishedProducts(tx),
      listVisibleCategories(tx),
      listCollectionSelections(tx),
    ]);
    return { products, categories, selections };
  });

  return {
    source: 'database',
    products: snapshot.products.map(toCatalogItem),
    categories: snapshot.categories.map(toCatalogCategory),
    featuredIds: snapshot.selections.get(FEATURED_COLLECTION_CODE) ?? [],
    collectionIds: snapshot.selections.get(SECONDARY_COLLECTION_CODE) ?? [],
  };
});
