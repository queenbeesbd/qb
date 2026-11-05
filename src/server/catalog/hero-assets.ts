/**
 * The homepage hero image inventory.
 *
 * The carousel does **not** accept an uploaded file or a client-supplied path. A hero banner has to
 * exist as a generated, validated asset first - `npm run assets:hero` writes both widths in both
 * formats under `public/hero` - and the admin screen associates one of those keys with the carousel.
 * That is the same association-only rule product imagery follows, and it keeps this request handler
 * out of the image-processing business.
 *
 * Two checks stand between a request and the filesystem, exactly as `assets.ts` does for products:
 *
 * 1. the key must match the database's own format, so a traversal, absolute path or URL cannot even
 *    be expressed;
 * 2. the key must be in the directory's **complete variant set**, derived by scanning the directory
 *    rather than supplied by the caller.
 *
 * Metadata is read from the bytes, never the extension, and the declared dimensions have to match the
 * generated banner frame. `src/lib/images.ts` derives the same paths the storefront renders, so a
 * recorded key cannot drift from its files.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { withTransaction } from '@/db/client';
import { heroImage } from '@/db/schema';
import { HERO_IMAGE_WIDTHS } from '@/lib/images';

import { readImageMetadata, type ImageFormat } from './image-metadata';

export const HERO_ASSET_DIR = join(process.cwd(), 'public', 'hero');

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXTENSIONS: Record<ImageFormat, string> = { jpeg: 'jpg', webp: 'webp' };

export type HeroAssetDescriptor = {
  readonly key: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
};

type Inventory = { readonly signature: number; readonly keys: readonly string[] };
let inventory: Inventory | null = null;

async function directorySignature(): Promise<number | null> {
  try {
    const info = await stat(HERO_ASSET_DIR);
    return info.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Keys with a complete generated variant set: every declared width as WebP (2026-11-05), with the
 * banner's 16:9 dimensions. A half-generated key is not selectable, which is what keeps a broken `srcset` out
 * of the database.
 */
export async function listHeroAssetKeys(): Promise<string[]> {
  const local = await listLocalHeroKeys();
  const recorded = await listRecordedHeroKeys();
  if (recorded.length === 0) return local;
  return [...new Set([...local, ...recorded])].sort();
}

/**
 * Keys already recorded in `hero_image`.
 *
 * A deployment does not carry `public/hero`: an uploaded banner's bytes live in object storage, so the
 * only record of the key is its own row. Without this, the owner could add a banner and then not see
 * it in the library it came from.
 */
async function listRecordedHeroKeys(): Promise<string[]> {
  try {
    const rows = await withTransaction((tx) =>
      tx.selectDistinct({ key: heroImage.imageKey }).from(heroImage),
    );
    return rows.map((row) => row.key);
  } catch {
    return [];
  }
}

async function listLocalHeroKeys(): Promise<string[]> {
  const signature = await directorySignature();
  if (signature === null) {
    inventory = null;
    return [];
  }
  if (inventory !== null && inventory.signature === signature) return [...inventory.keys];

  let entries: string[];
  try {
    entries = await readdir(HERO_ASSET_DIR);
  } catch {
    return [];
  }

  const present = new Set(entries);
  const keys = new Set<string>();
  for (const entry of entries) {
    const match = /^(.+)-(\d+)\.(jpg|webp)$/.exec(entry);
    if (match === null) continue;
    const key = match[1] ?? '';
    if (!KEY_PATTERN.test(key)) continue;

    const complete = HERO_IMAGE_WIDTHS.every((width) => present.has(`${key}-${width}.webp`));
    if (complete) keys.add(key);
  }

  const sorted = [...keys].sort();
  inventory = { signature, keys: sorted };
  return [...sorted];
}

/** True when the key is in the enumerated inventory derived from the directory. */
export async function isKnownHeroAsset(key: string): Promise<boolean> {
  if (!KEY_PATTERN.test(key)) return false;
  return (await listHeroAssetKeys()).includes(key);
}

/**
 * Reads one hero asset and derives its metadata from every generated file.
 *
 * Returns `null` for an unknown key, a missing variant, unreadable bytes, a format that disagrees with
 * the extension, or dimensions that are not the banner frame. The caller then refuses the association
 * rather than recording guessed facts.
 */
export async function readHeroAsset(key: string): Promise<HeroAssetDescriptor | null> {
  if (!(await isKnownHeroAsset(key))) return null;

  let primary: { contentType: string; width: number; height: number; byteSize: number } | null = null;

  for (const width of HERO_IMAGE_WIDTHS) {
    const expectedHeight = Math.round((width * 9) / 16);
    const format = 'webp' as const;
    let bytes: Buffer;
    try {
      bytes = await readFile(join(HERO_ASSET_DIR, `${key}-${width}.${EXTENSIONS[format]}`));
    } catch {
      return null;
    }

    const metadata = readImageMetadata(bytes);
    if (metadata === null || metadata.format !== format) return null;
    if (metadata.width !== width || metadata.height !== expectedHeight) return null;

    if (width === HERO_IMAGE_WIDTHS[HERO_IMAGE_WIDTHS.length - 1]) {
      primary = {
        contentType: metadata.contentType,
        width: metadata.width,
        height: metadata.height,
        byteSize: metadata.byteSize,
      };
    }
  }

  if (primary === null) return null;
  return { key, ...primary };
}
