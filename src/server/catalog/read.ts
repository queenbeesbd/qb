/**
 * The database-backed catalog read layer.
 *
 * This is the seam the roadmap's read API and the Phase 14 storefront cutover are built on. It is
 * **async**, because a database read is async, and it deliberately does **not** replace or modify
 * `src/data/catalog.ts`: the storefront keeps rendering the local verified fixture catalog in this
 * phase, and the fixture's synchronous accessors are unchanged.
 *
 * Two rules shape the projections below:
 *
 * 1. **Only public facts are exposed.** A published product exposes its availability state, its price
 *    from the default variant, its names, its category and its image keys. Nothing from `inventory_*`
 *    is reachable here: `on_hand`, `reserved` and the movement ledger are not part of a storefront
 *    projection, and `docs/data-model.md` 5.2 requires that only a derived availability state is
 *    exposed publicly.
 * 2. **`isDemo` is a fixture marker, not a database fact.** The Phase 1 fixture type declares
 *    `isDemo: true` as a literal because every fixture record is a captured snapshot. A database row is
 *    not, so this layer projects `isDemo: false` and a separate `provenance` field. The two are never
 *    blended: a fixture record is never presented as a database record, and vice versa.
 *
 * Money is integer poisha, straight from `product_variant.price_minor`. No arithmetic happens here, so
 * there is nothing to round.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { brand, category, product, productImage, productVariant } from '@/db/schema';

/** A product as the storefront would consume it, projected from the database. */
export type CatalogProduct = {
  readonly id: string;
  readonly slug: string;
  readonly name: { bn: string; en: string };
  readonly description: { bn: string | null; en: string | null };
  readonly brand: string | null;
  readonly categoryId: string;
  readonly categorySlug: string;
  readonly pack: string | null;
  readonly priceMinor: number;
  readonly compareAtPriceMinor: number | null;
  /** The owner's In Stock / Out of Stock state (D19). Never a quantity. */
  readonly availability: 'in_stock' | 'out_of_stock';
  readonly images: readonly { key: string; alt: { bn: string | null; en: string | null } }[];
  /** Always `false` here: this record comes from the database, not from the captured fixture. */
  readonly isDemo: false;
  /** Where the record came from, so a consumer cannot mistake one source for the other. */
  readonly provenance: 'database';
};

export type CatalogCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: { bn: string; en: string };
  readonly blurb: { bn: string | null; en: string | null };
  readonly sortOrder: number;
};

/**
 * Published, non-deleted products with an active default variant.
 *
 * A product with no default variant is omitted rather than returned with a null price: there is no
 * authoritative amount to show, and inventing one is what the money rules forbid.
 */
export async function listPublishedProducts(tx: Transaction): Promise<CatalogProduct[]> {
  const rows = await tx
    .select({
      id: product.id,
      slug: product.slug,
      nameBn: product.nameBn,
      nameEn: product.nameEn,
      descriptionBn: product.descriptionBn,
      descriptionEn: product.descriptionEn,
      packSize: product.packSize,
      availability: product.availability,
      categoryId: category.id,
      categorySlug: category.slug,
      brandNameEn: brand.nameEn,
      priceMinor: productVariant.priceMinor,
      compareAtPriceMinor: productVariant.compareAtPriceMinor,
    })
    .from(product)
    .innerJoin(category, sql`${category.id} = ${product.categoryId}`)
    .innerJoin(brand, sql`${brand.id} = ${product.brandId}`)
    .innerJoin(
      productVariant,
      sql`${productVariant.productId} = ${product.id}
          and ${productVariant.isDefault} and ${productVariant.isActive}`,
    )
    .where(sql`${product.deletedAt} is null and ${product.isPublished}`)
    .orderBy(product.nameEn);

  return Promise.all(rows.map((row) => projectProduct(tx, row)));
}

/** One published product by slug, or `null`. Used by a future product route adapter. */
export async function getPublishedProductBySlug(
  tx: Transaction,
  slug: string,
): Promise<CatalogProduct | null> {
  const rows = await tx
    .select({
      id: product.id,
      slug: product.slug,
      nameBn: product.nameBn,
      nameEn: product.nameEn,
      descriptionBn: product.descriptionBn,
      descriptionEn: product.descriptionEn,
      packSize: product.packSize,
      availability: product.availability,
      categoryId: category.id,
      categorySlug: category.slug,
      brandNameEn: brand.nameEn,
      priceMinor: productVariant.priceMinor,
      compareAtPriceMinor: productVariant.compareAtPriceMinor,
    })
    .from(product)
    .innerJoin(category, sql`${category.id} = ${product.categoryId}`)
    .innerJoin(brand, sql`${brand.id} = ${product.brandId}`)
    .innerJoin(
      productVariant,
      sql`${productVariant.productId} = ${product.id}
          and ${productVariant.isDefault} and ${productVariant.isActive}`,
    )
    .where(sql`${product.deletedAt} is null and ${product.isPublished} and ${product.slug} = ${slug}`);

  const row = rows[0];
  if (row === undefined) return null;
  return projectProduct(tx, row);
}

/** Visible, non-deleted categories in display order. */
export async function listVisibleCategories(tx: Transaction): Promise<CatalogCategory[]> {
  const rows = await tx
    .select({
      id: category.id,
      slug: category.slug,
      nameBn: category.nameBn,
      nameEn: category.nameEn,
      descriptionBn: category.descriptionBn,
      descriptionEn: category.descriptionEn,
      sortOrder: category.sortOrder,
    })
    .from(category)
    .where(sql`${category.deletedAt} is null and ${category.isVisible}`)
    .orderBy(category.sortOrder, category.nameEn);

  return rows.map((row) => ({
    id: String(row.id),
    slug: row.slug,
    name: { bn: row.nameBn, en: row.nameEn },
    blurb: { bn: row.descriptionBn, en: row.descriptionEn },
    sortOrder: row.sortOrder,
  }));
}

/**
 * The whole public catalog in one snapshot.
 *
 * This is the function the roadmap's storefront read API is built on. It is **not exposed publicly in
 * this phase**: Phase 13 adds no unauthenticated endpoint, because a public catalog endpoint with no
 * consumer would be a new surface added without a requirement. Exposing it is part of the Phase 14
 * cutover, together with the revalidation policy that decides how stale it may be.
 */
export async function readCatalogSnapshot(
  tx: Transaction,
): Promise<{ products: CatalogProduct[]; categories: CatalogCategory[] }> {
  const [products, categories] = await Promise.all([
    listPublishedProducts(tx),
    listVisibleCategories(tx),
  ]);
  return { products, categories };
}

/** Row counts for the overview. Derived from rows that exist, never estimated. */
export async function countCatalog(tx: Transaction): Promise<{
  products: number;
  productsPublished: number;
  productsInStock: number;
  productsOutOfStock: number;
  categories: number;
  brands: number;
  images: number;
}> {
  const rows = await tx
    .select({
      products: sql<number>`count(*)::int`,
      productsPublished: sql<number>`count(*) filter (where ${product.isPublished})::int`,
      productsInStock: sql<number>`count(*) filter (where ${product.availability} = 'in_stock')::int`,
      productsOutOfStock: sql<number>`count(*) filter (where ${product.availability} = 'out_of_stock')::int`,
    })
    .from(product)
    .where(sql`${product.deletedAt} is null`);

  const categories = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(category)
    .where(sql`${category.deletedAt} is null`);
  const brands = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(brand)
    .where(sql`${brand.deletedAt} is null`);
  const images = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(productImage)
    .where(sql`${productImage.deletedAt} is null`);

  return {
    products: rows[0]?.products ?? 0,
    productsPublished: rows[0]?.productsPublished ?? 0,
    productsInStock: rows[0]?.productsInStock ?? 0,
    productsOutOfStock: rows[0]?.productsOutOfStock ?? 0,
    categories: categories[0]?.total ?? 0,
    brands: brands[0]?.total ?? 0,
    images: images[0]?.total ?? 0,
  };
}

async function projectProduct(
  tx: Transaction,
  row: {
    id: number;
    slug: string;
    nameBn: string;
    nameEn: string;
    descriptionBn: string | null;
    descriptionEn: string | null;
    packSize: string | null;
    availability: string;
    categoryId: number;
    categorySlug: string;
    brandNameEn: string;
    priceMinor: number;
    compareAtPriceMinor: number | null;
  },
): Promise<CatalogProduct> {
  const images = await tx
    .select({
      key: productImage.baseKey,
      altBn: productImage.altBn,
      altEn: productImage.altEn,
    })
    .from(productImage)
    .where(sql`${productImage.productId} = ${row.id} and ${productImage.deletedAt} is null`)
    .orderBy(sql`${productImage.isPrimary} desc, ${productImage.sortOrder}`);

  return {
    id: String(row.id),
    slug: row.slug,
    name: { bn: row.nameBn, en: row.nameEn },
    description: { bn: row.descriptionBn, en: row.descriptionEn },
    brand: row.brandNameEn,
    categoryId: String(row.categoryId),
    categorySlug: row.categorySlug,
    pack: row.packSize,
    priceMinor: row.priceMinor,
    compareAtPriceMinor: row.compareAtPriceMinor,
    // The schema's CHECK constraint is the guarantee; this narrows the string the driver returns.
    availability: row.availability === 'in_stock' ? 'in_stock' : 'out_of_stock',
    images: images.map((image) => ({
      key: image.key,
      alt: { bn: image.altBn, en: image.altEn },
    })),
    isDemo: false,
    provenance: 'database',
  };
}
