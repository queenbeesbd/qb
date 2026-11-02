#!/usr/bin/env tsx
/**
 * Upload the discovery images to object storage.
 *
 * `CATALOG_ASSET_BASE_URL` already redirects `/catalog/<key>-<width>.<ext>` to the bucket for a
 * deployment that does not carry the photo tree, so a category photograph or brand logo the owner can
 * see in development only exists for customers once its bytes are in the bucket too. This is that step,
 * and it is deliberately the **only** part of the imagery pipeline that needs storage credentials: the
 * builder (`npm run assets:discovery`) writes local files with no credentials at all.
 *
 * It uploads only the discovery families (`category-*`, `brand-logo-*`), never the 640 MB product tree:
 * re-uploading the catalogue from a developer machine is not something this command should be able to
 * do by accident.
 *
 * Usage:
 *   npm run assets:upload              # upload what is missing
 *   npm run assets:upload -- --force   # re-upload everything in the two families
 *
 * Requires `CATALOG_STORAGE_ENDPOINT`, `CATALOG_STORAGE_BUCKET`, `CATALOG_STORAGE_ACCESS_KEY` and
 * `CATALOG_STORAGE_SECRET_KEY`. Nothing here prints a credential.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { putObject, storageConfig } from '../src/server/catalog/object-storage';

const DIR = join(process.cwd(), 'public', 'catalog');
const PREFIXES = ['category-', 'brand-logo-'];
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', webp: 'image/webp' };

async function main(): Promise<void> {
  const config = storageConfig();
  if (config === null) {
    throw new Error(
      'object storage is not configured: set CATALOG_STORAGE_ENDPOINT, CATALOG_STORAGE_BUCKET, ' +
        'CATALOG_STORAGE_ACCESS_KEY and CATALOG_STORAGE_SECRET_KEY for this environment.',
    );
  }

  const force = process.argv.includes('--force');
  const files = readdirSync(DIR).filter(
    (name) =>
      PREFIXES.some((prefix) => name.startsWith(prefix)) && /\.(jpg|webp)$/.test(name),
  );
  if (files.length === 0) throw new Error('no discovery images found - run npm run assets:discovery first');

  console.log(
    `target: ${new URL(config.endpoint).hostname} bucket=${config.bucket} ` +
      `(${files.length} discovery files, ${force ? 're-uploading all' : 'skipping existing'})`,
  );

  let uploaded = 0;
  let skipped = 0;
  for (const name of files) {
    const extension = name.slice(name.lastIndexOf('.') + 1);
    const contentType = CONTENT_TYPES[extension];
    if (contentType === undefined) continue;

    // An object key names immutable bytes, so an existing upload is already correct; `--force` is for
    // the case where the local file was regenerated under the same key.
    if (!force && (await exists(config.endpoint, config.bucket, name))) {
      skipped += 1;
      continue;
    }

    await putObject(config, name, readFileSync(join(DIR, name)), contentType);
    uploaded += 1;
    if (uploaded % 25 === 0) console.log(`  … ${uploaded} uploaded`);
  }

  console.log(`✓ ${uploaded} uploaded, ${skipped} already present`);
}

/** A HEAD against the public object URL: cheap, and it needs no listing permission. */
async function exists(endpoint: string, bucket: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/${bucket}/${key}`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
