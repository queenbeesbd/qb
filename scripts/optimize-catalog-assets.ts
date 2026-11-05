#!/usr/bin/env tsx
/**
 * Re-encode every stored catalog photograph and hero banner as **WebP only**, at the widths the
 * storefront renders (owner direction, 2026-11-05).
 *
 * Why: the shop serves 320 (circles, small previews), 600 (product card, fallback) and 1050 (detail).
 * JPEG is no longer generated or referenced, and a card never downloads the detail master. Running
 * this once over the existing tree gives every already-stored key the thumbnail it never had and a
 * smaller card image, without touching the database: `src/lib/images.ts` derives paths from the key,
 * so the files are the contract.
 *
 * - The **best available source** for each key is the widest JPEG, falling back to the widest WebP.
 *   Re-encoding from the widest frame avoids compounding a previous resize.
 * - The source's own aspect ratio is kept (`fit: cover`), so a 3:4 product photo and a 1:1 category
 *   photograph are both cropped to their real frame rather than forced into one shape.
 * - Existing JPEGs are left on disk and in the bucket; nothing references them any more, and deleting
 *   bytes under a name that was once served is a separate, riskier decision.
 *
 * Usage:
 *   npm run assets:optimize
 *   npm run assets:optimize -- --hero        # only the hero banners
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { HERO_IMAGE_WIDTHS, IMAGE_WIDTHS } from '../src/lib/images';

const CATALOG = join(process.cwd(), 'public', 'catalog');
const HERO = join(process.cwd(), 'public', 'hero');

/** One WebP encode. Quality 74 keeps a card near 10-20 KB without visible banding on cosmetics. */
async function encode(
  source: string,
  width: number,
  height: number,
  target: string,
): Promise<number> {
  await sharp(source, { failOn: 'error' })
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 74, effort: 6, smartSubsample: true })
    .toFile(target);
  return (await stat(target)).size;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function optimizeCatalog(): Promise<void> {
  const entries = await readdir(CATALOG);
  const keys = new Set<string>();
  for (const entry of entries) {
    const match = /^(.+)-(?:600|1050)\.(?:jpg|webp)$/.exec(entry);
    if (match?.[1] !== undefined) keys.add(match[1]);
  }

  const sorted = [...keys].sort();
  console.log(`catalog: ${sorted.length} keys`);

  let before = 0;
  let after = 0;
  let done = 0;

  const queue = [...sorted];
  async function worker(): Promise<void> {
    for (;;) {
      const key = queue.shift();
      if (key === undefined) return;

      const wideJpeg = join(CATALOG, `${key}-1050.jpg`);
      const wideWebp = join(CATALOG, `${key}-1050.webp`);
      const source = (await exists(wideJpeg)) ? wideJpeg : wideWebp;
      if (!(await exists(source))) continue;

      const metadata = await sharp(source).metadata();
      if (metadata.width === undefined || metadata.height === undefined) continue;
      const ratio = metadata.height / metadata.width;

      for (const width of IMAGE_WIDTHS) {
        const target = join(CATALOG, `${key}-${width}.webp`);
        if (await exists(target)) before += (await stat(target)).size;
        after += await encode(source, width, Math.round(width * ratio), target);
      }

      done += 1;
      if (done % 250 === 0) console.log(`  ${done}/${sorted.length}`);
    }
  }

  await Promise.all(Array.from({ length: 8 }, () => worker()));
  console.log(
    `catalog done: ${sorted.length} keys, ${(before / 1024 / 1024).toFixed(1)} MB of WebP before ` +
      `→ ${(after / 1024 / 1024).toFixed(1)} MB after`,
  );
}

async function optimizeHero(): Promise<void> {
  const entries = await readdir(HERO);
  const keys = new Set<string>();
  for (const entry of entries) {
    const match = /^(.+)-(?:800|1600)\.(?:jpg|webp)$/.exec(entry);
    if (match?.[1] !== undefined) keys.add(match[1]);
  }

  let before = 0;
  let after = 0;
  for (const key of [...keys].sort()) {
    const wideJpeg = join(HERO, `${key}-1600.jpg`);
    const wideWebp = join(HERO, `${key}-1600.webp`);
    const source = (await exists(wideJpeg)) ? wideJpeg : wideWebp;
    if (!(await exists(source))) continue;

    for (const width of HERO_IMAGE_WIDTHS) {
      const target = join(HERO, `${key}-${width}.webp`);
      if (await exists(target)) before += (await stat(target)).size;
      after += await encode(source, width, Math.round((width * 9) / 16), target);
    }
  }
  console.log(
    `hero done: ${keys.size} banners, ${(before / 1024).toFixed(0)} KB before → ${(after / 1024).toFixed(0)} KB after`,
  );
}

async function main(): Promise<void> {
  const heroOnly = process.argv.includes('--hero');
  if (!heroOnly) await optimizeCatalog();
  await optimizeHero();
}

void main();
