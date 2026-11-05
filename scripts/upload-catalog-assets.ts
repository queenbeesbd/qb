#!/usr/bin/env tsx
/**
 * Upload the imported product photography to object storage.
 *
 * `public/catalog` holds ~640 MB of imported product images. They are deliberately excluded from a
 * Vercel deployment (`.vercelignore`), so the bytes live in the catalog bucket and
 * `/catalog/<key>-<width>.<ext>` redirects to them (ADR 0006). `npm run assets:upload` covers the
 * discovery families; this command covers the product tree, which is the part a deployment cannot
 * carry.
 *
 * The command is idempotent by omission: a key names immutable bytes, so an object that is already in
 * the bucket is skipped unless `--force` is passed. That makes a re-run cheap after an interruption.
 *
 * Usage:
 *   npm run assets:upload:catalog                 # upload what is missing
 *   npm run assets:upload:catalog -- --force      # re-upload every product variant
 *   npm run assets:upload:catalog -- --only-webp  # only the WebP variants
 *
 * `--only-webp` exists because every rendered image is WebP now (2026-11-05): after re-encoding the
 * tree, the JPEGs are dead bytes and re-uploading them would move hundreds of megabytes for nothing.
 *
 * Requires `CATALOG_STORAGE_ENDPOINT`, `CATALOG_STORAGE_BUCKET`, `CATALOG_STORAGE_ACCESS_KEY` and
 * `CATALOG_STORAGE_SECRET_KEY`. No credential is printed.
 */

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { putObject, storageConfig } from '../src/server/catalog/object-storage';

const DIR = join(process.cwd(), 'public', 'catalog');
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', webp: 'image/webp' };

/** Enough in flight to finish a 7,600-file tree, few enough to stay polite. */
const CONCURRENCY = 16;

async function exists(endpoint: string, bucket: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/${bucket}/${key}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const config = storageConfig();
  if (config === null) {
    throw new Error(
      'object storage is not configured: set CATALOG_STORAGE_ENDPOINT, CATALOG_STORAGE_BUCKET, ' +
        'CATALOG_STORAGE_ACCESS_KEY and CATALOG_STORAGE_SECRET_KEY for this environment.',
    );
  }

  const force = process.argv.includes('--force');
  const onlyWebp = process.argv.includes('--only-webp');
  const files = (await readdir(DIR))
    .filter((name) => /^zq-.+\.(jpg|webp)$/.test(name))
    .filter((name) => !onlyWebp || name.endsWith('.webp'))
    .sort();
  if (files.length === 0) throw new Error('no imported product images found under public/catalog');

  console.log(
    `target: ${new URL(config.endpoint).hostname} bucket=${config.bucket} ` +
      `(${files.length} files, ${force ? 're-uploading all' : 'skipping existing'})`,
  );

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= files.length) return;
      const name = files[index];
      if (name === undefined) return;
      const extension = name.slice(name.lastIndexOf('.') + 1);
      const contentType = CONTENT_TYPES[extension];
      if (contentType === undefined) continue;

      try {
        if (!force && (await exists(config!.endpoint, config!.bucket, name))) {
          skipped += 1;
          continue;
        }
        await putObject(config!, name, readFileSync(join(DIR, name)), contentType);
        uploaded += 1;
        if (uploaded % 250 === 0) console.log(`  … ${uploaded} uploaded`);
      } catch (error) {
        failed += 1;
        console.error(`  ✗ ${name}: ${(error as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`✓ ${uploaded} uploaded, ${skipped} already present, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
