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

import { desc, sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { IMAGE_RIGHTS_STATUS, UNBRANDED_BRAND_SLUG } from '@/db/schema/values';
import type { ImageRightsStatus } from '@/lib/types';
import {
  brand,
  category,
  collection,
  collectionItem,
  product,
  productImage,
  productVariant,
} from '@/db/schema';

/** A product as the storefront would consume it, projected from the database. */
export type CatalogProduct = {
  readonly id: string;
  readonly slug: string;
  readonly name: { bn: string | null; en: string };
  readonly description: { bn: string | null; en: string | null };
  /**
   * The owner's short shelf line, shown under the price. Null means the owner has not written one,
   * and the product page then renders the price alone rather than an empty paragraph.
   */
  readonly shortDescription: string | null;
  readonly brand: string | null;
  readonly brandSlug: string | null;
  readonly categoryId: string;
  readonly categorySlug: string;
  readonly pack: string | null;
  readonly priceMinor: number;
  readonly compareAtPriceMinor: number | null;
  /** The owner's In Stock / Out of Stock state (D19). Never a quantity. */
  readonly availability: 'in_stock' | 'out_of_stock';
  readonly images: readonly {
    key: string;
    alt: { bn: string | null; en: string | null };
    /** Database rights status; never treated as cleared unless the row says so. */
    rights: ImageRightsStatus;
  }[];
  /**
   * When the product row was created, in UTC.
   *
   * This is the `product.created_at` column - a real database timestamp that already existed for
   * auditing (`defaultNow()`), now also exposed because the homepage publishes a "recently added"
   * selection (D6, Phase 26). It is **not** `published_at`: publishing is a separate, repeatable
   * action, so a product staged months earlier and published today would jump to the front of a
   * "newest" list it does not belong in. Creation is the moment the owner added the product.
   */
  readonly createdAt: Date;
  /** Always `false` here: this record comes from the database, not from the captured fixture. */
  readonly isDemo: false;
  /** Where the record came from, so a consumer cannot mistake one source for the other. */
  readonly provenance: 'database';
};

export type CatalogCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: { bn: string | null; en: string };
  readonly blurb: { bn: string | null; en: string | null };
  readonly sortOrder: number;
  /** The owner's square photograph for this category, as an asset key. Null means none chosen. */
  readonly imageKey: string | null;
  /** One short English line for the category tile. Null omits the line. */
  readonly tagline: string | null;
};

/**
 * A storefront brand with the facts a logo tile needs.
 *
 * `productCount` is a correlated `count(*)` over the same predicates `listPublishedProducts` uses,
 * so a brand tile can never advertise a number its listing does not show.
 */
export type CatalogBrand = {
  readonly id: string;
  readonly slug: string;
  readonly name: { bn: string | null; en: string };
  readonly logoKey: string | null;
  readonly productCount: number;
};

/**
 * Published, non-deleted products with an active default variant, newest first.
 *
 * A product with no default variant is omitted rather than returned with a null price: there is no
 * authoritative amount to show, and inventing one is what the money rules forbid.
 *
 * **Ordering (D6, Phase 26).** `created_at desc` with `id desc` as the tie-breaker. The secondary key
 * is not decoration: two products created in the same transaction, or seeded together, can share a
 * microsecond, and without a total order the "three newest" would depend on whatever order the planner
 * happened to return and could change between identical requests. `id` is the identity sequence, so
 * it is unique and correlates with insert order.
 *
 * The catalog listing keeps its own name ordering by re-sorting; this order is the load-bearing one
 * for recency, so it must not be re-derived in a view.
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
      shortDescription: product.shortDescription,
      packSize: product.packSize,
      availability: product.availability,
      categoryId: category.id,
      categorySlug: category.slug,
      brandNameEn: brand.nameEn,
      brandSlug: brand.slug,
      priceMinor: productVariant.priceMinor,
      compareAtPriceMinor: productVariant.compareAtPriceMinor,
      createdAt: product.createdAt,
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
    .orderBy(desc(product.createdAt), desc(product.id));

  // One image query for the whole result, not one per product. The per-product form turned a catalog
  // read into 1,476 sequential round trips, which is 80+ seconds against a remote database and longer
  // than the page's own timeout.
  const imagesByProduct = await listImagesForProducts(
    tx,
    rows.map((row) => row.id),
  );
  return rows.map((row) => projectProduct(row, imagesByProduct.get(String(row.id)) ?? []));
}

/**
 * Unit prices for a handful of product ids, keyed by id.
 *
 * This exists for the floating cart box: the browser knows its quantities, the server knows the prices,
 * and the box needs the second half without downloading the catalog. **Prices only** - the basket's
 * quantities, totals and any decision about what a customer is charged stay where they were. The order
 * transaction reads the price again from `product_variant`; nothing here is authoritative for a charge.
 *
 * Ids are matched as text because a catalog id arrives as a string, and an id that is not in the
 * catalog is simply absent from the map - the caller shows fewer priced lines rather than guessing.
 */
export async function listUnitPricesByIds(
  tx: Transaction,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const rows = await tx
    .select({ id: product.id, priceMinor: productVariant.priceMinor })
    .from(product)
    .innerJoin(
      productVariant,
      sql`${productVariant.productId} = ${product.id}
          and ${productVariant.isDefault} and ${productVariant.isActive}`,
    )
    .where(
      sql`${product.deletedAt} is null and ${product.isPublished}
          and ${product.id}::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    );

  return new Map(rows.map((row) => [String(row.id), row.priceMinor]));
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
      shortDescription: product.shortDescription,
      packSize: product.packSize,
      availability: product.availability,
      categoryId: category.id,
      categorySlug: category.slug,
      brandNameEn: brand.nameEn,
      brandSlug: brand.slug,
      priceMinor: productVariant.priceMinor,
      compareAtPriceMinor: productVariant.compareAtPriceMinor,
      createdAt: product.createdAt,
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
  const imagesByProduct = await listImagesForProducts(tx, [row.id]);
  return projectProduct(row, imagesByProduct.get(String(row.id)) ?? []);
}

/**
 * Every live image for the given products, grouped by product id.
 *
 * The order inside a group is the owner's: the primary image first, then `sort_order`. It is decided
 * in SQL rather than in JavaScript so the grouping cannot reorder what the owner arranged.
 */
async function listImagesForProducts(
  tx: Transaction,
  productIds: readonly number[],
): Promise<Map<string, CatalogImageRow[]>> {
  const grouped = new Map<string, CatalogImageRow[]>();
  if (productIds.length === 0) return grouped;

  const rows = await tx
    .select({
      productId: productImage.productId,
      key: productImage.baseKey,
      altBn: productImage.altBn,
      altEn: productImage.altEn,
      rightsStatus: productImage.rightsStatus,
    })
    .from(productImage)
    .where(sql`${productImage.productId} in ${productIds} and ${productImage.deletedAt} is null`)
    .orderBy(sql`${productImage.productId}, ${productImage.isPrimary} desc, ${productImage.sortOrder}`);

  for (const row of rows) {
    const id = String(row.productId);
    const list = grouped.get(id);
    const image = { key: row.key, altBn: row.altBn, altEn: row.altEn, rightsStatus: row.rightsStatus };
    if (list === undefined) grouped.set(id, [image]);
    else list.push(image);
  }
  return grouped;
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
      imageKey: category.imageKey,
      tagline: category.tagline,
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
    imageKey: row.imageKey,
    tagline: row.tagline,
  }));
}

/**
 * Visible brands with at least one published product, busiest first.
 *
 * A brand with nothing to sell is not a discovery surface: the tile would link to an empty listing.
 * The count uses the same predicates as `listPublishedProducts` - non-deleted, published, with an
 * active default variant - so the number on a brand tile is exactly what its listing shows. The
 * documented placeholder brand (`unbranded`) is excluded because it is storage, not a brand.
 */
export async function listVisibleBrands(tx: Transaction): Promise<CatalogBrand[]> {
  const rows = await tx
    .select({
      id: brand.id,
      slug: brand.slug,
      nameBn: brand.nameBn,
      nameEn: brand.nameEn,
      logoKey: brand.logoKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."brand_id" = "brand"."id"
          and "product"."deleted_at" is null
          and "product"."is_published"
          and exists (
            select 1 from "product_variant"
            where "product_variant"."product_id" = "product"."id"
              and "product_variant"."is_default" and "product_variant"."is_active"
          )
      )`,
    })
    .from(brand)
    .where(
      sql`${brand.deletedAt} is null and ${brand.isActive} and ${brand.slug} <> ${UNBRANDED_BRAND_SLUG}`,
    );

  return rows
    .filter((row) => row.productCount > 0)
    .map((row) => ({
      id: String(row.id),
      slug: row.slug,
      name: { bn: row.nameBn, en: row.nameEn },
      logoKey: row.logoKey,
      productCount: row.productCount,
    }))
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        (a.name.en ?? '').localeCompare(b.name.en ?? '', 'en') ||
        a.slug.localeCompare(b.slug),
    );
}

/**
 * Active curation selections, keyed by collection `code`, each an ordered list of
 * product ids as strings.
 *
 * Curation stays an id list rather than a flag on the product record - the Phase 1
 * invariant - it simply lives in the database now (`collection` +
 * `collection_item`, addressed by the item's default variant).
 *
 * A curated entry is filtered by the same predicates as `listPublishedProducts`, so
 * "curated" means exactly "publishable": an unpublished or deleted product, or an
 * inactive default variant, is not served as a selection id. The selection list never
 * names a product the public catalog does not publish, even before a consumer drops a
 * dangling id.
 */
export async function listCollectionSelections(
  tx: Transaction,
): Promise<Map<string, string[]>> {
  const rows = await tx
    .select({
      code: collection.code,
      productId: productVariant.productId,
    })
    .from(collection)
    .innerJoin(collectionItem, sql`${collectionItem.collectionId} = ${collection.id}`)
    .innerJoin(
      productVariant,
      sql`${productVariant.id} = ${collectionItem.productVariantId}
          and ${productVariant.isDefault} and ${productVariant.isActive}`,
    )
    .innerJoin(product, sql`${product.id} = ${productVariant.productId}`)
    .where(sql`${collection.isActive} and ${product.deletedAt} is null and ${product.isPublished}`)
    .orderBy(collection.code, collectionItem.position);

  const selections = new Map<string, string[]>();
  for (const row of rows) {
    const list = selections.get(row.code);
    if (list === undefined) selections.set(row.code, [String(row.productId)]);
    else list.push(String(row.productId));
  }
  return selections;
}

/**
 * The whole public catalog in one snapshot: products, categories and curation.
 *
 * This is the function the storefront cutover reads through. It remains **server-side only**: Phase
 * 14 deliberately adds **no public catalog endpoint**, because a view component is not a consumer
 * that needs one, and an unauthenticated catalog surface nobody calls is a new attack surface added
 * without a requirement. The storefront reads this in a server component and passes serializable
 * props to the client views.
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

/**
 * Narrows a stored rights value to the known set.
 *
 * The column carries a CHECK constraint, so an out-of-set value should not exist - but a projection
 * that trusts it would be one migration away from publishing an image as `cleared`. An unrecognised
 * value degrades to `unknown`, never upward.
 */
function toRightsStatus(raw: string): ImageRightsStatus {
  return (IMAGE_RIGHTS_STATUS as readonly string[]).includes(raw)
    ? (raw as ImageRightsStatus)
    : 'unknown';
}

/** One image row as stored, before projection. */
type CatalogImageRow = {
  readonly key: string;
  readonly altBn: string | null;
  readonly altEn: string | null;
  readonly rightsStatus: string;
};

/** Projects one product row into the customer-facing shape. Images are supplied, never fetched here. */
function projectProduct(
  row: {
    id: number;
    slug: string;
    nameBn: string | null;
    nameEn: string;
    descriptionBn: string | null;
    descriptionEn: string | null;
    shortDescription: string | null;
    packSize: string | null;
    availability: string;
    categoryId: number;
    categorySlug: string;
    brandNameEn: string;
    brandSlug: string;
    priceMinor: number;
    compareAtPriceMinor: number | null;
    createdAt: Date;
  },
  imageRows: readonly CatalogImageRow[],
): CatalogProduct {
  return {
    id: String(row.id),
    slug: row.slug,
    name: { bn: row.nameBn, en: row.nameEn },
    description: { bn: row.descriptionBn, en: row.descriptionEn },
    shortDescription: row.shortDescription,
    // A product with no published brand is stored against the documented placeholder row; the
    // storefront must not turn that storage detail into an invented brand name for a customer.
    brand: row.brandSlug === UNBRANDED_BRAND_SLUG ? null : row.brandNameEn,
    // The placeholder row is storage, not a brand a customer can browse, so it has no slug either.
    brandSlug: row.brandSlug === UNBRANDED_BRAND_SLUG ? null : row.brandSlug,
    categoryId: String(row.categoryId),
    categorySlug: row.categorySlug,
    pack: row.packSize,
    priceMinor: row.priceMinor,
    compareAtPriceMinor: row.compareAtPriceMinor,
    // The schema's CHECK constraint is the guarantee; this narrows the string the driver returns.
    availability: row.availability === 'in_stock' ? 'in_stock' : 'out_of_stock',
    createdAt: row.createdAt,
    images: imageRows.map((image) => ({
      key: image.key,
      alt: { bn: image.altBn, en: image.altEn },
      rights: toRightsStatus(image.rightsStatus),
    })),
    isDemo: false,
    provenance: 'database',
  };
}
