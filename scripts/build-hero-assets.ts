#!/usr/bin/env tsx
/**
 * Build the homepage hero images.
 *
 * The owner's masters live in `hero/` at the repository root and are never served directly. This
 * command turns each one into the two generated variants the storefront renders - 800 and 1600 wide,
 * WebP and JPEG, cropped to the 16:9 banner frame - under `public/hero/`.
 *
 * It follows the discovery asset pipeline exactly (see `scripts/build-discovery-assets.ts`): the
 * browser never uploads an image, the file's own bytes decide its metadata, and the admin screen then
 * **associates** one of these generated assets with the carousel. No object-storage credential is
 * needed here; `npm run assets:upload` is the separate deployment step.
 *
 * Usage:
 *   npm run assets:hero
 */

import { mkdirSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';

import sharp from 'sharp';

import { HERO_IMAGE_WIDTHS } from '../src/lib/images';

const SRC_DIR = join(process.cwd(), 'hero');
const OUT_DIR = join(process.cwd(), 'public', 'hero');
const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** `Wooden Brushes.jpeg` -> `hero-wooden-brushes`; the key format the database accepts. */
function keyFor(fileName: string): string {
  const base = parse(fileName).name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base === '') throw new Error(`cannot derive an image key from "${fileName}"`);
  return `hero-${base}`;
}

async function main(): Promise<void> {
  const files = readdirSync(SRC_DIR)
    .filter((name) => SUPPORTED.has(parse(name).ext.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (files.length === 0) throw new Error(`no master images found in ${SRC_DIR}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const seen = new Set<string>();

  for (const fileName of files) {
    const key = keyFor(fileName);
    if (seen.has(key)) throw new Error(`two masters resolve to the same key "${key}"`);
    seen.add(key);

    const master = join(SRC_DIR, fileName);
    for (const width of HERO_IMAGE_WIDTHS) {
      const height = Math.round((width * 9) / 16);
      const base = sharp(master)
        .resize(width, height, { fit: 'cover', position: 'attention' })
        .flatten({ background: '#f4f1f8' });
      await base.clone().webp({ quality: 82 }).toFile(join(OUT_DIR, `${key}-${width}.webp`));
      await base.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT_DIR, `${key}-${width}.jpg`));
    }
    console.log(`✓ ${fileName} -> ${key} (${HERO_IMAGE_WIDTHS.join(', ')} px)`);
  }

  console.log(`${files.length} hero image(s) written to public/hero`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
