/**
 * Homepage hero carousel - the owner's images and their order (Phase 51).
 *
 * The carousel is a **short ordered list with two hard bounds**, so the rules live here rather than in
 * the storefront: at least one image, at most ten, a unique image, and a dense position sequence that
 * the owner controls. Every write re-checks `settings.write` at this boundary, takes a transaction
 * advisory lock before it counts, and records its audit row in the caller's transaction.
 *
 * The image itself is an **asset key**, validated against `public/hero` by `readHeroAsset`. Nothing
 * about the bytes comes from the request, and nothing is uploaded here: the asset pipeline owns files,
 * this module owns which of them the carousel shows and in what order.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { heroImage } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';
import { readHeroAsset } from '@/server/catalog/hero-assets';

/** The owner's rule: the hero can never be empty, and never holds more than ten. */
export const HERO_MIN_IMAGES = 1;
export const HERO_MAX_IMAGES = 10;

/** Matches the description input's `maxLength` and the database's own CHECK. */
export const HERO_ALT_MAX = 200;

const HERO_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * One transaction-scoped advisory lock for every hero mutation.
 *
 * A count-then-insert is a lost-update race if two requests arrive together, and PostgreSQL cannot
 * `FOR UPDATE` an aggregate. The lock makes "how many are there" and "write the next one" one
 * decision, so the 1..10 bound holds under concurrency rather than merely on a quiet afternoon.
 */
const HERO_LOCK_KEY = 815_245_671;

export type HeroImageRow = {
  readonly id: number;
  readonly imageKey: string;
  readonly altText: string;
  readonly sortOrder: number;
};

async function lockHeroImages(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${HERO_LOCK_KEY})`);
}

/** Ascending by the owner's position. The id is the deterministic tie-breaker. */
export async function listHeroImages(tx: Transaction): Promise<HeroImageRow[]> {
  return tx
    .select({
      id: heroImage.id,
      imageKey: heroImage.imageKey,
      altText: heroImage.altText,
      sortOrder: heroImage.sortOrder,
    })
    .from(heroImage)
    .orderBy(heroImage.sortOrder, heroImage.id);
}

function parseAltText(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('a hero image needs a description');
  const altText = value.trim();
  if (altText.length === 0) throw new ValidationError('a hero image needs a description');
  if (altText.length > HERO_ALT_MAX) {
    throw new ValidationError(`a hero image description must be ${HERO_ALT_MAX} characters or fewer`);
  }
  return altText;
}

function parseImageKey(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('choose a hero image');
  const key = value.trim();
  if (!HERO_KEY_PATTERN.test(key)) throw new ValidationError('that hero image key is not usable');
  return key;
}

function parseId(value: unknown): number {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new ValidationError('unknown hero image');
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new ValidationError('unknown hero image');
  return parsed;
}

/** Adds one image at the end of the sequence. Refuses the eleventh and any duplicate. */
export async function addHeroImage(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly key: unknown;
    readonly alt: unknown;
    /**
     * A descriptor produced by `saveUpload` in this same request. Absent for an association with an
     * image the asset pipeline already generated, in which case the key is resolved against
     * `public/hero`.
     */
    readonly asset?: { readonly key: string } | null;
  },
): Promise<number> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'hero_image', 1);
  await lockHeroImages(tx);

  const current = await listHeroImages(tx);
  if (current.length >= HERO_MAX_IMAGES) {
    throw new ValidationError(`the hero carousel holds at most ${HERO_MAX_IMAGES} images`);
  }

  const imageKey = parseImageKey(input.key);
  if (current.some((image) => image.imageKey === imageKey)) {
    throw new ConflictError('that image is already in the hero carousel');
  }

  // The key is resolved against the server's own generated inventory, then its metadata is read from
  // the bytes. An asset that is not there, or is not a complete 16:9 variant set, is refused.
  if (input.asset === undefined || input.asset === null) {
    const asset = await readHeroAsset(imageKey);
    if (asset === null) throw new ValidationError('that image is not in the hero library');
  } else if (input.asset.key !== imageKey) {
    throw new ValidationError('that image is not in the hero library');
  }

  const altText = parseAltText(input.alt);
  const inserted = await tx
    .insert(heroImage)
    .values({ imageKey, altText, sortOrder: current.length })
    .returning({ id: heroImage.id });
  const id = inserted[0]?.id;
  if (id === undefined) throw new Error('hero_image insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.hero_image_added',
    entityType: 'hero_image',
    entityId: id,
    after: { imageKey, altText, sortOrder: current.length },
  });
  return id;
}

/** Changes one image's description. The key and position are not editable here. */
export async function updateHeroImage(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly id: unknown; readonly alt: unknown },
): Promise<void> {
  const id = parseId(input.id);
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'hero_image', id);
  await lockHeroImages(tx);

  const rows = await listHeroImages(tx);
  const before = rows.find((image) => image.id === id);
  if (before === undefined) throw new ValidationError('unknown hero image');
  const altText = parseAltText(input.alt);
  if (altText === before.altText) return;

  await tx.update(heroImage).set({ altText, updatedAt: sql`now()` }).where(sql`${heroImage.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.hero_image_updated',
    entityType: 'hero_image',
    entityId: id,
    before: { imageKey: before.imageKey, altText: before.altText },
    after: { imageKey: before.imageKey, altText },
  });
}

/** Removes one image and closes the gap. The last image cannot be removed. */
export async function removeHeroImage(
  tx: Transaction,
  actor: ActorContext,
  rawId: unknown,
): Promise<void> {
  const id = parseId(rawId);
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'hero_image', id);
  await lockHeroImages(tx);

  const rows = await listHeroImages(tx);
  const before = rows.find((image) => image.id === id);
  if (before === undefined) throw new ValidationError('unknown hero image');
  if (rows.length <= HERO_MIN_IMAGES) {
    throw new ValidationError('the hero carousel must keep at least one image');
  }

  await tx.delete(heroImage).where(sql`${heroImage.id} = ${id}`);

  const remaining = rows.filter((image) => image.id !== id);
  for (const [index, image] of remaining.entries()) {
    if (image.sortOrder === index) continue;
    await tx
      .update(heroImage)
      .set({ sortOrder: index, updatedAt: sql`now()` })
      .where(sql`${heroImage.id} = ${image.id}`);
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.hero_image_removed',
    entityType: 'hero_image',
    entityId: id,
    before: { imageKey: before.imageKey, altText: before.altText, sortOrder: before.sortOrder },
  });
}

/**
 * Rewrites the whole sequence from the ids the owner arranged.
 *
 * The submitted set must match the stored set exactly - same images, no duplicates, no omissions - so
 * a stale page cannot silently drop or re-add one. The new positions are dense and written in one
 * transaction with the audit row.
 */
export async function reorderHeroImages(
  tx: Transaction,
  actor: ActorContext,
  rawIds: readonly unknown[],
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'hero_image', 0);
  await lockHeroImages(tx);

  const rows = await listHeroImages(tx);
  const ids = rawIds.map(parseId);
  if (new Set(ids).size !== ids.length || ids.length !== rows.length) {
    throw new ConflictError('the hero image list changed; reload and try again');
  }

  const byId = new Map(rows.map((image) => [image.id, image]));
  if (ids.some((id) => !byId.has(id))) {
    throw new ConflictError('the hero image list changed; reload and try again');
  }
  if (ids.length === 0) throw new ValidationError('the hero carousel must keep at least one image');

  const before = rows.map((image) => image.imageKey);
  const after = ids.map((id) => byId.get(id)?.imageKey ?? '');
  if (before.join(',') === after.join(',')) return;

  for (const [index, id] of ids.entries()) {
    await tx
      .update(heroImage)
      .set({ sortOrder: index, updatedAt: sql`now()` })
      .where(sql`${heroImage.id} = ${id}`);
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.hero_images_reordered',
    entityType: 'hero_image',
    entityId: 0,
    before: { order: before },
    after: { order: after },
  });
}
