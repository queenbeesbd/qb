/**
 * The owner's own picks for the storefront (owner direction, 2026-11-12).
 *
 * Three rows on the homepage can be curated: the departments in "Shop By Category", the brands in
 * "Shop By Brand" and the products in "On Offer". Each is an **ordered list of ids**, stored in
 * `storefront_pick` and read back through the storefront snapshot, so a pick that has since been
 * archived or deleted simply disappears rather than leaving a hole in the rail.
 *
 * Three rules keep the picks honest:
 *
 * 1. **Empty means automatic.** A section with no rows keeps the selection the shop has always had -
 *    the busiest departments, the brands with the most products, the largest genuine savings. The
 *    editor says so, and the storefront never has to invent a rail because the owner has not opened
 *    the screen yet.
 * 2. **A pick must be something the shop can show.** A department must be live, visible and top level
 *    (the rail lists departments, never subcategories); a brand must be live; a product must be
 *    published and carry a **genuine** saving, because "On Offer" is a claim about the price, and a
 *    picked product without one would put a lie under that heading.
 * 3. **The caps are enforced here, not only in the browser.** 15 departments, 15 brands, 10 offers -
 *    the rows' own sizes. A form that submits more is refused rather than silently truncated.
 *
 * Every save rewrites the section's rows as one dense 0..n-1 sequence inside a transaction that holds
 * an advisory lock, so two owners saving at once cannot interleave two orders into one.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { brand, category, product, storefrontPick } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';
import { STOREFRONT_SECTIONS } from '@/db/schema/values';

/** How many of each the rows draw. The homepage caps its own lists to the same numbers. */
export const STOREFRONT_CATEGORY_LIMIT = 15;
export const STOREFRONT_BRAND_LIMIT = 15;
export const STOREFRONT_OFFER_LIMIT = 10;

export type StorefrontSection = (typeof STOREFRONT_SECTIONS)[number];

/** One chosen thing, as the editor draws it: the facts a picker row needs and nothing more. */
export type StorefrontPickRow = {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  /** The category photograph or the brand mark, so a chosen row is recognisable by sight. */
  readonly imageKey: string | null;
  /** Categories and brands: how many live products the pick would lead to. */
  readonly productCount?: number;
  /** Products only: the price and the comparison price the saving is derived from. */
  readonly priceMinor?: number;
  readonly compareAtPriceMinor?: number | null;
};

export type StorefrontSelection = {
  readonly categories: readonly StorefrontPickRow[];
  readonly brands: readonly StorefrontPickRow[];
  readonly offers: readonly StorefrontPickRow[];
};

export type StorefrontCandidates = {
  readonly categories: readonly StorefrontPickRow[];
  readonly brands: readonly StorefrontPickRow[];
  readonly offers: readonly StorefrontPickRow[];
};

/**
 * The advisory lock key for saving a selection. One key, because the three sections are saved by one
 * form and a second owner must not interleave with the first inside any of them.
 */
const SELECTION_LOCK = 7_412_2026;

/** A picker row's display name: the English name, then the Bangla one, then the slug. */
function nameOf(nameEn: string | null, nameBn: string | null, slug: string): string {
  return nameEn ?? nameBn ?? slug;
}

/** Every pickable department: live, visible and top level. Ordered the way the catalog orders them. */
export async function listPickableCategories(tx: Transaction): Promise<StorefrontPickRow[]> {
  const rows = await tx
    .select({
      id: category.id,
      slug: category.slug,
      nameEn: category.nameEn,
      nameBn: category.nameBn,
      imageKey: category.imageKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."category_id" = "category"."id" and "product"."deleted_at" is null
      )`,
    })
    .from(category)
    .where(
      sql`${category.deletedAt} is null and ${category.isVisible} and ${category.parentId} is null`,
    )
    .orderBy(category.sortOrder, category.nameEn);

  return rows.map((row) => ({
    id: row.id,
    name: nameOf(row.nameEn, row.nameBn, row.slug),
    slug: row.slug,
    imageKey: row.imageKey,
    productCount: row.productCount,
  }));
}

/** Every pickable brand: live, with the count of products it would sell. */
export async function listPickableBrands(tx: Transaction): Promise<StorefrontPickRow[]> {
  const rows = await tx
    .select({
      id: brand.id,
      slug: brand.slug,
      nameEn: brand.nameEn,
      nameBn: brand.nameBn,
      logoKey: brand.logoKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."brand_id" = "brand"."id" and "product"."deleted_at" is null
      )`,
    })
    .from(brand)
    .where(sql`${brand.deletedAt} is null`)
    .orderBy(brand.nameEn);

  return rows.map((row) => ({
    id: row.id,
    name: nameOf(row.nameEn, row.nameBn, row.slug),
    slug: row.slug,
    imageKey: row.logoKey,
    productCount: row.productCount,
  }));
}

/**
 * Every product the offer row could legitimately hold: published, live and genuinely discounted.
 *
 * The saving test is the same one the cards use (`discountAmount`), applied in SQL as
 * `compare_at_price_minor > price_minor` - a picked product without a saving would turn the row's
 * heading into a false claim, so it is not offered here at all.
 */
export async function listOfferableProducts(tx: Transaction): Promise<StorefrontPickRow[]> {
  const rows = await tx
    .select({
      id: product.id,
      slug: product.slug,
      nameEn: product.nameEn,
      nameBn: product.nameBn,
      priceMinor: sql<number | null>`(
        select "price_minor" from "product_variant"
        where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
        limit 1
      )`,
      compareAtPriceMinor: sql<number | null>`(
        select "compare_at_price_minor" from "product_variant"
        where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
        limit 1
      )`,
    })
    .from(product)
    .where(
      sql`${product.deletedAt} is null and ${product.isPublished}
          and exists (
            select 1 from "product_variant"
            where "product_variant"."product_id" = "product"."id"
              and "product_variant"."is_default"
              and "product_variant"."compare_at_price_minor" is not null
              and "product_variant"."compare_at_price_minor" > "product_variant"."price_minor"
          )`,
    )
    .orderBy(product.nameEn);

  return rows
    .filter((row) => row.priceMinor !== null)
    .map((row) => ({
      id: row.id,
      name: nameOf(row.nameEn, row.nameBn, row.slug),
      slug: row.slug,
      imageKey: null,
      priceMinor: row.priceMinor ?? 0,
      compareAtPriceMinor: row.compareAtPriceMinor,
    }));
}

/** The three sections' candidates, in one read, for the editor. */
export async function loadStorefrontCandidates(tx: Transaction): Promise<StorefrontCandidates> {
  const [categories, brands, offers] = await Promise.all([
    listPickableCategories(tx),
    listPickableBrands(tx),
    listOfferableProducts(tx),
  ]);
  return { categories, brands, offers };
}

/** The owner's current picks, resolved against the new rows; an archived pick is simply absent. */
export async function loadStorefrontSelection(tx: Transaction): Promise<StorefrontSelection> {
  const rows = await tx
    .select({
      section: storefrontPick.section,
      position: storefrontPick.position,
      categoryId: storefrontPick.categoryId,
      brandId: storefrontPick.brandId,
      productId: storefrontPick.productId,
    })
    .from(storefrontPick)
    .orderBy(storefrontPick.section, storefrontPick.position);

  const categoryIds = rows.flatMap((row) => (row.categoryId === null ? [] : [row.categoryId]));
  const brandIds = rows.flatMap((row) => (row.brandId === null ? [] : [row.brandId]));
  const productIds = rows.flatMap((row) => (row.productId === null ? [] : [row.productId]));

  const [categoryRows, brandRows, productRows] = await Promise.all([
    categoryIds.length === 0
      ? []
      : tx
          .select({
            id: category.id,
            slug: category.slug,
            nameEn: category.nameEn,
            nameBn: category.nameBn,
            imageKey: category.imageKey,
          })
          .from(category)
          .where(sql`${category.id} in ${categoryIds} and ${category.deletedAt} is null`),
    brandIds.length === 0
      ? []
      : tx
          .select({
            id: brand.id,
            slug: brand.slug,
            nameEn: brand.nameEn,
            nameBn: brand.nameBn,
            logoKey: brand.logoKey,
          })
          .from(brand)
          .where(sql`${brand.id} in ${brandIds} and ${brand.deletedAt} is null`),
    productIds.length === 0
      ? []
      : tx
          .select({
            id: product.id,
            slug: product.slug,
            nameEn: product.nameEn,
            nameBn: product.nameBn,
            priceMinor: sql<number | null>`(
              select "price_minor" from "product_variant"
              where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
              limit 1
            )`,
            compareAtPriceMinor: sql<number | null>`(
              select "compare_at_price_minor" from "product_variant"
              where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
              limit 1
            )`,
          })
          .from(product)
          .where(sql`${product.id} in ${productIds} and ${product.deletedAt} is null`),
  ]);

  const categoriesById = new Map(
    categoryRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: nameOf(row.nameEn, row.nameBn, row.slug),
        slug: row.slug,
        imageKey: row.imageKey,
      } satisfies StorefrontPickRow,
    ]),
  );
  const brandsById = new Map(
    brandRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: nameOf(row.nameEn, row.nameBn, row.slug),
        slug: row.slug,
        imageKey: row.logoKey,
      } satisfies StorefrontPickRow,
    ]),
  );
  const productsById = new Map(
    productRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: nameOf(row.nameEn, row.nameBn, row.slug),
        slug: row.slug,
        imageKey: null,
        priceMinor: row.priceMinor ?? 0,
        compareAtPriceMinor: row.compareAtPriceMinor,
      } satisfies StorefrontPickRow,
    ]),
  );

  /* Rows are read in their stored position order, so a pick keeps the owner's sequence. */
  const ordered = (section: StorefrontSection, resolve: (id: number) => StorefrontPickRow | undefined) =>
    rows
      .filter((row) => row.section === section)
      .flatMap((row) => {
        const id = row.categoryId ?? row.brandId ?? row.productId;
        const found = id === null ? undefined : resolve(id);
        return found === undefined ? [] : [found];
      });

  return {
    categories: ordered('categories', (id) => categoriesById.get(id)),
    brands: ordered('brands', (id) => brandsById.get(id)),
    offers: ordered('offers', (id) => productsById.get(id)),
  };
}

/** Parse one submitted id, refusing anything that is not a positive integer. */
function parsePickId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{1,18}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readIds(input: unknown, limit: number, label: string): number[] {
  if (!Array.isArray(input)) return [];
  const ids: number[] = [];
  for (const value of input) {
    const id = parsePickId(value);
    if (id === null) throw new ValidationError(`one of the chosen ${label} is not a valid id`);
    if (ids.includes(id)) continue;
    ids.push(id);
  }
  if (ids.length > limit) {
    throw new ValidationError(`choose at most ${limit} ${label}`);
  }
  return ids;
}

/**
 * Saves all three sections at once.
 *
 * The whole selection is rewritten inside one transaction under one advisory lock: the form submits the
 * three lists together, and a save that changed two sections and refused the third would leave the
 * homepage disagreeing with what the owner saw on the screen.
 */
export async function saveStorefrontSelection(
  tx: Transaction,
  actor: ActorContext,
  input: {
    categories?: unknown;
    brands?: unknown;
    offers?: unknown;
  },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'storefront', 1);

  const categories = readIds(input.categories, STOREFRONT_CATEGORY_LIMIT, 'departments');
  const brands = readIds(input.brands, STOREFRONT_BRAND_LIMIT, 'brands');
  const offers = readIds(input.offers, STOREFRONT_OFFER_LIMIT, 'offers');

  await tx.execute(sql`select pg_advisory_xact_lock(${SELECTION_LOCK})`);

  const previous = await loadStorefrontSelection(tx);

  /*
   * Every pick must be something the shop can actually show right now. One read per section, compared
   * against the same predicates the pickers list, so a hand-crafted form cannot pin an archived row.
   */
  const pickableCategories = new Set((await listPickableCategories(tx)).map((row) => row.id));
  const pickableBrands = new Set((await listPickableBrands(tx)).map((row) => row.id));
  const offerable = new Set((await listOfferableProducts(tx)).map((row) => row.id));

  const unknownCategory = categories.find((id) => !pickableCategories.has(id));
  if (unknownCategory !== undefined) {
    throw new ValidationError('a chosen department is not one the storefront can show');
  }
  const unknownBrand = brands.find((id) => !pickableBrands.has(id));
  if (unknownBrand !== undefined) {
    throw new ValidationError('a chosen brand is not one the storefront can show');
  }
  const unknownOffer = offers.find((id) => !offerable.has(id));
  if (unknownOffer !== undefined) {
    throw new ValidationError('a chosen offer is not a published product with a saving');
  }

  await tx.delete(storefrontPick);

  const rows = [
    ...categories.map((id, position) => ({ section: 'categories' as const, position, categoryId: id })),
    ...brands.map((id, position) => ({ section: 'brands' as const, position, brandId: id })),
    ...offers.map((id, position) => ({ section: 'offers' as const, position, productId: id })),
  ];
  if (rows.length > 0) {
    await tx.insert(storefrontPick).values(
      rows.map((row) => ({
        section: row.section,
        position: row.position,
        categoryId: 'categoryId' in row ? row.categoryId : null,
        brandId: 'brandId' in row ? row.brandId : null,
        productId: 'productId' in row ? row.productId : null,
      })),
    );
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'storefront.selection_updated',
    entityType: 'storefront',
    // The homepage selection is a singleton, so its audit entity is the fixed homepage id.
    entityId: 1,
    before: {
      categories: previous.categories.map((row) => row.id),
      brands: previous.brands.map((row) => row.id),
      offers: previous.offers.map((row) => row.id),
    },
    after: { categories, brands, offers },
  });
}

/**
 * The picks as the storefront needs them: slugs and ids, no names.
 *
 * Read inside the catalog snapshot, so the homepage can apply them without a second query and a pick
 * that has been archived since simply does not resolve.
 */
export async function listStorefrontPicks(tx: Transaction): Promise<{
  categorySlugs: string[];
  brandSlugs: string[];
  offerProductIds: string[];
}> {
  const rows = await tx
    .select({
      section: storefrontPick.section,
      position: storefrontPick.position,
      categorySlug: sql<string | null>`(
        select "slug" from "category"
        where "category"."id" = ${storefrontPick.categoryId} and "category"."deleted_at" is null
      )`,
      brandSlug: sql<string | null>`(
        select "slug" from "brand"
        where "brand"."id" = ${storefrontPick.brandId} and "brand"."deleted_at" is null
      )`,
      productId: sql<string | null>`(
        select "id"::text from "product"
        where "product"."id" = ${storefrontPick.productId} and "product"."deleted_at" is null
      )`,
    })
    .from(storefrontPick)
    .orderBy(storefrontPick.section, storefrontPick.position);

  return {
    categorySlugs: rows.flatMap((row) => (row.categorySlug === null ? [] : [row.categorySlug])),
    brandSlugs: rows.flatMap((row) => (row.brandSlug === null ? [] : [row.brandSlug])),
    offerProductIds: rows.flatMap((row) => (row.productId === null ? [] : [row.productId])),
  };
}
