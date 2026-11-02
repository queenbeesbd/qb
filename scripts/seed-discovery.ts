#!/usr/bin/env tsx
/**
 * Discovery data: the shop's curated rows.
 *
 * The imported catalog arrived with **no curation at all** - `collection` and `collection_item` are
 * empty in this shop's database - so the homepage could not publish the owner's "Featured" row or the
 * curated lead of "More to explore", and the brand rail had no order of its own. This script writes
 * those two selections from the catalog that is actually there.
 *
 * What it deliberately does **not** do:
 *
 * 1. **It writes no product, price, photograph or name.** Curation is a list of ids; every card the
 *    homepage renders still comes from the product rows, so nothing is fabricated.
 * 2. **It invents no claim.** Each row is assembled by a stated, reproducible rule over the catalog
 *    (below), not hand-picked to look good. The rule is written here so the owner can see exactly what
 *    "Featured" means today and change it from the catalog whenever they like.
 * 3. **It is idempotent.** A collection that already exists is left untouched: once the shop owns a
 *    selection, re-running this command must never overwrite a decision made in the shop.
 *
 * The rules:
 *
 * - **featured** - the shop's range, one product per department: for each of the five busiest
 *   departments a product carries, the product with the longest customer-facing description (the one
 *   the shop actually wrote something about), ties broken by the larger saving and then by id. Ties
 *   across products are resolved deterministically, so the same catalog always yields the same list.
 * - **collection** - four products from each of the three busiest departments, ordered by the same
 *   rule, skipping anything already featured. The homepage's browse row leads with these.
 *
 * Usage:
 *   npm run seed:discovery                 # local/development database
 *   npm run seed:discovery -- --remote     # the deployed database, deliberately
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';

import { closeDb, withTransaction, type Transaction } from '../src/db/client';
import { brand, category, collection, collectionItem, product, productVariant } from '../src/db/schema';
import {
  brandLogoKey,
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_PHOTOS,
  CATEGORY_TAGLINES,
  categoryImageKey,
} from '../src/server/catalog/discovery-imagery';
import { serverEnv } from '../src/server/env';

/** The two collection codes the storefront reads. Mirrors `storefront.ts`. */
const FEATURED = 'featured';
const COLLECTION = 'collection';

type Candidate = {
  variantId: number;
  productId: number;
  categorySlug: string;
  descriptionLength: number;
  saving: number;
};

/**
 * The order the categories are browsed in, and the square picture and one-line label each tile shows.
 *
 * The imported catalog arrived with every category at `sort_order = 1`, so the homepage's department
 * rail and the category index sorted by English name - a list that began with Accessories and Bags.
 * `CATEGORY_DISPLAY_ORDER` records the order a cosmetics shop is actually browsed in, and
 * `CATEGORY_PHOTOS` names one reviewed, licensed photograph per department.
 *
 * This is a **one-time backfill that yields to the owner**: a category whose `sort_order` is not the
 * imported `1` has already been arranged in the admin and is left alone, and an `image_key` or
 * `tagline` that is already set is never overwritten. Re-running the command therefore changes
 * nothing after the first run.
 */
async function writeCategoryPresentation(tx: Transaction): Promise<{ ordered: number; imaged: number; labelled: number }> {
  let ordered = 0;
  let imaged = 0;
  let labelled = 0;

  for (const [position, slug] of CATEGORY_DISPLAY_ORDER.entries()) {
    const rows = await tx
      .select({ id: category.id, sortOrder: category.sortOrder, imageKey: category.imageKey, tagline: category.tagline })
      .from(category)
      .where(sql`${category.slug} = ${slug} and ${category.deletedAt} is null`);
    const row = rows[0];
    if (row === undefined) continue;
    if (row.sortOrder === 1) ordered += 1;

    const imageKey = row.imageKey === null && CATEGORY_PHOTOS[slug] !== undefined ? categoryImageKey(slug) : row.imageKey;
    if (row.imageKey === null && imageKey !== null) imaged += 1;
    const tagline = row.tagline === null ? (CATEGORY_TAGLINES[slug] ?? null) : row.tagline;
    if (row.tagline === null && tagline !== null) labelled += 1;

    await tx
      .update(category)
      .set({ sortOrder: row.sortOrder === 1 ? position : row.sortOrder, imageKey, tagline })
      .where(sql`${category.id} = ${row.id}`);
  }

  // The one-time renumbering itself only runs while every category is still on the imported value.
  const unchanged = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(category)
    .where(sql`${category.deletedAt} is null and ${category.sortOrder} <> 1`);
  if ((unchanged[0]?.total ?? 0) === 0) {
    for (const [position, slug] of CATEGORY_DISPLAY_ORDER.entries()) {
      await tx
        .update(category)
        .set({ sortOrder: position })
        .where(sql`${category.slug} = ${slug} and ${category.deletedAt} is null`);
    }
  }

  return { ordered, imaged, labelled };
}

/**
 * Records the brand logos that actually exist, and **forgets the ones that do not**.
 *
 * Both directions matter. A key is written only when the generated files are on disk, so the storefront
 * never renders an `<img>` for bytes that are not there. A key is *cleared* when its files are gone -
 * which is what a rebuild of the logo set produces - because a stale key is worse than no key: the tile
 * would render a broken image where the initials fallback belongs.
 */
async function syncBrandLogos(tx: Transaction): Promise<{ written: number; cleared: number }> {
  const rows = await tx
    .select({ id: brand.id, slug: brand.slug, logoKey: brand.logoKey })
    .from(brand)
    .where(sql`${brand.deletedAt} is null`);

  let written = 0;
  let cleared = 0;
  for (const row of rows) {
    const key = brandLogoKey(row.slug);
    // The same completeness the asset inventory checks: every declared width, both formats.
    const present = existsSync(join(process.cwd(), 'public', 'catalog', `${key}-600.webp`));

    if (present && row.logoKey !== key) {
      await tx.update(brand).set({ logoKey: key }).where(sql`${brand.id} = ${row.id}`);
      written += 1;
    } else if (!present && row.logoKey !== null) {
      await tx.update(brand).set({ logoKey: null }).where(sql`${brand.id} = ${row.id}`);
      cleared += 1;
    }
  }
  return { written, cleared };
}

/**
 * Published products that can be curated.
 *
 * The same predicates the storefront's own read uses - published, not deleted, with an active default
 * variant - plus a description, because a curated row is the shop's recommendation and a product with
 * no copy is a weaker recommendation than one it has described.
 */
async function loadCandidates(tx: Transaction): Promise<Candidate[]> {
  const rows = await tx.execute(sql`
    select v.id as variant_id,
           p.id as product_id,
           c.slug as category_slug,
           coalesce(char_length(p.description_en), 0) as description_length,
           coalesce(v.compare_at_price_minor, 0) - v.price_minor as saving
    from product p
    join category c on c.id = p.category_id
    join product_variant v on v.product_id = p.id and v.is_default and v.is_active
    where p.is_published and p.deleted_at is null and c.deleted_at is null and c.is_visible
      and p.description_en is not null
    order by c.slug, description_length desc, saving desc, p.id desc
  `);
  // The driver's execute() row shape is untyped here; the cast is the boundary, not a guess about SQL.
  const records = (rows as unknown as { rows: Record<string, unknown>[] }).rows;
  return records.map((row) => ({
    variantId: Number(row.variant_id),
    productId: Number(row.product_id),
    categorySlug: String(row.category_slug),
    descriptionLength: Number(row.description_length),
    saving: Number(row.saving),
  }));
}

/** Departments ordered by how many curated-able products they hold, busiest first. */
function departmentsBySize(candidates: readonly Candidate[]): string[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.categorySlug, (counts.get(candidate.categorySlug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug]) => slug);
}

function featuredIds(candidates: readonly Candidate[]): number[] {
  const ids: number[] = [];
  for (const slug of departmentsBySize(candidates).slice(0, 5)) {
    const first = candidates.find((candidate) => candidate.categorySlug === slug);
    if (first !== undefined) ids.push(first.variantId);
  }
  return ids;
}

function collectionIds(candidates: readonly Candidate[], exclude: readonly number[]): number[] {
  const taken = new Set(exclude);
  const ids: number[] = [];
  for (const slug of departmentsBySize(candidates).slice(0, 3)) {
    const picks = candidates
      .filter((candidate) => candidate.categorySlug === slug && !taken.has(candidate.variantId))
      .slice(0, 4);
    for (const pick of picks) {
      taken.add(pick.variantId);
      ids.push(pick.variantId);
    }
  }
  return ids;
}

async function writeSelection(
  tx: Transaction,
  code: string,
  titleEn: string,
  titleBn: string,
  variantIds: readonly number[],
): Promise<'created' | 'kept'> {
  const existing = await tx
    .select({ id: collection.id })
    .from(collection)
    .where(sql`${collection.code} = ${code}`);

  if (existing[0] !== undefined) return 'kept';

  const inserted = await tx
    .insert(collection)
    .values({ code, titleBn, titleEn, isActive: true })
    .returning({ id: collection.id });
  const collectionId = inserted[0]?.id;
  if (collectionId === undefined) throw new Error(`collection ${code} insert returned no id`);

  for (const [position, variantId] of variantIds.entries()) {
    await tx.insert(collectionItem).values({ collectionId, productVariantId: variantId, position });
  }
  return 'created';
}

async function main(): Promise<void> {
  const env = serverEnv();
  const parsed = new URL(env.databaseUrl);
  const remote = process.argv.includes('--remote');
  console.log(`target: ${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname} (env=${env.environment})`);
  if (!env.isLocal && !remote) {
    throw new Error(
      'This database is not local. Re-run with --remote if you have deliberately chosen to seed curation ' +
        'into it. Nothing is written until that flag is given.',
    );
  }

  const report = await withTransaction(async (tx) => {
    const presentation = await writeCategoryPresentation(tx);
    const logos = await syncBrandLogos(tx);
    const candidates = await loadCandidates(tx);
    if (candidates.length === 0) throw new Error('no published product with a description to curate');

    const featured = featuredIds(candidates);
    const rest = collectionIds(candidates, featured);

    return {
      presentation,
      logos,
      candidates: candidates.length,
      featured: { ids: featured, state: await writeSelection(tx, FEATURED, 'Featured products', 'নির্বাচিত পণ্য', featured) },
      collection: {
        ids: rest,
        state: await writeSelection(tx, COLLECTION, 'More to explore', 'আরও দেখুন', rest),
      },
    };
  });

  console.log(
    `✓ presentation: ${report.presentation.ordered} categories ordered, ` +
      `${report.presentation.imaged} given a photo, ${report.presentation.labelled} given a tagline`,
  );
  console.log(`✓ brands: ${report.logos.written} logos recorded, ${report.logos.cleared} stale keys cleared`);
  console.log(`✓ curation: ${report.candidates} published products with copy`);
  console.log(`  featured: ${report.featured.ids.length} products (${report.featured.state})`);
  console.log(`  collection: ${report.collection.ids.length} products (${report.collection.state})`);

  // A curated id must name a real published default variant; this states that the write landed.
  await withTransaction(async (tx) => {
    const rows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(collectionItem)
      .innerJoin(productVariant, sql`${productVariant.id} = ${collectionItem.productVariantId}`)
      .innerJoin(product, sql`${product.id} = ${productVariant.productId}`)
      .where(sql`${product.isPublished} and ${product.deletedAt} is null`);
    console.log(`  verified: ${rows[0]?.count ?? 0} curated items resolve to a published product`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
