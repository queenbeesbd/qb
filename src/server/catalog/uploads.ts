/**
 * Browser uploads for catalog imagery.
 *
 * The admin surface used to be association-only: an image had to exist in `public/catalog` (or
 * `public/hero`) before the owner could point a record at it, because no request handler was allowed
 * to process files. That made an ordinary task - putting a photograph of a product on the owner's own
 * site - impossible without a developer and a command line. This module is the request-side half of
 * the pipeline, and it is deliberately the only place an uploaded file is touched.
 *
 * ## What a request may and may not decide
 *
 * A browser supplies **bytes and nothing else**. The key, the dimensions, the content type and the
 * byte size are all produced here, from the decoded image; the client never names a path, a URL or an
 * asset. Decoding is strict (`sharp`, with a pixel ceiling) and every output is re-encoded, which
 * strips EXIF (including location) and refuses a file whose bytes are not an image the library can
 * read.
 *
 * ## Where the bytes go
 *
 * Both destinations are attempted, and at least one must succeed:
 *
 * 1. **`public/catalog` (or `public/hero`) when the filesystem is writable.** Development and the
 *    verification suites work with no storage credential, exactly as the asset pipeline does.
 *    Next serves `public/` before a route handler, so the new key renders immediately.
 * 2. **Object storage** when `CATALOG_STORAGE_*` is configured (`putObject`, SigV4, no SDK). A
 *    deployment's filesystem is read-only, so this is the path that makes an upload survive: the
 *    files land in the same bucket the read route already redirects to.
 *
 * A file is written under one key and served as `<key>-<width>.<ext>`, so a key names immutable bytes
 * and can be cached forever. A replaced photograph is a new key, never the same name overwritten.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { HERO_IMAGE_WIDTHS, IMAGE_FALLBACK_WIDTH, IMAGE_WIDTHS } from '@/lib/images';
import { CATALOG_ASSET_DIR, type AssetDescriptor } from './assets';
import { HERO_ASSET_DIR } from './hero-assets';
import { putObject, storageConfig } from './object-storage';

/** The largest accepted upload. Vercel's own request body ceiling is 4.5 MB. */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** One variant that was produced: the file name the renderer will ask for, and its bytes. */
type Variant = {
  readonly file: string;
  readonly bytes: Buffer;
  readonly contentType: string;
};

/** The descriptor an upload is recorded as, built exactly like a generated asset's. */
export type UploadedAsset = AssetDescriptor;

/** The three image contracts the shop renders. */
export type UploadKind = 'product' | 'square' | 'hero';

/**
 * Every stored variant is WebP (owner direction, 2026-11-05): one encode, smaller bytes, and every
 * browser the shop supports decodes it. There is no second format to generate or negotiate.
 */
const FORMAT = 'webp' as const;

/** `product-upload-lq3k2a-9f1c2e`. Lowercase, hyphen-separated, so every key rule accepts it. */
function newKey(kind: UploadKind): string {
  const prefix = kind === 'square' ? 'photo' : kind;
  return `${prefix}-upload-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

/**
 * One re-encoded variant, cropped to the frame the storefront reserves.
 *
 * `fit: 'cover'` is the crop the CSS already draws (`object-fit: cover`): the owner's photograph
 * fills the frame instead of leaving a letterbox inside it. `rotate()` applies the EXIF orientation
 * before anything else, so a phone photo taken sideways is stored upright.
 */
async function renderVariant(input: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 78, effort: 5 })
    .toBuffer();
}

/** Writes the local copies, or reports that this filesystem cannot hold them. */
async function writeLocal(dir: string, variants: readonly Variant[]): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true });
    await Promise.all(
      variants.map((variant) => writeFile(join(dir, variant.file), variant.bytes)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Processes one uploaded file into the complete variant set for its surface.
 *
 * Throws a plain `Error` for anything the caller should turn into a validation notice: no file, an
 * oversized file, or bytes that are not a decodable image. It never throws a storage error disguised
 * as one - a key exists only after its bytes are readable from at least one destination.
 */
export async function saveUpload(file: unknown, kind: UploadKind): Promise<UploadedAsset> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('choose an image file');
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error('the image is larger than 4 MB');
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (input.length === 0) throw new Error('the image is empty');

  const key = newKey(kind);

  const sizes: readonly { width: number; height: number }[] =
    kind === 'product'
      ? IMAGE_WIDTHS.map((width) => ({ width, height: Math.round((width * 4) / 3) }))
      : kind === 'hero'
        ? HERO_IMAGE_WIDTHS.map((width) => ({ width, height: Math.round((width * 9) / 16) }))
        : IMAGE_WIDTHS.map((width) => ({ width, height: width }));

  const variants: Variant[] = [];
  for (const size of sizes) {
    const bytes = await renderVariant(input, size.width, size.height);
    variants.push({
      file: `${key}-${size.width}.${FORMAT}`,
      bytes,
      contentType: 'image/webp',
    });
  }

  const dir = kind === 'hero' ? HERO_ASSET_DIR : CATALOG_ASSET_DIR;
  const local = await writeLocal(dir, variants);

  let stored = false;
  const config = storageConfig();
  if (config !== null) {
    await Promise.all(
      variants.map((variant) => putObject(config, variant.file, variant.bytes, variant.contentType)),
    );
    stored = true;
  }

  if (!local && !stored) {
    throw new Error(
      'the image could not be stored in this environment: the filesystem is read-only and object storage is not configured',
    );
  }

  // The primary variant is the 600px frame for products and squares (the card's own size), and a
  // hero's primary is its widest frame. Both are WebP.
  const primaryWidth =
    kind === 'hero' ? HERO_IMAGE_WIDTHS[HERO_IMAGE_WIDTHS.length - 1] : IMAGE_FALLBACK_WIDTH;
  const primary = variants.find((variant) => variant.file === `${key}-${primaryWidth}.${FORMAT}`);
  if (primary === undefined) throw new Error('the image could not be encoded');

  const primarySize = sizes.find((size) => size.width === primaryWidth);
  if (primarySize === undefined) throw new Error('the image frame is not declared');

  return {
    key,
    contentType: primary.contentType,
    width: primarySize.width,
    height: primarySize.height,
    byteSize: primary.bytes.byteLength,
    variants: variants.map((variant) => ({
      width: Number(/(\d+)\.webp$/.exec(variant.file)?.[1] ?? '0'),
      format: 'webp' as const,
      storageKey: `/catalog/${variant.file}`,
      byteSize: variant.bytes.byteLength,
    })),
  };
}
