/**
 * Payment screenshots: the only module that touches a customer's uploaded proof of payment (ADR 0042).
 *
 * Three rules make this different from `../catalog/uploads.ts`, and none of them is cosmetic.
 *
 * 1. **The bytes are private.** A bKash/Nagad screenshot carries a transaction id, a phone number and
 *    often the sender's name. It must never land under `public/` and must never be served by
 *    `/catalog/[...path]`, which is a public, CDN-cached asset surface. It goes to
 *    `payment-proof/...` - a prefix that route cannot address, because it accepts one segment of the
 *    shape `<key>-<width>.<ext>` only - and is read back through a permission-gated route with
 *    `no-store`.
 * 2. **One variant, at a legible size.** A screenshot is read, not curated: a single WebP at a 1600px
 *    long edge keeps a transaction id readable while staying far inside the request cap. There is no
 *    gallery, no crop and no public path derived from the key.
 * 3. **The bytes decide.** Like every upload here, the content type, the dimensions and the byte size
 *    are produced from the decoded image (`sharp`), never taken from the request, and EXIF is dropped
 *    by the re-encode.
 *
 * Object storage is used when it is configured (`CATALOG_STORAGE_*`); otherwise the local
 * `.data/payment-proof` directory is, which is what development and the verification suites do. At
 * least one must succeed or nothing is recorded about the file.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { UPLOAD_MAX_BYTES } from '@/lib/upload-limits';
import { putObject, storageConfig } from '../catalog/object-storage';
import { catalogAssetBase } from '../catalog/storage';

/** The private prefix. Kept in one place because the schema check mirrors its shape. */
export const PROOF_PREFIX = 'payment-proof';

/** Local fallback root, deliberately outside `public/`. */
const LOCAL_DIR = join(process.cwd(), '.data', PROOF_PREFIX);

/** The decoded and re-encoded result, exactly what the row records. */
export type ProofAsset = {
  readonly storageKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
};

/** `payment-proof/proof-lq3k2a-9f1c2e.webp`. Lowercase and hyphen-separated, as the row check requires. */
function newStorageKey(): string {
  const name = `proof-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  return `${PROOF_PREFIX}/${name}.webp`;
}

/** The bare file name inside the prefix, for the local directory. */
function localName(storageKey: string): string {
  return storageKey.slice(PROOF_PREFIX.length + 1);
}

/**
 * Decodes one uploaded file and stores it privately.
 *
 * Throws a plain `Error` for anything the caller turns into a notice: no file, an oversized file, or
 * bytes that are not a decodable image. A storage failure is not disguised as a validation failure -
 * the key is returned only after the bytes are readable from at least one destination.
 */
export async function saveProof(file: unknown): Promise<ProofAsset> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('choose an image file');
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new Error('the image is larger than 4 MB');
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (input.length === 0) throw new Error('the image is empty');

  // `rotate()` applies the EXIF orientation before it is dropped; the ceiling refuses a decompression
  // bomb rather than letting the process try to allocate it.
  const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const storageKey = newStorageKey();

  let local = false;
  try {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(join(LOCAL_DIR, localName(storageKey)), data);
    local = true;
  } catch {
    local = false;
  }

  let remote = false;
  const config = storageConfig();
  if (config !== null) {
    await putObject(config, storageKey, data, 'image/webp');
    remote = true;
  }

  if (!local && !remote) {
    throw new Error(
      'the screenshot could not be stored in this environment: the filesystem is read-only and object storage is not configured',
    );
  }

  return {
    storageKey,
    contentType: 'image/webp',
    byteSize: data.length,
    width: info.width,
    height: info.height,
  };
}

/**
 * Reads one stored screenshot back, or `null` when it is not there.
 *
 * The local copy is consulted first, then object storage. A missing object is `null`, which the route
 * answers as a 404 - a row whose bytes vanished states the gap rather than drawing a broken image.
 */
export async function readProof(storageKey: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!storageKey.startsWith(`${PROOF_PREFIX}/`)) return null;

  try {
    const bytes = await readFile(join(LOCAL_DIR, localName(storageKey)));
    return { bytes, contentType: 'image/webp' };
  } catch {
    // Not on this filesystem; try the bucket below.
  }

  const base = catalogAssetBase();
  if (base === null) return null;

  try {
    const response = await fetch(`${base}/${storageKey}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) return null;
    return { bytes, contentType: response.headers.get('content-type') ?? 'image/webp' };
  } catch {
    return null;
  }
}

/** True when this environment can store a screenshot today. Used only to explain a gap, never to guess. */
export function proofStorageAvailable(): boolean {
  return storageConfig() !== null;
}
