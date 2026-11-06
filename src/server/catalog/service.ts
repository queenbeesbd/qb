/**
 * Catalog mutations - the owner's product and category maintenance.
 *
 * Every function here:
 *
 * 1. **re-checks the permission at the service boundary**, not only in the route, so a caller that
 *    forgets the route check fails closed;
 * 2. **validates and normalizes on the server**, so no browser-formatted price, invented availability
 *    value or client-supplied image metadata is ever stored;
 * 3. **writes its audit record in the caller's transaction**, so the state change and the evidence of
 *    it succeed or fail together - the opposite of the denial path, which deliberately writes in its own
 *    transaction because a refusal rolls its transaction back;
 * 4. **refuses rather than cascades** when a row is still referenced.
 *
 * Money is integer poisha throughout and is only ever produced by `parsePoisha`. Availability is only
 * ever one of the two documented states. Neither can be set by a field the browser chooses: the update
 * objects below are built explicitly from validated values, so an extra form field has nowhere to go.
 *
 * See `docs/data-model.md` 5.1-5.4 for the table design and `docs/decisions/0010-availability-toggle-scope.md`
 * for what the availability state does and does not guarantee.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { likeTerm } from '@/lib/search';
import {
  brand,
  category,
  orderItem,
  product,
  productImage,
  productImageDerivative,
  productVariant,
} from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';

import { isKnownAsset, readAsset, type AssetDescriptor } from './assets';
import {
  parseAvailability,
  parseId,
  parseImageKey,
  parseOptionalText,
  parsePoisha,
  parseRequiredText,
  parseSku,
  parseSlug,
  parseSortOrder,
  slugify,
  TEXT_BOUNDS,
  type Availability,
} from './validation';

export type { ActorContext };

/** The capability every catalog mutation requires. */
const CATALOG = PERMISSIONS.catalogWrite;

// ---------------------------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------------------------

/**
 * Brands are a prerequisite rather than a module: `product.brand_id` is `NOT NULL`, so a product
 * cannot exist without one. Phase 13 therefore offers brand creation and selection, and no brand
 * editing surface - the smallest thing that makes the product form usable.
 */
export async function listBrands(tx: Transaction): Promise<
  { id: number; slug: string; nameBn: string; nameEn: string; isActive: boolean }[]
> {
  return tx
    .select({
      id: brand.id,
      slug: brand.slug,
      nameBn: brand.nameBn,
      nameEn: brand.nameEn,
      isActive: brand.isActive,
    })
    .from(brand)
    .where(sql`${brand.deletedAt} is null`)
    .orderBy(brand.nameEn);
}

export async function createBrand(
  tx: Transaction,
  actor: ActorContext,
  input: { nameBn: unknown; nameEn: unknown; slug?: unknown },
): Promise<{ brandId: number }> {
  await requirePermission(actor, CATALOG, 'brand', 0);

  const nameBn = parseRequiredText(input.nameBn, TEXT_BOUNDS.categoryName);
  const nameEn = parseRequiredText(input.nameEn, TEXT_BOUNDS.categoryName);
  if (nameBn === null || nameEn === null) throw new ValidationError('a brand needs both names');

  const slug = input.slug === undefined || input.slug === '' ? slugify(nameEn) : parseSlug(input.slug);
  if (slug === null) {
    throw new ValidationError('a brand needs a slug in lowercase letters, digits and dashes');
  }

  const existing = await tx.select({ id: brand.id }).from(brand).where(sql`${brand.slug} = ${slug}`);
  if (existing.length > 0) throw new ConflictError('a brand with that slug already exists');

  const inserted = await tx
    .insert(brand)
    .values({ slug, nameBn, nameEn })
    .returning({ id: brand.id });
  const brandId = inserted[0]?.id;
  if (brandId === undefined) throw new Error('brand insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.brand_created',
    entityType: 'brand',
    entityId: brandId,
    after: { slug, nameEn },
  });

  return { brandId };
}

/** Rows per page for the admin brand list. */
export const BRAND_PAGE_SIZE = 25;

/**
 * Brands, for the admin list.
 *
 * The product count is a correlated `count(*)` over live product rows - never a stored counter - so a
 * row cannot advertise a number the catalog does not hold. `search` matches the English name, the
 * Bangla name and the slug; the footer's total runs over the same predicate as the page.
 */
export async function listBrandsForAdmin(
  tx: Transaction,
  options: {
    readonly search?: string;
    readonly limit?: number;
    readonly offset?: number;
  } = {},
): Promise<{
  readonly rows: {
    id: number;
    slug: string;
    nameBn: string;
    nameEn: string;
    logoKey: string | null;
    productCount: number;
  }[];
  readonly total: number;
}> {
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${brand.nameEn} ilike ${likeTerm(search)}
          or ${brand.nameBn} ilike ${likeTerm(search)}
          or ${brand.slug} ilike ${likeTerm(search)})`;
  const where = sql`${brand.deletedAt} is null and ${searchClause}`;
  const limit = Math.min(Math.max(options.limit ?? BRAND_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await tx
    .select({
      id: brand.id,
      slug: brand.slug,
      nameBn: brand.nameBn,
      nameEn: brand.nameEn,
      logoKey: brand.logoKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."brand_id" = "brand"."id" and "product"."deleted_at" is null
      )`,
    })
    .from(brand)
    .where(where)
    .orderBy(brand.nameEn)
    .limit(limit)
    .offset(offset);

  const counted = await tx.select({ total: sql<number>`count(*)::int` }).from(brand).where(where);

  return { rows, total: counted[0]?.total ?? 0 };
}

/**
 * One live brand by id, for the logo editor.
 *
 * Returns `null` for an archived row, an unknown id or a malformed one, so a hand-typed id cannot
 * disclose an archived record and a stale link is a 404 rather than an empty editor.
 */
export async function getBrandForAdmin(
  tx: Transaction,
  brandId: unknown,
): Promise<{
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  logoKey: string | null;
  productCount: number;
} | null> {
  const id = parseId(brandId);
  if (id === null) return null;

  const rows = await tx
    .select({
      id: brand.id,
      slug: brand.slug,
      nameBn: brand.nameBn,
      nameEn: brand.nameEn,
      logoKey: brand.logoKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."brand_id" = "brand"."id" and "product"."deleted_at" is null
      )`,
    })
    .from(brand)
    .where(sql`${brand.id} = ${id} and ${brand.deletedAt} is null`);

  return rows[0] ?? null;
}

/**
 * Sets or clears a brand's logo.
 *
 * The same contract as `setCategoryImage`, because it is the same kind of decision: the value is an
 * **asset key**, validated first by shape and then against the server's own inventory, and nothing
 * about the image comes from the browser except which key was chosen. A brand cannot be pointed at a
 * URL, a path outside `public/catalog`, or a file that does not exist.
 *
 * `null` / `''` clear the column and the storefront draws the brand's initials - a stated gap rather
 * than a substituted mark. Every change is audited with the key it replaced.
 *
 * **There is no upload here, deliberately.** Writing new bytes would mean accepting, re-encoding and
 * generating two widths inside a request handler, which needs an image-processing library at runtime
 * and, for a deployment, object storage (ADR 0006) - neither of which is approved. The editor therefore
 * lists the assets the shop already owns. That gap is stated in the interface, not implied away.
 */
export async function setBrandImage(
  tx: Transaction,
  actor: ActorContext,
  input: { brandId: unknown; imageKey: unknown; asset?: AssetDescriptor | null },
): Promise<{ logoKey: string | null }> {
  const id = parseId(input.brandId);
  if (id === null) throw new ValidationError('a brand id is required');
  await requirePermission(actor, CATALOG, 'brand', id);

  const rows = await tx
    .select({ id: brand.id, slug: brand.slug, logoKey: brand.logoKey, deletedAt: brand.deletedAt })
    .from(brand)
    .where(sql`${brand.id} = ${id}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such brand');

  const raw = typeof input.imageKey === 'string' ? input.imageKey.trim() : '';
  let logoKey: string | null = null;
  if (raw !== '') {
    logoKey = parseImageKey(raw);
    if (logoKey === null) throw new ValidationError('that is not a valid image key');
    // An upload was decoded and written by `saveUpload` in this same request, so its descriptor is the
    // server's own reading of the bytes; anything else is resolved against the catalog inventory.
    const asset = input.asset ?? (await readAsset(logoKey));
    if ((asset === null || asset.key !== logoKey) && !(await isKnownAsset(logoKey))) {
      throw new ValidationError('that image is not a complete, supported asset in the catalog directory');
    }
  }

  await tx.update(brand).set({ logoKey, updatedAt: new Date() }).where(sql`${brand.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.brand_image_updated',
    entityType: 'brand',
    entityId: id,
    before: { logoKey: row.logoKey },
    after: { logoKey },
  });

  return { logoKey };
}

// ---------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------

export type CategoryInput = {
  readonly slug?: unknown;
  readonly nameBn: unknown;
  readonly nameEn: unknown;
  readonly descriptionBn?: unknown;
  readonly descriptionEn?: unknown;
  readonly sortOrder?: unknown;
  readonly isVisible?: unknown;
  /**
   * The one-line label under the category's name on the storefront index.
   *
   * Optional: an omitted value keeps whatever the row already has, and an empty string clears it. That
   * is the same convention the descriptions use, so a form that leaves the field out cannot wipe it.
   */
  readonly tagline?: unknown;
  /**
   * The category's square photograph, as an **asset key** - never a URL.
   *
   * `undefined` keeps the current image, `null` or `''` removes it. The key is validated against the
   * server's own inventory by `setCategoryImage`, not by this input, because the association needs a
   * database read that the create path does not otherwise perform.
   */
  readonly imageKey?: unknown;
};

/** Rows per page for the admin category list. */
export const CATEGORY_PAGE_SIZE = 25;

/**
 * Categories, for the admin list.
 *
 * The product count per category is a correlated `count(*)` over live rows - never a stored counter -
 * so it cannot disagree with the catalog. `search` matches the English name, the Bangla name and the
 * slug; `visibility` narrows to visible or hidden. The count for the footer runs over the same
 * predicate as the page.
 */
export async function listCategoriesForAdmin(
  tx: Transaction,
  options: {
    readonly search?: string;
    readonly visibility?: 'visible' | 'hidden';
    readonly limit?: number;
    readonly offset?: number;
  } = {},
): Promise<{
  readonly rows: {
    id: number;
    slug: string;
    nameBn: string;
    nameEn: string;
    descriptionBn: string | null;
    descriptionEn: string | null;
    sortOrder: number;
    isVisible: boolean;
    productCount: number;
    subcategoryCount: number;
  }[];
  readonly total: number;
}> {
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${category.nameEn} ilike ${likeTerm(search)}
          or ${category.nameBn} ilike ${likeTerm(search)}
          or ${category.slug} ilike ${likeTerm(search)})`;
  const visibility = options.visibility ?? null;
  const where = sql`${category.deletedAt} is null
          and (${visibility}::text is null
               or (${visibility} = 'visible' and ${category.isVisible})
               or (${visibility} = 'hidden' and not ${category.isVisible}))
          and ${searchClause}`;
  const limit = Math.min(Math.max(options.limit ?? CATEGORY_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await tx
    .select({
      id: category.id,
      slug: category.slug,
      nameBn: category.nameBn,
      nameEn: category.nameEn,
      descriptionBn: category.descriptionBn,
      descriptionEn: category.descriptionEn,
      sortOrder: category.sortOrder,
      isVisible: category.isVisible,
      tagline: category.tagline,
      imageKey: category.imageKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."category_id" = "category"."id" and "product"."deleted_at" is null
      )`,
      // The second half of the archive refusal, derived the same way. The list shows it beside the
      // product count so the owner can see why an archive would be refused before pressing it.
      subcategoryCount: sql<number>`(
        select count(*)::int from "category" child
        where child."parent_id" = "category"."id" and child."deleted_at" is null
      )`,
    })
    .from(category)
    .where(where)
    .orderBy(category.sortOrder, category.nameEn, category.id)
    .limit(limit)
    .offset(offset);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(category)
    .where(where);

  return { rows, total: counted[0]?.total ?? 0 };
}

/**
 * One live category by id, for the edit route.
 *
 * Returns `null` for anything that is not a live row - an archived category, an unknown id or a
 * malformed one - so a hand-crafted id cannot disclose an archived record. The lookup is a direct
 * read rather than a scan of a page, so it does not depend on where the owner has paged to.
 *
 * `productCount` and `subcategoryCount` are the two derived counts `archiveCategory` refuses on, read
 * here so the editor can say what is in the way *before* the owner tries to archive it. Both are
 * correlated `count(*)` over live rows - never a stored counter, so neither can drift from the catalog.
 */
export async function getCategoryForAdmin(
  tx: Transaction,
  categoryId: unknown,
): Promise<{
  id: number;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isVisible: boolean;
  tagline: string | null;
  imageKey: string | null;
  productCount: number;
  subcategoryCount: number;
} | null> {
  const id = parseId(categoryId);
  if (id === null) return null;

  const rows = await tx
    .select({
      id: category.id,
      slug: category.slug,
      nameBn: category.nameBn,
      nameEn: category.nameEn,
      descriptionBn: category.descriptionBn,
      descriptionEn: category.descriptionEn,
      sortOrder: category.sortOrder,
      isVisible: category.isVisible,
      tagline: category.tagline,
      imageKey: category.imageKey,
      productCount: sql<number>`(
        select count(*)::int from "product"
        where "product"."category_id" = "category"."id" and "product"."deleted_at" is null
      )`,
      subcategoryCount: sql<number>`(
        select count(*)::int from "category" child
        where child."parent_id" = "category"."id" and child."deleted_at" is null
      )`,
    })
    .from(category)
    .where(sql`${category.id} = ${id} and ${category.deletedAt} is null`);

  return rows[0] ?? null;
}

export async function createCategory(
  tx: Transaction,
  actor: ActorContext,
  input: CategoryInput,
): Promise<{ categoryId: number }> {
  await requirePermission(actor, CATALOG, 'category', 0);

  const fields = await normalizeCategoryInput(tx, input, null);

  const inserted = await tx
    .insert(category)
    .values({
      slug: fields.slug,
      nameBn: fields.nameBn,
      nameEn: fields.nameEn,
      descriptionBn: fields.descriptionBn,
      descriptionEn: fields.descriptionEn,
      sortOrder: fields.sortOrder,
      isVisible: fields.isVisible,
      tagline: fields.tagline ?? null,
    })
    .returning({ id: category.id });
  const categoryId = inserted[0]?.id;
  if (categoryId === undefined) throw new Error('category insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.category_created',
    entityType: 'category',
    entityId: categoryId,
    after: { slug: fields.slug, nameEn: fields.nameEn, isVisible: fields.isVisible },
  });

  return { categoryId };
}

export async function updateCategory(
  tx: Transaction,
  actor: ActorContext,
  categoryId: unknown,
  input: CategoryInput,
): Promise<void> {
  const id = parseId(categoryId);
  if (id === null) throw new ValidationError('a category id is required');
  await requirePermission(actor, CATALOG, 'category', id);

  const before = await tx
    .select({
      id: category.id,
      slug: category.slug,
      nameEn: category.nameEn,
      sortOrder: category.sortOrder,
      isVisible: category.isVisible,
      deletedAt: category.deletedAt,
    })
    .from(category)
    .where(sql`${category.id} = ${id}`);
  const row = before[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such category');

  const fields = await normalizeCategoryInput(tx, input, id);

  await tx
    .update(category)
    .set({
      slug: fields.slug,
      nameBn: fields.nameBn,
      nameEn: fields.nameEn,
      descriptionBn: fields.descriptionBn,
      descriptionEn: fields.descriptionEn,
      sortOrder: fields.sortOrder,
      isVisible: fields.isVisible,
      // Only when the form supplied it: an absent field must not silently erase a line the owner wrote.
      ...(fields.tagline === undefined ? {} : { tagline: fields.tagline }),
      updatedAt: new Date(),
    })
    .where(sql`${category.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.category_updated',
    entityType: 'category',
    entityId: id,
    before: { slug: row.slug, nameEn: row.nameEn, sortOrder: row.sortOrder, isVisible: row.isVisible },
    after: {
      slug: fields.slug,
      nameEn: fields.nameEn,
      sortOrder: fields.sortOrder,
      isVisible: fields.isVisible,
    },
  });
}

/**
 * Archives a category by setting `deleted_at`.
 *
 * **Refuses while any live product still references it.** A category is a shared grouping: silently
 * deleting one would either orphan its products or cascade into them, and both are worse than an
 * explicit refusal the owner can act on. The refusal names the count so the owner knows what to move.
 */
export async function archiveCategory(
  tx: Transaction,
  actor: ActorContext,
  categoryId: unknown,
): Promise<void> {
  const id = parseId(categoryId);
  if (id === null) throw new ValidationError('a category id is required');
  await requirePermission(actor, CATALOG, 'category', id);

  const row = await tx
    .select({ id: category.id, slug: category.slug, deletedAt: category.deletedAt })
    .from(category)
    .where(sql`${category.id} = ${id}`);
  const found = row[0];
  if (found === undefined || found.deletedAt !== null) throw new ConflictError('no such category');

  const referencing = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(product)
    .where(sql`${product.categoryId} = ${id} and ${product.deletedAt} is null`);
  const inUse = referencing[0]?.total ?? 0;
  if (inUse > 0) {
    throw new ConflictError(`this category still has ${inUse} product(s); move them first`);
  }

  const child = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(category)
    .where(sql`${category.parentId} = ${id} and ${category.deletedAt} is null`);
  if ((child[0]?.total ?? 0) > 0) throw new ConflictError('this category still has subcategories');

  await tx
    .update(category)
    .set({ deletedAt: new Date(), isVisible: false, updatedAt: new Date() })
    .where(sql`${category.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.category_archived',
    entityType: 'category',
    entityId: id,
    before: { slug: found.slug },
  });
}

async function normalizeCategoryInput(
  tx: Transaction,
  input: CategoryInput,
  excludeId: number | null,
): Promise<{
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isVisible: boolean;
  tagline: string | null | undefined;
}> {
  const nameBn = parseRequiredText(input.nameBn, TEXT_BOUNDS.categoryName);
  const nameEn = parseRequiredText(input.nameEn, TEXT_BOUNDS.categoryName);
  if (nameBn === null || nameEn === null) {
    throw new ValidationError('a category needs both a Bangla and an English name');
  }

  const slug =
    input.slug === undefined || input.slug === '' ? slugify(nameEn) : parseSlug(input.slug);
  if (slug === null) {
    throw new ValidationError('the slug must be lowercase letters, digits and single dashes');
  }

  const descriptionBn = parseOptionalText(input.descriptionBn, TEXT_BOUNDS.description);
  const descriptionEn = parseOptionalText(input.descriptionEn, TEXT_BOUNDS.description);
  if (!descriptionBn.ok || !descriptionEn.ok) throw new ValidationError('a description is too long');

  const sortOrder =
    input.sortOrder === undefined || input.sortOrder === ''
      ? 0
      : parseSortOrder(input.sortOrder);
  if (sortOrder === null) throw new ValidationError('the display order must be a whole number');

  /*
   * The tagline is optional in a different sense from the descriptions: `undefined` means "leave what
   * is there", `''` means "clear it", and a real value is bounded. A form that omits the field (the
   * create form) therefore renders no line, and the update form can empty one deliberately.
   */
  const taglineResult = parseOptionalText(input.tagline, TEXT_BOUNDS.categoryTagline);
  if (!taglineResult.ok) throw new ValidationError('the one-line label is too long');
  const tagline = input.tagline === undefined ? undefined : taglineResult.value;

  /*
   * The slug is checked against **every** row, archived ones included. Archiving a category does not
   * free its slug - the unique index still holds it - so checking only live rows let a clash through to
   * the database and surfaced as a 500 instead of a refusal the owner can read. Re-using an archived
   * category's slug is refused here, in the same transaction, with the same message.
   */
  const clash = await tx
    .select({ id: category.id })
    .from(category)
    .where(
      excludeId === null
        ? sql`${category.slug} = ${slug}`
        : sql`${category.slug} = ${slug} and ${category.id} <> ${excludeId}`,
    );
  if (clash.length > 0) throw new ConflictError('another category already uses that slug');

  return {
    slug,
    nameBn,
    nameEn,
    descriptionBn: descriptionBn.value,
    descriptionEn: descriptionEn.value,
    sortOrder,
    isVisible: input.isVisible === undefined ? true : parseVisibility(input.isVisible),
    tagline,
  };
}

function parseVisibility(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === '1' || value === true;
}

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

/** Rows per page for the admin product list. Bounded, and changeable from the list footer. */
export const PRODUCT_PAGE_SIZE = 25;

export type ProductInput = {
  readonly slug?: unknown;
  /** Optional since the owner's 2026-10-23 decision; blank stores null rather than the English name. */
  readonly nameBn?: unknown;
  readonly nameEn: unknown;
  readonly descriptionBn?: unknown;
  readonly descriptionEn?: unknown;
  readonly shortDescription?: unknown;
  readonly categoryId: unknown;
  readonly brandId: unknown;
  readonly packSize?: unknown;
  readonly price: unknown;
  readonly compareAtPrice?: unknown;
  readonly sku?: unknown;
  readonly availability: unknown;
  readonly isPublished?: unknown;
};

/**
 * A product as the admin list needs it. Prices come from the product's default variant, which is where
 * the schema puts them - the storefront's `Product.priceMinor` is the same value projected through the
 * read layer.
 *
 * The list is **paged with an exact total** (Phase 30). The count runs over the same predicate as the
 * page, so the footer cannot disagree with the rows it describes, and the order ends with `id` so a
 * page boundary is stable when two products share a name.
 */
export async function listProductsForAdmin(
  tx: Transaction,
  options: {
    readonly search?: string;
    readonly availability?: 'in_stock' | 'out_of_stock';
    readonly limit?: number;
    readonly offset?: number;
  } = {},
): Promise<{
  readonly rows: {
    id: number;
    slug: string;
    nameBn: string | null;
    nameEn: string;
    categoryId: number;
    categoryNameEn: string;
    brandNameEn: string;
    availability: string;
    isPublished: boolean;
    priceMinor: number | null;
    compareAtPriceMinor: number | null;
    sku: string | null;
    imageCount: number;
    primaryImageKey: string | null;
  }[];
  readonly total: number;
}> {
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${product.nameEn} ilike ${likeTerm(search)}
          or ${product.nameBn} ilike ${likeTerm(search)}
          or ${product.slug} ilike ${likeTerm(search)}
          or exists (
            select 1 from "product_variant"
            where "product_variant"."product_id" = ${product.id}
              and "product_variant"."is_default"
              and "product_variant"."sku" ilike ${likeTerm(search)}
          ))`;
  const availability = options.availability ?? null;
  const where = sql`${product.deletedAt} is null
          and (${availability}::text is null or ${product.availability} = ${availability})
          and ${searchClause}`;
  const limit = Math.min(Math.max(options.limit ?? PRODUCT_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await tx
    .select({
      id: product.id,
      slug: product.slug,
      nameBn: product.nameBn,
      nameEn: product.nameEn,
      categoryId: product.categoryId,
      categoryNameEn: category.nameEn,
      brandNameEn: brand.nameEn,
      availability: product.availability,
      isPublished: product.isPublished,
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
      sku: sql<string | null>`(
        select "sku" from "product_variant"
        where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
        limit 1
      )`,
      imageCount: sql<number>`(
        select count(*)::int from "product_image"
        where "product_image"."product_id" = "product"."id" and "product_image"."deleted_at" is null
      )`,
      /*
       * The photograph the list draws beside a row: the flagged primary, or failing that the first
       * image in the owner's order. Without the fallback, a product whose images exist but whose
       * primary flag was never set would show the empty frame while its detail page showed a photo -
       * a worse lie than no thumbnail at all.
       */
      primaryImageKey: sql<string | null>`(
        select "base_key" from "product_image"
        where "product_image"."product_id" = "product"."id"
          and "product_image"."deleted_at" is null
        order by "product_image"."is_primary" desc, "product_image"."sort_order" asc, "product_image"."id" asc
        limit 1
      )`,
    })
    .from(product)
    .innerJoin(category, sql`${category.id} = ${product.categoryId}`)
    .innerJoin(brand, sql`${brand.id} = ${product.brandId}`)
    // Filters narrow an owner-facing list only. They apply over the same "live row" predicate, so a
    // search cannot reveal an archived product, and availability stays the binary state it is.
    .where(where)
    .orderBy(product.nameEn, product.id)
    .limit(limit)
    .offset(offset);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(product)
    .innerJoin(category, sql`${category.id} = ${product.categoryId}`)
    .innerJoin(brand, sql`${brand.id} = ${product.brandId}`)
    .where(where);

  return { rows, total: counted[0]?.total ?? 0 };
}

export async function getProductForAdmin(tx: Transaction, productId: unknown): Promise<
  | {
      id: number;
      slug: string;
      nameBn: string | null;
      nameEn: string;
      descriptionBn: string | null;
      descriptionEn: string | null;
      shortDescription: string | null;
      packSize: string | null;
      categoryId: number;
      brandId: number;
      availability: string;
      isPublished: boolean;
      publishedAt: Date | null;
      priceMinor: number | null;
      compareAtPriceMinor: number | null;
      sku: string | null;
      images: {
        id: string;
        key: string;
        altBn: string | null;
        altEn: string | null;
        sortOrder: number;
        isPrimary: boolean;
        rightsStatus: string;
      }[];
    }
  | null
> {
  const id = parseId(productId);
  if (id === null) return null;

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
      categoryId: product.categoryId,
      brandId: product.brandId,
      availability: product.availability,
      isPublished: product.isPublished,
      publishedAt: product.publishedAt,
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
      sku: sql<string | null>`(
        select "sku" from "product_variant"
        where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
        limit 1
      )`,
    })
    .from(product)
    .where(sql`${product.id} = ${id} and ${product.deletedAt} is null`);

  const row = rows[0];
  if (row === undefined) return null;

  const images = await tx
    .select({
      id: productImage.id,
      key: productImage.baseKey,
      altBn: productImage.altBn,
      altEn: productImage.altEn,
      sortOrder: productImage.sortOrder,
      isPrimary: productImage.isPrimary,
      rightsStatus: productImage.rightsStatus,
    })
    .from(productImage)
    .where(sql`${productImage.productId} = ${id} and ${productImage.deletedAt} is null`)
    .orderBy(productImage.sortOrder, productImage.createdAt);

  return { ...row, images };
}

/**
 * Creates a product and its default variant in one transaction.
 *
 * Every product gets exactly one variant, flagged `is_default`. That is not a variant system: the
 * schema puts the price on the variant, and the storefront's contract has one price per product, so a
 * single default variant is the honest representation of "one product, one price". Variant combinations
 * remain deferred (`docs/admin-dashboard.md`, Later).
 */
export async function createProduct(
  tx: Transaction,
  actor: ActorContext,
  input: ProductInput,
): Promise<{ productId: number }> {
  await requirePermission(actor, CATALOG, 'product', 0);

  const fields = await normalizeProductInput(tx, input, null);

  const inserted = await tx
    .insert(product)
    .values({
      slug: fields.slug,
      brandId: fields.brandId,
      categoryId: fields.categoryId,
      nameBn: fields.nameBn,
      nameEn: fields.nameEn,
      descriptionBn: fields.descriptionBn,
      descriptionEn: fields.descriptionEn,
      shortDescription: fields.shortDescription,
      packSize: fields.packSize,
      availability: fields.availability,
      isPublished: fields.isPublished,
      publishedAt: fields.isPublished ? new Date() : null,
    })
    .returning({ id: product.id });
  const productId = inserted[0]?.id;
  if (productId === undefined) throw new Error('product insert returned no id');

  await tx.insert(productVariant).values({
    productId,
    sku: fields.sku,
    isDefault: true,
    labelBn: fields.nameBn,
    labelEn: fields.nameEn,
    priceMinor: fields.priceMinor,
    compareAtPriceMinor: fields.compareAtPriceMinor,
  });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.product_created',
    entityType: 'product',
    entityId: productId,
    after: {
      slug: fields.slug,
      nameEn: fields.nameEn,
      categoryId: fields.categoryId,
      priceMinor: fields.priceMinor,
      availability: fields.availability,
      isPublished: fields.isPublished,
    },
  });

  return { productId };
}

export async function updateProduct(
  tx: Transaction,
  actor: ActorContext,
  productId: unknown,
  input: ProductInput,
): Promise<void> {
  const id = parseId(productId);
  if (id === null) throw new ValidationError('a product id is required');
  await requirePermission(actor, CATALOG, 'product', id);

  const before = await tx
    .select({
      slug: product.slug,
      nameEn: product.nameEn,
      availability: product.availability,
      isPublished: product.isPublished,
      publishedAt: product.publishedAt,
      deletedAt: product.deletedAt,
      priceMinor: sql<number | null>`(
        select "price_minor" from "product_variant"
        where "product_variant"."product_id" = "product"."id" and "product_variant"."is_default"
        limit 1
      )`,
    })
    .from(product)
    .where(sql`${product.id} = ${id}`);
  const row = before[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such product');

  const fields = await normalizeProductInput(tx, input, id);

  await tx
    .update(product)
    .set({
      slug: fields.slug,
      brandId: fields.brandId,
      categoryId: fields.categoryId,
      nameBn: fields.nameBn,
      nameEn: fields.nameEn,
      descriptionBn: fields.descriptionBn,
      descriptionEn: fields.descriptionEn,
      shortDescription: fields.shortDescription,
      packSize: fields.packSize,
      availability: fields.availability,
      isPublished: fields.isPublished,
      // `product_published_needs_timestamp` requires a timestamp the first time it is published; an
      // unpublish keeps the original date rather than erasing when it was first made public.
      publishedAt: fields.isPublished ? (row.publishedAt ?? new Date()) : row.publishedAt,
      updatedAt: new Date(),
    })
    .where(sql`${product.id} = ${id}`);

  await tx
    .update(productVariant)
    .set({
      sku: fields.sku,
      labelBn: fields.nameBn,
      labelEn: fields.nameEn,
      priceMinor: fields.priceMinor,
      compareAtPriceMinor: fields.compareAtPriceMinor,
      updatedAt: new Date(),
    })
    .where(sql`${productVariant.productId} = ${id} and ${productVariant.isDefault}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.product_updated',
    entityType: 'product',
    entityId: id,
    before: {
      slug: row.slug,
      nameEn: row.nameEn,
      priceMinor: row.priceMinor,
      availability: row.availability,
      isPublished: row.isPublished,
    },
    after: {
      slug: fields.slug,
      nameEn: fields.nameEn,
      priceMinor: fields.priceMinor,
      availability: fields.availability,
      isPublished: fields.isPublished,
    },
  });
}

/**
 * Changes availability alone, and audits it as its own action.
 *
 * This is the operation the owner performs most often and the one the storefront depends on, so it is a
 * separate, narrow mutation rather than a side effect of editing a product: the audit trail then shows
 * *when the product was taken off sale*, which is the question anyone actually asks afterwards.
 */
export async function setAvailability(
  tx: Transaction,
  actor: ActorContext,
  input: { productId: unknown; availability: unknown },
): Promise<{ availability: Availability }> {
  const id = parseId(input.productId);
  if (id === null) throw new ValidationError('a product id is required');
  await requirePermission(actor, CATALOG, 'product', id);

  // Only the two documented states. An unrecognized value is refused rather than coerced, so a client
  // cannot invent a third state, and a quantity cannot be smuggled in where a state belongs.
  const availability = parseAvailability(input.availability);
  if (availability === null) throw new ValidationError('unsupported availability value');

  const rows = await tx
    .select({ availability: product.availability, deletedAt: product.deletedAt })
    .from(product)
    .where(sql`${product.id} = ${id}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such product');

  // An unchanged value is a no-op, not a second audit record: the trail should show decisions, and
  // repeating a decision is not one.
  if (row.availability === availability) return { availability };

  await tx
    .update(product)
    .set({ availability, updatedAt: new Date() })
    .where(sql`${product.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.availability_changed',
    entityType: 'product',
    entityId: id,
    before: { availability: row.availability },
    after: { availability },
  });

  return { availability };
}

/**
 * Archives a product by setting `deleted_at`, and unpublishes it in the same statement.
 *
 * **Refuses while an order references the product.** `order_item` is frozen and append-only, and its
 * `variant_id` is `ON DELETE RESTRICT`, so a hard delete is impossible by design. A soft delete is
 * therefore the archive path, and it is still refused while an order exists: removing the product a
 * customer's order points at would make the order unexplainable.
 *
 * Availability is deliberately left as it is. An archived product is unpublishable and unorderable
 * through `checkOrderability`, which refuses a soft-deleted row; rewriting the availability state here
 * would destroy the owner's last statement about the product.
 */
/**
 * Sets or clears a category's square photograph.
 *
 * The value is an **asset key**, and it is resolved against the server's own inventory exactly as a
 * product image is: format first, then the allowlist, then the file itself. Nothing about the image
 * comes from the browser except which key was chosen, so a category cannot be pointed at a URL, a
 * path outside the catalog directory, or a file that does not exist.
 *
 * `null` / `''` clear the column, and the storefront then draws the category's icon - a stated gap
 * rather than a substituted picture. Every change is audited with the key that replaced the old one,
 * because "why does this category have that photograph" is a question the audit trail should answer.
 */
export async function setCategoryImage(
  tx: Transaction,
  actor: ActorContext,
  input: { categoryId: unknown; imageKey: unknown; asset?: AssetDescriptor | null },
): Promise<{ imageKey: string | null }> {
  const id = parseId(input.categoryId);
  if (id === null) throw new ValidationError('a category id is required');
  await requirePermission(actor, CATALOG, 'category', id);

  const rows = await tx
    .select({ id: category.id, slug: category.slug, imageKey: category.imageKey, deletedAt: category.deletedAt })
    .from(category)
    .where(sql`${category.id} = ${id}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such category');

  const raw = typeof input.imageKey === 'string' ? input.imageKey.trim() : '';
  let imageKey: string | null = null;
  if (raw !== '') {
    imageKey = parseImageKey(raw);
    if (imageKey === null) throw new ValidationError('that is not a valid image key');
    const asset = input.asset ?? (await readAsset(imageKey));
    if ((asset === null || asset.key !== imageKey) && !(await isKnownAsset(imageKey))) {
      throw new ValidationError('that image is not a complete, supported asset in the catalog directory');
    }
  }

  await tx
    .update(category)
    .set({ imageKey, updatedAt: new Date() })
    .where(sql`${category.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.category_image_updated',
    entityType: 'category',
    entityId: id,
    before: { imageKey: row.imageKey },
    after: { imageKey },
  });

  return { imageKey };
}

export async function archiveProduct(
  tx: Transaction,
  actor: ActorContext,
  productId: unknown,
): Promise<void> {
  const id = parseId(productId);
  if (id === null) throw new ValidationError('a product id is required');
  await requirePermission(actor, CATALOG, 'product', id);

  const rows = await tx
    .select({ slug: product.slug, deletedAt: product.deletedAt })
    .from(product)
    .where(sql`${product.id} = ${id}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such product');

  const referenced = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(orderItem)
    .innerJoin(productVariant, sql`${productVariant.id} = ${orderItem.variantId}`)
    .where(sql`${productVariant.productId} = ${id}`);
  const orders = referenced[0]?.total ?? 0;
  if (orders > 0) {
    throw new ConflictError(
      `this product appears in ${orders} order line(s); archive it by unpublishing instead`,
    );
  }

  await tx
    .update(product)
    .set({ deletedAt: new Date(), isPublished: false, updatedAt: new Date() })
    .where(sql`${product.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.product_archived',
    entityType: 'product',
    entityId: id,
    before: { slug: row.slug },
  });
}

async function normalizeProductInput(
  tx: Transaction,
  input: ProductInput,
  excludeId: number | null,
): Promise<{
  slug: string;
  nameBn: string | null;
  nameEn: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  shortDescription: string | null;
  categoryId: number;
  brandId: number;
  packSize: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  sku: string;
  availability: Availability;
  isPublished: boolean;
}> {
  /*
   * The English name is the product's identity in this English-first shop; the Bangla name is optional
   * owner content. A blank Bangla field is stored as NULL rather than copied from the English name:
   * copying would make the record claim a translation that was never written.
   */
  const nameBn = parseOptionalText(input.nameBn, TEXT_BOUNDS.productName);
  if (!nameBn.ok) throw new ValidationError('the Bangla name is too long');
  const nameEn = parseRequiredText(input.nameEn, TEXT_BOUNDS.productName);
  if (nameEn === null) throw new ValidationError('a product needs an English name');

  const slug =
    input.slug === undefined || input.slug === '' ? slugify(nameEn) : parseSlug(input.slug);
  if (slug === null) throw new ValidationError('the slug must be lowercase letters, digits and dashes');

  const descriptionBn = parseOptionalText(input.descriptionBn, TEXT_BOUNDS.description);
  const descriptionEn = parseOptionalText(input.descriptionEn, TEXT_BOUNDS.description);
  if (!descriptionBn.ok || !descriptionEn.ok) throw new ValidationError('a description is too long');

  const shortDescription = parseOptionalText(input.shortDescription, TEXT_BOUNDS.shortDescription);
  if (!shortDescription.ok) throw new ValidationError('the short description is too long');

  const packSize = parseOptionalText(input.packSize, TEXT_BOUNDS.packSize);
  if (!packSize.ok) throw new ValidationError('the pack size is too long');

  // A category reference is validated against the table, not trusted: an id that does not exist, or
  // that names an archived category, is refused rather than written as a dangling association.
  const categoryId = parseId(input.categoryId);
  if (categoryId === null) throw new ValidationError('choose a category');
  const categoryRows = await tx
    .select({ id: category.id })
    .from(category)
    .where(sql`${category.id} = ${categoryId} and ${category.deletedAt} is null`);
  if (categoryRows.length === 0) throw new ValidationError('that category does not exist');

  const brandId = parseId(input.brandId);
  if (brandId === null) throw new ValidationError('choose a brand');
  const brandRows = await tx
    .select({ id: brand.id })
    .from(brand)
    .where(sql`${brand.id} = ${brandId} and ${brand.deletedAt} is null`);
  if (brandRows.length === 0) throw new ValidationError('that brand does not exist');

  // Prices: integer poisha, produced by integer arithmetic. `compareAt` must be strictly greater, which
  // is also the database's `product_variant_compare_at_strictly_greater` check.
  const priceMinor = parsePoisha(input.price);
  if (priceMinor === null) {
    throw new ValidationError('enter a price greater than zero, with at most two decimal places');
  }
  const compareRaw = input.compareAtPrice;
  const compareAtPriceMinor =
    compareRaw === undefined || compareRaw === null || compareRaw === ''
      ? null
      : parsePoisha(compareRaw);
  if (compareAtPriceMinor !== null && compareAtPriceMinor <= priceMinor) {
    throw new ValidationError('the comparison price must be higher than the price');
  }

  const availability = parseAvailability(input.availability);
  if (availability === null) throw new ValidationError('unsupported availability value');

  const requestedSku = input.sku === undefined || input.sku === '' ? null : parseSku(input.sku);
  if (input.sku !== undefined && input.sku !== '' && requestedSku === null) {
    throw new ValidationError('the SKU must be letters, digits and dashes');
  }

  const clash = await tx
    .select({ id: product.id })
    .from(product)
    .where(
      excludeId === null
        ? sql`${product.slug} = ${slug}`
        : sql`${product.slug} = ${slug} and ${product.id} <> ${excludeId}`,
    );
  if (clash.length > 0) throw new ConflictError('another product already uses that slug');

  return {
    slug,
    nameBn: nameBn.value,
    nameEn,
    descriptionBn: descriptionBn.value,
    descriptionEn: descriptionEn.value,
    shortDescription: shortDescription.value,
    categoryId,
    brandId,
    packSize: packSize.value,
    priceMinor,
    compareAtPriceMinor,
    sku: requestedSku ?? defaultSku(slug),
    availability,
    isPublished: parseVisibility(input.isPublished),
  };
}

/**
 * A SKU derived from the slug. `product_variant.sku` is `UNIQUE` and `NOT NULL`, so a product needs one;
 * deriving it from the slug keeps it predictable and visible in the form rather than random.
 */
function defaultSku(slug: string): string {
  return `QB-${slug}`.toUpperCase().slice(0, TEXT_BOUNDS.sku);
}

// ---------------------------------------------------------------------------------------------
// Product imagery - existing local assets only
// ---------------------------------------------------------------------------------------------

/**
 * Attaches an image that already exists in `public/catalog`.
 *
 * The key is resolved against the server's own asset inventory (`assets.ts`) and the metadata is read
 * from the file bytes. **No path, URL or metadata value from the request is trusted.**
 *
 * `product_image.base_key` is globally unique and `product_image_derivative.storage_key` likewise, so an
 * asset belongs to at most one product. Re-attaching the same asset to the same product undeletes the
 * existing row rather than inserting a second one; attaching it to a different product is refused with
 * an explanation, because the alternative - sharing a base key - is not expressible in the schema.
 */
export async function attachImage(
  tx: Transaction,
  actor: ActorContext,
  input: {
    productId: unknown;
    key: unknown;
    altBn?: unknown;
    altEn?: unknown;
    isPrimary?: unknown;
    sortOrder?: unknown;
    asset?: AssetDescriptor | null;
  },
): Promise<{ imageId: string }> {
  const productId = parseId(input.productId);
  if (productId === null) throw new ValidationError('a product id is required');
  await requirePermission(actor, CATALOG, 'product', productId);

  // Format check first, allowlist and file read second. Both must pass.
  const key = parseImageKey(input.key);
  if (key === null) throw new ValidationError('choose an image from the asset list');

  const productRows = await tx
    .select({ id: product.id })
    .from(product)
    .where(sql`${product.id} = ${productId} and ${product.deletedAt} is null`);
  if (productRows.length === 0) throw new ConflictError('no such product');

  const asset = input.asset ?? (await readAsset(key));
  if (asset === null || asset.key !== key) {
    throw new ValidationError('that asset is not a complete, supported image in the catalog directory');
  }

  const altBn = parseOptionalText(input.altBn, TEXT_BOUNDS.altText);
  const altEn = parseOptionalText(input.altEn, TEXT_BOUNDS.altText);
  if (!altBn.ok || !altEn.ok) throw new ValidationError('the alt text is too long');
  // Alt text is required in at least one language, matching the rule `check:catalog` applies to the
  // demo catalog: an image with no alt text is inaccessible in both scripts.
  if (altBn.value === null && altEn.value === null) {
    throw new ValidationError('give the image alt text in at least one language');
  }

  /*
   * An explicit position is honoured; otherwise the image goes after the gallery. It used to default
   * to 0, which put every new upload in front of the owner's existing order. Appending is what a
   * reader expects from "add a photograph".
   */
  const sortOrder =
    input.sortOrder === undefined || input.sortOrder === ''
      ? (
          await tx
            .select({ next: sql<number>`coalesce(max(${productImage.sortOrder}), -1) + 1` })
            .from(productImage)
            .where(sql`${productImage.productId} = ${productId} and ${productImage.deletedAt} is null`)
        )[0]?.next ?? 0
      : parseSortOrder(input.sortOrder);
  if (sortOrder === null) throw new ValidationError('the image order must be a whole number');

  const existing = await tx
    .select({ id: productImage.id, productId: productImage.productId, deletedAt: productImage.deletedAt })
    .from(productImage)
    .where(sql`${productImage.baseKey} = ${key}`);
  const found = existing[0];

  if (found !== undefined && found.productId !== productId) {
    throw new ConflictError(
      'that image is already attached to another product; an asset can belong to one product',
    );
  }

  const hasLiveImage = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(productImage)
    .where(sql`${productImage.productId} = ${productId} and ${productImage.deletedAt} is null`);
  // The first image on a product becomes its primary: a product with images but no primary would render
  // an arbitrary one, and the partial unique index allows exactly one primary per product.
  const makePrimary =
    parseVisibility(input.isPrimary) || (hasLiveImage[0]?.total ?? 0) === 0;

  let imageId: string;

  if (found === undefined) {
    const inserted = await tx
      .insert(productImage)
      .values({
        productId,
        baseKey: asset.key,
        // Read from the file, never from the request.
        contentType: asset.contentType,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        altBn: altBn.value,
        altEn: altEn.value,
        sortOrder,
        isPrimary: false,
        // Rights are recorded, never assumed. The Phase 1 demo photography came from the vendor and
        // its reuse permission is still unconfirmed; a photograph uploaded through the admin screen
        // came from the owner, but the store has no recorded permission statement either, and
        // `cleared` would require a recorded basis. Both stay `pending_confirmation`, with a note that
        // says which case this is instead of mislabelling an owner's upload as demo photography.
        rightsStatus: 'pending_confirmation',
        rightsNote: asset.key.startsWith('product-upload-')
          ? 'Uploaded by the store owner; written reuse permission not yet recorded'
          : 'Phase 1 demo photography; written reuse permission not yet confirmed',
        uploadedBy: actor.staffUserId,
      })
      .returning({ id: productImage.id });
    imageId = inserted[0]?.id ?? '';
    if (imageId === '') throw new Error('product image insert returned no id');

    // A new image must be uploaded from bytes the server has read, so it always carries a complete
    // variant set. An empty list means the key was resolved from an existing record instead, and this
    // branch cannot be reached then (the record is `found`, not `undefined`).
    if (asset.variants.length > 0) {
      await tx.insert(productImageDerivative).values(
        asset.variants.map((variant) => ({
          productImageId: imageId,
          storageKey: variant.storageKey,
          width: variant.width,
          format: variant.format,
          byteSize: variant.byteSize,
        })),
      );
    }
  } else {
    imageId = found.id;
    await tx
      .update(productImage)
      .set({
        deletedAt: null,
        altBn: altBn.value,
        altEn: altEn.value,
        sortOrder,
        contentType: asset.contentType,
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
      })
      .where(sql`${productImage.id} = ${imageId}`);
  }

  if (makePrimary) await clearPrimary(tx, productId, imageId);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.image_attached',
    // `audit_event.entity_id` is a bigint and `product_image.id` is a uuid, so the event is recorded
    // against the product and the image key is carried in the payload where it is readable.
    entityType: 'product',
    entityId: productId,
    after: {
      imageKey: asset.key,
      contentType: asset.contentType,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      isPrimary: makePrimary,
    },
  });

  return { imageId };
}

/** Updates alt text, ordering and the primary flag for an attached image. */
export async function updateImage(
  tx: Transaction,
  actor: ActorContext,
  input: { imageId: unknown; altBn?: unknown; altEn?: unknown; sortOrder?: unknown; isPrimary?: unknown },
): Promise<void> {
  const imageId = typeof input.imageId === 'string' ? input.imageId : '';
  if (!/^[0-9a-f-]{36}$/.test(imageId)) throw new ValidationError('an image id is required');

  const rows = await tx
    .select({ productId: productImage.productId, baseKey: productImage.baseKey, deletedAt: productImage.deletedAt })
    .from(productImage)
    .where(sql`${productImage.id} = ${imageId}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such image');
  await requirePermission(actor, CATALOG, 'product', row.productId);

  const altBn = parseOptionalText(input.altBn, TEXT_BOUNDS.altText);
  const altEn = parseOptionalText(input.altEn, TEXT_BOUNDS.altText);
  if (!altBn.ok || !altEn.ok) throw new ValidationError('the alt text is too long');
  if (altBn.value === null && altEn.value === null) {
    throw new ValidationError('give the image alt text in at least one language');
  }

  const sortOrder =
    input.sortOrder === undefined || input.sortOrder === '' ? 0 : parseSortOrder(input.sortOrder);
  if (sortOrder === null) throw new ValidationError('the image order must be a whole number');

  await tx
    .update(productImage)
    .set({ altBn: altBn.value, altEn: altEn.value, sortOrder })
    .where(sql`${productImage.id} = ${imageId}`);

  if (parseVisibility(input.isPrimary)) await clearPrimary(tx, row.productId, imageId);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.image_updated',
    entityType: 'product',
    entityId: row.productId,
    after: { imageKey: row.baseKey, sortOrder, isPrimary: parseVisibility(input.isPrimary) },
  });
}

/**
 * Sets the display order of a product's images from an ordered list of image ids.
 *
 * Phase 30's follow-up asked for real ordering rather than a numeric field the owner has to reason
 * about. The whole order arrives at once, so the result is deterministic and cannot interleave with a
 * concurrent reorder: every listed id must belong to this product and be live, and any image the
 * caller omitted keeps its relative position after the ones it named.
 *
 * `sort_order` is written from the array index, so it is always a dense 0..n-1 sequence rather than an
 * arbitrary set of numbers. The primary flag is separate and untouched here: "first in the gallery" and
 * "the card's image" are different facts, and collapsing them would let a reorder silently change which
 * photo the storefront leads with.
 */
export async function reorderImages(
  tx: Transaction,
  actor: ActorContext,
  input: { productId: unknown; imageIds: unknown },
): Promise<void> {
  const productId = parseId(input.productId);
  if (productId === null) throw new ValidationError('a product id is required');
  await requirePermission(actor, CATALOG, 'product', productId);

  const raw = input.imageIds;
  if (!Array.isArray(raw) || raw.length === 0) throw new ValidationError('the image order is required');
  const ids = raw.map((value) => (typeof value === 'string' ? value : ''));
  if (ids.some((id) => !/^[0-9a-f-]{36}$/.test(id))) throw new ValidationError('an image id is malformed');
  if (new Set(ids).size !== ids.length) throw new ValidationError('the image order repeats an image');

  const owned = await tx
    .select({ id: productImage.id })
    .from(productImage)
    .where(sql`${productImage.productId} = ${productId} and ${productImage.deletedAt} is null`);
  const live = new Set(owned.map((row) => row.id));
  if (ids.some((id) => !live.has(id))) {
    throw new ValidationError('the order names an image that is not on this product');
  }

  // Images the caller did not name keep their relative order, after the named ones.
  const unnamed = owned.map((row) => row.id).filter((id) => !ids.includes(id));
  const ordered = [...ids, ...unnamed];

  for (const [index, imageId] of ordered.entries()) {
    await tx
      .update(productImage)
      .set({ sortOrder: index })
      .where(sql`${productImage.id} = ${imageId}`);
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.image_reordered',
    entityType: 'product',
    entityId: productId,
    after: { order: ordered },
  });
}

/** Soft-deletes an image. The bytes stay where they are: this phase never moves or deletes asset files. */
export async function removeImage(
  tx: Transaction,
  actor: ActorContext,
  imageId: unknown,
): Promise<void> {
  const id = typeof imageId === 'string' ? imageId : '';
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ValidationError('an image id is required');

  const rows = await tx
    .select({ productId: productImage.productId, baseKey: productImage.baseKey, deletedAt: productImage.deletedAt })
    .from(productImage)
    .where(sql`${productImage.id} = ${id}`);
  const row = rows[0];
  if (row === undefined || row.deletedAt !== null) throw new ConflictError('no such image');
  await requirePermission(actor, CATALOG, 'product', row.productId);

  // `is_primary` must be cleared in the same statement: the partial unique index only exempts deleted
  // rows, so a deleted row that still claims `is_primary` would block the next primary.
  await tx
    .update(productImage)
    .set({ deletedAt: new Date(), isPrimary: false })
    .where(sql`${productImage.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'catalog.image_removed',
    entityType: 'product',
    entityId: row.productId,
    before: { imageKey: row.baseKey },
  });
}

/** Clears the product's current primary and promotes `imageId`, in one transaction. */
async function clearPrimary(tx: Transaction, productId: number, imageId: string): Promise<void> {
  await tx
    .update(productImage)
    .set({ isPrimary: false })
    .where(
      sql`${productImage.productId} = ${productId}
          and ${productImage.isPrimary}
          and ${productImage.id} <> ${imageId}`,
    );
  await tx
    .update(productImage)
    .set({ isPrimary: true })
    .where(sql`${productImage.id} = ${imageId}`);
}
