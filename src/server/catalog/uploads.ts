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
import { UPLOAD_MAX_BYTES } from '@/lib/upload-limits';
import { CATALOG_ASSET_DIR, type AssetDescriptor } from './assets';
import { HERO_ASSET_DIR } from './hero-assets';
import { putObject, storageConfig } from './object-storage';

/** One variant that was produced: the file name the renderer will ask for, and its bytes. */
type Variant = {
  readonly file: string;
  readonly bytes: Buffer;
  readonly contentType: string;
  /** The encoded pixels. The bytes are the authority on a variant's size, never the request. */
  readonly width: number;
  readonly height: number;
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
 * One re-encoded variant.
 *
 * A **product** variant is resized by width only, so the stored file keeps the owner's own shape: a
 * landscape upload stays landscape, and the product page can show it whole (owner direction,
 * 2026-11-12). The square and hero sets are still cropped to the frame their surface reserves -
 * `fit: 'cover'` is the crop the CSS already draws (`object-fit: cover`), and a circle tile or a
 * 16:9 banner has no room for a letterbox. `rotate()` applies the EXIF orientation before anything
 * else, so a phone photo taken sideways is stored upright.
 */
async function renderVariant(
  input: Buffer,
  width: number,
  height: number,
  crop: boolean,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const pipeline = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
  const resized = crop
    ? pipeline.resize(width, height, { fit: 'cover', position: 'centre' })
    : pipeline.resize({ width });
  const { data, info } = await resized.webp({ quality: 78, effort: 5 }).toBuffer({ resolveWithObject: true });
  // The encoded bytes are the authority on a variant's size, never the request or the frame.
  return { bytes: data, width: info.width, height: info.height };
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

  /*
   * A product keeps its own shape; a square or a hero frame is still filled.
   *
   * `crop` is one flag for the whole set, so a product's three variants cannot disagree with each
   * other, and the frame height is only consulted when something is actually being filled.
   */
  const crop = kind !== 'product';
  const widths: readonly number[] = kind === 'hero' ? HERO_IMAGE_WIDTHS : IMAGE_WIDTHS;

  const variants: Variant[] = [];
  for (const width of widths) {
    // A square fills width x width; a hero fills 16:9. A product crops to neither.
    const frameHeight = kind === 'hero' ? Math.round((width * 9) / 16) : width;
    const rendered = await renderVariant(input, width, frameHeight, crop);
    variants.push({
      file: `${key}-${width}.${FORMAT}`,
      bytes: rendered.bytes,
      contentType: 'image/webp',
      width: rendered.width,
      height: rendered.height,
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

  return {
    key,
    contentType: primary.contentType,
    /*
     * The stored pixels of the 600px file, taken from the encoder. For a product that is the
     * photograph's **own** shape - a landscape upload reports 600x400, not a 600x800 frame it was cut
     * into - and these are the numbers the product page reserves its box with.
     */
    width: primary.width,
    height: primary.height,
    byteSize: primary.bytes.byteLength,
    variants: variants.map((variant) => ({
      width: variant.width,
      format: 'webp' as const,
      storageKey: `/catalog/${variant.file}`,
      byteSize: variant.bytes.byteLength,
    })),
  };
}

/** The two frames an offer popup accepts. */
export type OfferPopupAspect = 'square' | 'wide';

/**
 * Stores an offer-popup image in the frame its own dimensions ask for.
 *
 * The owner does not choose square vs 16:9 in a control that can disagree with the file. The source
 * ratio is compared to the two approved frames and the closer one wins; `saveUpload` then crops and
 * encodes to that frame's generated set. A portrait file that is nearer 1:1 than 16:9 becomes a square;
 * a wide banner becomes the hero-sized set. The result records which set was written, so the storefront
 * derives the right path without guessing.
 */
export async function saveOfferPopupUpload(
  file: unknown,
): Promise<{ asset: UploadedAsset; aspect: OfferPopupAspect }> {
  if (!(file instanceof File) || file.size === 0) throw new Error('choose an image file');

  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  if (metadata.width === undefined || metadata.height === undefined || metadata.height === 0) {
    throw new Error('the image could not be read');
  }

  const ratio = metadata.width / metadata.height;
  const aspect: OfferPopupAspect =
    Math.abs(ratio - 1) <= Math.abs(ratio - 16 / 9) ? 'square' : 'wide';
  const asset = await saveUpload(file, aspect === 'square' ? 'square' : 'hero');
  return { asset, aspect };
}
