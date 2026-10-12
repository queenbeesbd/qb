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

import { IMAGE_WIDTHS } from '@/lib/images';

import { readImageMetadata, type ImageFormat } from './image-metadata';

/** Where the storefront's images live. `public/catalog` is served at `/catalog`. */
export const CATALOG_ASSET_DIR = join(process.cwd(), 'public', 'catalog');

/** Public path prefix, matching `src/lib/images.ts`. */
const PUBLIC_PREFIX = '/catalog';

/** Extension per format. The schema's `IMAGE_FORMAT` uses `jpeg`; the files use `jpg`. */
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
 * Keys with a complete generated variant set.
 *
 * "Complete" means every declared width exists in both formats - the same invariant
 * `npm run check:catalog` asserts for the demo catalog, applied here to the directory itself. A
 * half-generated key is therefore not selectable, which is what keeps a broken `srcset` out of the
 * database.
 *
 * Placeholder SVGs are deliberately **not** selectable: they are a single `.svg` with no generated
 * variants, and this module does not parse SVG dimensions. That is a documented gap, not an oversight -
 * see `docs/catalog.md`.
 */
export async function listAssetKeys(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(CATALOG_ASSET_DIR);
  } catch {
    // A missing directory is an empty inventory, not a crash: the admin screen then shows its empty
    // state rather than a 500.
    return [];
  }

  const present = new Set(entries);
  const keys = new Set<string>();

  for (const entry of entries) {
    const match = /^(.+)-(\d+)\.(jpg|webp)$/.exec(entry);
    if (match === null) continue;
    const key = match[1] ?? '';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) continue;

    const complete = IMAGE_WIDTHS.every((width) =>
      (['jpg', 'webp'] as const).every((extension) => present.has(`${key}-${width}.${extension}`)),
    );
    if (complete) keys.add(key);
  }

  return [...keys].sort();
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

  const variants: AssetVariant[] = [];
  let primary: { contentType: string; width: number; height: number; byteSize: number } | null = null;

  for (const width of IMAGE_WIDTHS) {
    for (const format of ['jpeg', 'webp'] as const) {
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

      // The widest JPEG is the base image: it is the fallback every browser can decode, and
      // `imageSources` derives the same path from the key.
      if (format === 'jpeg' && width === IMAGE_WIDTHS[0]) {
        primary = {
          contentType: metadata.contentType,
          width: metadata.width,
          height: metadata.height,
          byteSize: metadata.byteSize,
        };
      }
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

/** Whether the asset directory exists and holds at least one selectable asset. */
export async function assetDirectoryExists(): Promise<boolean> {
  try {
    const info = await stat(CATALOG_ASSET_DIR);
    return info.isDirectory();
  } catch {
    return false;
  }
}
