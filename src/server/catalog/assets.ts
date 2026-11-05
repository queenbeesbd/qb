/**
 * The local catalog asset inventory.
 *
 * Phase 13 associates a product with imagery that **already exists in the repository**. No upload, no
 * object storage, no provider, and - critically - no client-supplied path.
 *
 * Two independent checks stand between a request and the filesystem:
 *
 * 1. **Format.** A key must match `^[a-z0-9]+(-[a-z0-9]+)*$` (`parseImageKey`). A path separator, a
 *    `..`, an absolute path, a URL or a percent-encoded traversal therefore cannot even be expressed.
 * 2. **Allowlist.** This module lists the directory itself and accepts only keys that have a complete
 *    generated variant set on disk. A syntactically valid key that names no real asset is refused.
 *
 * Because the key is validated *before* it is joined to a path, and the allowlist is derived from the
 * directory rather than supplied by the caller, there is no path-traversal or SSRF surface here: no
 * caller-controlled string ever reaches a path that is not in the enumerated set. The generated paths
 * are also exactly the ones `src/lib/images.ts` builds, so a recorded asset cannot drift from the
 * storefront's expectations.
 *
 * Metadata is read from the file bytes (`image-metadata.ts`), never from the request and never from the
 * extension: a file named `.jpg` whose bytes are WebP is recorded as WebP.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { brand, category, productImage } from '@/db/schema';
import { IMAGE_FALLBACK_WIDTH, IMAGE_WIDTHS } from '@/lib/images';

import { readImageMetadata, type ImageFormat } from './image-metadata';

/** Where the storefront's images live. `public/catalog` is served at `/catalog`. */
export const CATALOG_ASSET_DIR = join(process.cwd(), 'public', 'catalog');

/** Public path prefix, matching `src/lib/images.ts`. */
const PUBLIC_PREFIX = '/catalog';

/** Extension per format. Every generated variant is WebP (2026-11-05); JPEG stays readable for legacy rows. */
const EXTENSIONS: Record<ImageFormat, string> = { jpeg: 'jpg', webp: 'webp' };

/** One generated variant of an asset. */
export type AssetVariant = {
  readonly width: number;
  readonly format: ImageFormat;
  /** `/catalog/<key>-<width>.<ext>` - the same path the storefront renders. */
  readonly storageKey: string;
  readonly byteSize: number;
};

/** Everything derived from the real files for one asset. */
export type AssetDescriptor = {
  readonly key: string;
  /** Content type and dimensions of the primary variant, read from its bytes. */
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly variants: readonly AssetVariant[];
};

/**
 * The last completed directory scan, keyed by the directory's own modification time.
 *
 * `readdir` over `public/catalog` reads ~15.5 thousand entries, and the admin media panel asked for it
 * on every render while `readAsset` asked again before reading eight variant files - so opening one
 * product editor scanned the whole tree several times. The directory's mtime changes when an entry is
 * added or removed, which is exactly when the allowlist can change; the scan is therefore reused until
 * then. Nothing here is a durable cache: it lives in the process and disappears with it.
 *
 * The array is copied on the way out so a caller cannot edit the cached inventory.
 */
type Inventory = { readonly signature: number; readonly keys: readonly string[] };
let inventory: Inventory | null = null;

/** The directory's modification time, or `null` when the directory does not exist. */
async function directorySignature(): Promise<number | null> {
  try {
    const info = await stat(CATALOG_ASSET_DIR);
    return info.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Keys with a complete generated variant set.
 *
 * "Complete" means every declared width exists as WebP - the same invariant `npm run check:catalog`
 * asserts for the demo catalog, applied here to the directory itself. A half-generated key is
 * therefore not selectable, which is what keeps a broken `srcset` out of the database.
 *
 * Placeholder SVGs are deliberately **not** selectable: they are a single `.svg` with no generated
 * variants, and this module does not parse SVG dimensions. That is a documented gap, not an oversight -
 * see `docs/catalog.md`.
 */
export async function listAssetKeys(): Promise<string[]> {
  const local = await listLocalAssetKeys();
  const recorded = await listRecordedAssetKeys();
  if (recorded.length === 0) return local;

  // The union, not a replacement: the local tree is the whole inventory in development, and it also
  // holds assets created after the recorded set was last written.
  const merged = new Set([...local, ...recorded]);
  return [...merged].sort();
}

/**
 * Keys already recorded in `product_image`, so the picker keeps working where the tree is absent.
 *
 * A deployment does not carry the 640 MB photo tree: the bytes live in object storage (ADR 0006) and
 * are delivered through `/catalog/<key>-<width>.<ext>`. Without this, opening a product editor in a
 * deployment would show an empty inventory and no stored image could be re-attached or re-ordered.
 *
 * This is a **recorded** set, never a guess: a key is here because a row names it, which means its
 * metadata was already read from the bytes when it was attached.
 */
async function listRecordedAssetKeys(): Promise<string[]> {
  try {
    const keys = await withTransaction(async (tx) => {
      const [images, categories, brands] = await Promise.all([
        tx
          .selectDistinct({ key: productImage.baseKey })
          .from(productImage)
          .where(sql`${productImage.deletedAt} is null`),
        tx
          .selectDistinct({ key: category.imageKey })
          .from(category)
          .where(sql`${category.imageKey} is not null`),
        tx
          .selectDistinct({ key: brand.logoKey })
          .from(brand)
          .where(sql`${brand.logoKey} is not null`),
      ]);
      return [
        ...images.map((row) => row.key),
        ...categories.map((row) => row.key),
        ...brands.map((row) => row.key),
      ].filter((key): key is string => typeof key === 'string' && key !== '');
    });
    return keys;
  } catch {
    // A database that cannot be read here is an absent recorded set, not a failed admin screen: the
    // local inventory still returns what it has.
    return [];
  }
}

async function listLocalAssetKeys(): Promise<string[]> {
  const signature = await directorySignature();
  if (signature === null) {
    // A missing directory is an empty inventory, not a crash: the admin screen then shows its empty
    // state rather than a 500. A cached scan from a tree that has since gone is dropped.
    inventory = null;
    return [];
  }
  if (inventory !== null && inventory.signature === signature) return [...inventory.keys];

  let entries: string[];
  try {
    entries = await readdir(CATALOG_ASSET_DIR);
  } catch {
    return [];
  }

  const present = new Set(entries);
  const keys = new Set<string>();

  for (const entry of entries) {
    const match = /^(.+)-(\d+)\.(jpg|webp)$/.exec(entry);
    if (match === null) continue;
    const key = match[1] ?? '';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) continue;

    const complete = IMAGE_WIDTHS.every((width) => present.has(`${key}-${width}.webp`));
    if (complete) keys.add(key);
  }

  const sorted = [...keys].sort();
  inventory = { signature, keys: sorted };
  return [...sorted];
}

/** True when the key is in the enumerated inventory. */
export async function isKnownAsset(key: string): Promise<boolean> {
  return (await listAssetKeys()).includes(key);
}

/**
 * Reads one asset from disk and derives its metadata from the bytes.
 *
 * Returns `null` for a key that is not in the inventory, for a variant whose bytes are not a supported
 * image, or for a variant whose declared extension disagrees with its content. In every case the
 * caller refuses the association rather than recording guessed metadata.
 */
export async function readAsset(key: string): Promise<AssetDescriptor | null> {
  if (!(await isKnownAsset(key))) return null;

  const fromDisk = await readAssetFromDisk(key);
  if (fromDisk !== null) return fromDisk;

  // A deployment has no photo tree, so a key that is already recorded is described by its own row:
  // the metadata was read from the bytes when the image was attached, and re-attaching or re-ordering
  // it must not require the file to be present again.
  return readAssetFromRecord(key);
}

async function readAssetFromDisk(key: string): Promise<AssetDescriptor | null> {
  const variants: AssetVariant[] = [];
  let primary: { contentType: string; width: number; height: number; byteSize: number } | null = null;

  for (const width of IMAGE_WIDTHS) {
    const format = 'webp' as const;
    const file = join(CATALOG_ASSET_DIR, `${key}-${width}.${EXTENSIONS[format]}`);
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch {
      return null;
    }

    const metadata = readImageMetadata(bytes);
    // The bytes must agree with the name. A `-600.webp` file containing JPEG data is a corrupted
    // asset, and recording it as WebP would put a wrong content type in the database.
    if (metadata === null || metadata.format !== format) return null;
    if (metadata.width !== width) return null;

    variants.push({
      width,
      format,
      storageKey: `${PUBLIC_PREFIX}/${key}-${width}.${EXTENSIONS[format]}`,
      byteSize: metadata.byteSize,
    });

    // The 600px frame is the base image: it is what a card shows and what `imageSources` derives as
    // the un-srcset fallback.
    if (width === IMAGE_FALLBACK_WIDTH) {
      primary = {
        contentType: metadata.contentType,
        width: metadata.width,
        height: metadata.height,
        byteSize: metadata.byteSize,
      };
    }
  }

  if (primary === null) return null;

  return {
    key,
    contentType: primary.contentType,
    width: primary.width,
    height: primary.height,
    byteSize: primary.byteSize,
    variants,
  };
}

/** One asset as its own database row records it. Used where the local tree is not deployed. */
async function readAssetFromRecord(key: string): Promise<AssetDescriptor | null> {
  try {
    const rows = await withTransaction((tx) =>
      tx
        .select({
          contentType: productImage.contentType,
          width: productImage.width,
          height: productImage.height,
          byteSize: productImage.byteSize,
        })
        .from(productImage)
        .where(sql`${productImage.baseKey} = ${key} and ${productImage.deletedAt} is null`)
        .limit(1),
    );
    const row = rows[0];
    if (row === undefined) return null;

    return {
      key,
      contentType: row.contentType,
      width: row.width,
      height: row.height,
      byteSize: row.byteSize,
      // No variant rows are fabricated here. The row records the base variant's metadata only, and
      // this path is reached only for an image that is **already** recorded - re-attaching it updates
      // that row and writes no derivative, so an invented per-variant byte size would be a claim this
      // module cannot support.
      variants: [],
    };
  } catch {
    return null;
  }
}

/** Whether the asset directory exists and holds at least one selectable asset. */
export async function assetDirectoryExists(): Promise<boolean> {
  try {
    const info = await stat(CATALOG_ASSET_DIR);
    return info.isDirectory();
  } catch {
    return false;
  }
}
