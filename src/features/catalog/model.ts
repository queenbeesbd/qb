import { NO_PRODUCT_DELIVERY } from '@/lib/delivery';
import type {
  CatalogCategory,
  CatalogItem,
  Category,
  CategoryIcon,
  Product,
} from '@/lib/types';

/**
 * Source-agnostic catalog helpers.
 *
 * This module is deliberately client-safe: it imports no database module, no
 * server-only module and no fixture data. It holds the two translations that let
 * a single view layer serve either source without knowing which one produced a
 * record:
 *
 *   - the category slug -> icon mapping the database does not store;
 *   - the fixture -> `CatalogItem` adapter used only by the explicit
 *     local-development fixture source.
 */

/**
 * Deterministic slug -> icon mapping.
 *
 * The database has no icon column and Phase 13 added no icon-management UI, so
 * the storefront derives the glyph from the category slug. An unmapped slug gets
 * the neutral `other` glyph rather than an invented association.
 */
const CATEGORY_ICONS: Readonly<Record<string, CategoryIcon>> = {
  skincare: 'serum',
  haircare: 'hair',
  bodycare: 'body',
  lipcare: 'lip',
  accessories: 'tools',
};

const DEFAULT_CATEGORY_ICON: CategoryIcon = 'other';

export function categoryIcon(slug: string): CategoryIcon {
  return CATEGORY_ICONS[slug] ?? DEFAULT_CATEGORY_ICON;
}

/** A brand name as a route segment, matching the slug rule the database enforces. */
export function brandSlug(name: string | null): string | null {
  if (name === null) return null;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? null : slug;
}

/**
 * Translates a Phase 1 fixture record into the storefront shape.
 *
 * Only reachable through the explicit local-development fixture opt-in. The
 * result carries `source: 'fixture'` so it can never be presented as a database
 * record. Fixture-only provenance (source ids, URLs, capture dates, tags) is
 * intentionally dropped: the view layer has no use for it and retaining it would
 * invite a false claim.
 */
export function fixtureToCatalogItem(product: Product): CatalogItem {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    // The captured fixture predates the short shelf line and carries no field for it. Null is the
    // honest value: the page then omits the line rather than inventing a summary.
    shortDescription: null,
    brand: product.brand,
    // The fixture has no brand slug column: its brand is a plain name, so the link target is derived
    // with the same slug rule the seed uses, and a nameless product has no brand link at all.
    brandSlug: brandSlug(product.brand),
    // In the fixture the category id is already the slug, so both fields agree.
    categoryId: product.categoryId,
    categorySlug: product.categoryId,
    pack: product.pack,
    // The captured fixture predates per-product delivery charges and has no field for them. Nulls
    // mean "the store's own charge applies", which is true: nothing in the fixture states a fee.
    deliveryMinor: NO_PRODUCT_DELIVERY,
    priceMinor: product.priceMinor,
    compareAtPriceMinor: product.compareAtPriceMinor,
    // The captured fixture carries no rating, so the demo path makes no rating claim either.
    ratingHalves: null,
    availability: product.availability,
    images: product.images.map((image) => ({
      key: image.key,
      alt: image.alt,
      rights: image.rights,
    })),
    source: 'fixture',
    // The fixture publishes no date-added field, so none is invented here. A recency claim built on
    // a fabricated constant would be exactly the kind of invented data the honesty rules forbid.
    createdAt: null,
  };
}

export function fixtureToCatalogCategory(category: Category): CatalogCategory {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    blurb: category.blurb,
    icon: categoryIcon(category.slug),
    sortOrder: 0,
    // The fixture predates subcategories and carries no parent field, so every fixture department is
    // top level - the same shape a database root category projects.
    parentId: null,
    // The fixture has no image or tagline column: the category tile then draws its icon glyph, which
    // is the same fallback a database category with no image gets.
    imageKey: null,
    tagline: null,
  };
}
