#!/usr/bin/env tsx
/**
 * Trim the empty border off every brand logo and rebuild its square WebP variants.
 *
 * The brand index draws logos in the same circle as a category tile. Favicons and shop logos usually
 * arrive on a canvas with their own whitespace, so a logo that is 40% of its file rendered as a small
 * mark floating in a large tile. Trimming the uniform edge and then placing the mark in a square at
 * 92% of the width makes the ink fill the circle without cropping a wordmark.
 *
 * Only the discovery family is touched (`brand-logo-*`). Product photography is a photograph, not a
 * mark, and category photographs already fill their circles.
 *
 * Usage:
 *   npm run assets:logos
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { IMAGE_WIDTHS } from '../src/lib/images';

const DIR = join(process.cwd(), 'public', 'catalog');
/** Ink occupies 92% of the square, leaving the circle's border visible. */
const CONTENT = 0.92;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function rebuild(key: string): Promise<boolean> {
  const wideJpeg = join(DIR, `${key}-1050.jpg`);
  const wideWebp = join(DIR, `${key}-1050.webp`);
  const source = (await exists(wideJpeg)) ? wideJpeg : wideWebp;
  if (!(await exists(source))) return false;

  let trimmed: Buffer;
  try {
    trimmed = await sharp(source).trim({ background: '#ffffff', threshold: 12 }).toBuffer();
  } catch {
    // An image with no uniform edge is already full-bleed; use it unchanged.
    trimmed = await sharp(source).toBuffer();
  }

  for (const width of IMAGE_WIDTHS) {
    const inner = Math.round(width * CONTENT);
    const content = await sharp(trimmed)
      .resize(inner, inner, { fit: 'inside', withoutEnlargement: false })
      .toBuffer();

    await sharp({
      create: { width, height: width, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([{ input: content, gravity: 'center' }])
      .webp({ quality: 82, effort: 6 })
      .toFile(join(DIR, `${key}-${width}.webp`));
  }
  return true;
}

async function main(): Promise<void> {
  const entries = await readdir(DIR);
  const keys = new Set<string>();
  for (const entry of entries) {
    const match = /^(brand-logo-.+)-(?:600|1050)\.(?:jpg|webp)$/.exec(entry);
    if (match?.[1] !== undefined) keys.add(match[1]);
  }

  let done = 0;
  let skipped = 0;
  for (const key of [...keys].sort()) {
    if (await rebuild(key)) done += 1;
    else skipped += 1;
  }
  console.log(`✓ ${done} brand logos trimmed to their ink; ${skipped} skipped (no source variant)`);
}

void main();
