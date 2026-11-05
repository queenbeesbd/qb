#!/usr/bin/env tsx
/**
 * Build the brand mark from the owner's own logo.
 *
 * The owner supplied `logo.jpeg` in the repository root: a square 1500x1500 lockup inside a drawn
 * circle. The storefront draws it **inside a circular box**, which is the owner's rule for every brand
 * image in the shop - a square upload is centre-cropped to a circle rather than letterboxed - so the
 * pipeline only has to produce the sizes that box can use.
 *
 * Two widths, both square, both JPEG: the mark renders at 44-48px, and 96/192 covers a 2x phone and a
 * 3x one with room to spare. The master is never served: `public/brand` holds generated files only, the
 * same contract `public/hero` and `public/catalog` follow.
 *
 * Usage:
 *   npm run assets:brand
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

const ROOT = process.cwd();
const MASTER = join(ROOT, 'logo.jpeg');
const OUT_DIR = join(ROOT, 'public', 'brand');

/** The widths the header can ask for. 96 is a 2x 48px mark; 192 is a 3x and a retina tablet. */
const WIDTHS = [96, 192] as const;

async function main(): Promise<void> {
  if (!existsSync(MASTER)) {
    console.error('✗ logo.jpeg is missing from the repository root; nothing to build.');
    process.exit(1);
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const metadata = await sharp(MASTER).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    console.error('✗ logo.jpeg could not be read as an image.');
    process.exit(1);
  }

  for (const width of WIDTHS) {
    /*
     * `fit: cover` on a square crop is what makes any upload work: a non-square image is centre-cropped
     * rather than squashed, and the CSS then crops that square to a circle. No part of the image is
     * stretched, and nothing is padded with a colour the owner did not choose.
     */
    await sharp(MASTER)
      .resize(width, width, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(join(OUT_DIR, `logo-round-${width}.jpeg`));
  }

  console.log(
    `✓ brand mark built from logo.jpeg (${metadata.width}x${metadata.height}) → ` +
      WIDTHS.map((width) => `public/brand/logo-round-${width}.jpeg`).join(', '),
  );
}

void main();
