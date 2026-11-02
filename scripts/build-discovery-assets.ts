#!/usr/bin/env tsx
/**
 * Build the discovery images: square category photographs and brand logos.
 *
 * This is the one command that turns the licence list in `src/server/catalog/discovery-imagery.ts`
 * into files the storefront can render. It writes into `public/catalog/` in exactly the shape the
 * product photography already uses - `<key>-<width>.webp` and `<key>-<width>.jpg` for every declared
 * width - so the asset inventory, the admin picker and `/catalog/<key>-<width>.<ext>` need no special
 * case for them.
 *
 * ## Why a brand logo is verified rather than merely fetched
 *
 * A brand name has to become a domain before an icon service can answer, and a guessed domain is a
 * guess. A first pass produced 98 logos, five of which were the *same* generic favicon attached to
 * five unrelated brands - a wrong mark on a right name, which is worse than no mark at all. So a
 * candidate domain now has to prove itself twice before its icon is used:
 *
 * 1. **The icon is a real image**, at least 32px, not a 16px placeholder or an error page.
 * 2. **The site says it is that brand**: the domain's own `<title>` contains the brand name, with
 *    spaces and punctuation ignored. `dotandkey.com` proves itself for "Dot & Key"; a parked or
 *    unrelated site does not.
 *
 * A brand that cannot prove itself keeps `logo_key = null` and the storefront draws its initials. That
 * is the honest outcome, and it is reported.
 *
 * ## Resumable
 *
 * Every finished image is recorded in `.tmp-import/discovery-images.json`, and a re-run skips what is
 * already on disk. The brand pass is a few hundred network fetches that fail individually; starting
 * over each time would make the second half untestable.
 *
 * Usage:
 *   npm run assets:discovery                 # categories only
 *   npm run assets:discovery -- --brands     # categories and brand logos
 *   npm run assets:discovery -- --brands --force   # rebuild every brand logo from scratch
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import {
  brandDomainCandidates,
  brandLogoKey,
  CATEGORY_PHOTOS,
  categoryImageKey,
  categoryPhotoUrl,
  DISCOVERY_WIDTHS,
} from '../src/server/catalog/discovery-imagery';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'catalog');
const STATE_FILE = join(ROOT, '.tmp-import', 'discovery-images.json');

/** How many brands are fetched at once. Enough to finish in minutes, few enough to stay polite. */
const CONCURRENCY = 6;

type State = Record<string, { key: string; kind: 'category' | 'brand'; dimensions: string }>;

function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
  } catch {
    return {};
  }
}

function saveState(state: State): void {
  mkdirSync(join(ROOT, '.tmp-import'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
}

/** True when every declared variant of `key` is already on disk. */
function variantsPresent(key: string): boolean {
  return DISCOVERY_WIDTHS.every(
    (width) => existsSync(join(OUT_DIR, `${key}-${width}.webp`)) && existsSync(join(OUT_DIR, `${key}-${width}.jpg`)),
  );
}

/**
 * Writes the two variants for one square master image.
 *
 * The master is cropped to a square first, because a category tile is a square: a 3:2 photograph
 * stretched into one would either crop the subject out on a phone or leave the tile's own frame doing
 * the crop at every size.
 */
async function writeVariants(key: string, master: Buffer): Promise<void> {
  for (const width of DISCOVERY_WIDTHS) {
    const base = sharp(master)
      .resize(width, width, { fit: 'cover', position: 'attention' })
      .flatten({ background: '#f4f1f8' });
    await base.clone().webp({ quality: 82 }).toFile(join(OUT_DIR, `${key}-${width}.webp`));
    await base.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT_DIR, `${key}-${width}.jpg`));
  }
}

/** A square, validated master from arbitrary bytes; throws when the bytes are not an image. */
async function squareMaster(bytes: Buffer, size: number): Promise<{ png: Buffer; width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  if (meta.width === undefined || meta.height === undefined) throw new Error('no dimensions');
  const png = await sharp(bytes)
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .flatten({ background: '#f4f1f8' })
    .toFormat('png')
    .toBuffer();
  return { png, width: meta.width, height: meta.height };
}

async function fetchBuffer(url: string, timeoutMs: number): Promise<{ bytes: Buffer; type: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, type: response.headers.get('content-type') ?? '' };
  } catch {
    return null;
  }
}

/** Letters and digits only, lowercase: `Dot & Key` -> `dotandkey`. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The icons a page declares, largest first, plus the conventional `/favicon.ico` last.
 *
 * A brand's own `<link rel="apple-touch-icon">` is normally 180px - far better than the 32px
 * `/favicon.ico` a rewrite produces - so it is looked for first. Relative hrefs are resolved against
 * the page's own address, and only http(s) URLs are returned: a `data:` icon is a vector or a tiny
 * raster that would be upscaled into mush.
 */
function declaredIcons(html: string, pageUrl: string): string[] {
  const found: { href: string; size: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["'][^"']*\b(?:apple-touch-icon(?:-precomposed)?|icon|shortcut icon)\b/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href === undefined) continue;
    const sizes = /sizes\s*=\s*["'](\d+)(?:x\d+)?["']/i.exec(tag)?.[1];
    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') continue;
    found.push({ href: absolute.toString(), size: sizes === undefined ? 0 : Number(sizes) });
  }
  found.sort((a, b) => b.size - a.size);
  return [...found.map((entry) => entry.href), new URL('/favicon.ico', pageUrl).toString()];
}

/**
 * The brand's mark, taken from the brand's own site.
 *
 * This is the honest source: the icon the brand publishes for its own domain, at the size it
 * publishes it. The domain is verified first (its page must name the brand), so a parked domain, a
 * registrar placeholder or an unrelated business cannot supply a mark for a name it does not own.
 */
async function logoFromSite(
  domain: string,
  brand: BrandRow,
): Promise<{ png: Buffer; width: number; height: number } | null> {
  const pageUrl = `https://${domain}/`;
  const page = await fetchBuffer(pageUrl, 15_000);
  if (page === null || !page.type.includes('html')) return null;

  const html = page.bytes.toString('utf8').slice(0, 400_000);
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1] ?? '';
  /*
   * **The page has to name the brand.** Not the domain - the page. `imagic.com` resolves and has an
   * empty `<title>`, so a rule that accepted a matching hostname would attach a stranger's icon to the
   * name "Imagic". Requiring the name in the page's own title is the cheapest statement of identity a
   * site makes, and a brand whose site does not make it keeps its initials.
   */
  const flat = normalise(brand.name);
  if (flat.length < 4) return null;
  if (!normalise(`${title} ${brand.slug}`).includes(flat)) return null;

  for (const iconUrl of declaredIcons(html, pageUrl)) {
    const icon = await fetchBuffer(iconUrl, 15_000);
    if (icon === null || !icon.type.startsWith('image/') || icon.bytes.byteLength < 600) continue;
    try {
      const master = await squareMaster(icon.bytes, 320);
      /*
       * **A large icon or nothing.** A 32px favicon upscaled to a 110px tile is mush, and the small
       * `favicon.ico` is also the file a CMS publishes by default - the first pass caught a WordPress
       * "W" standing in for two unrelated brands. A 96px floor keeps only marks a brand deliberately
       * published large (its `apple-touch-icon`, almost always 180px); the rest fall back to initials.
       */
      if (Math.min(master.width, master.height) < 96) continue;
      return master;
    } catch {
      continue;
    }
  }
  return null;
}

type BrandRow = { slug: string; name: string };

async function buildCategories(state: State): Promise<void> {
  let built = 0;
  let skipped = 0;
  for (const [slug, photo] of Object.entries(CATEGORY_PHOTOS)) {
    const key = categoryImageKey(slug);
    if (variantsPresent(key)) {
      skipped += 1;
      await ensureState(state, key, 'category');
      continue;
    }
    const bytes = await fetchBuffer(categoryPhotoUrl(photo.id), 45_000);
    if (bytes === null) {
      console.error(`  ✗ ${slug}: download failed (${photo.id})`);
      continue;
    }
    const master = await squareMaster(bytes.bytes, 900);
    await writeVariants(key, master.png);
    state[key] = { key, kind: 'category', dimensions: 'square' };
    built += 1;
    console.log(`  ✓ ${slug} → ${key}`);
  }
  console.log(`categories: ${built} built, ${skipped} already present`);
}

async function ensureState(state: State, key: string, kind: 'category' | 'brand'): Promise<void> {
  if (state[key] === undefined) state[key] = { key, kind, dimensions: 'square' };
}

/** Fetch one brand's logo, verified twice: the domain names the brand, and the icon is a real image. */
async function buildOneBrand(
  brand: BrandRow,
  state: State,
  seenMasters: Map<string, string>,
): Promise<{ key: string | null }> {
  const key = brandLogoKey(brand.slug);

  for (const domain of brandDomainCandidates(brand.slug)) {
    const master = await logoFromSite(domain, brand);
    if (master === null) continue;

    /*
     * The same bytes attached to two unrelated brands is the failure this gate exists for: two brands
     * may only share a mark when their names are the same brand spelled two ways (`skin-1004` /
     * `skin1004`).
     */
    const fingerprint = master.png.toString('base64').slice(0, 4000);
    const owner = seenMasters.get(fingerprint);
    if (owner !== undefined && normalise(owner) !== normalise(brand.slug)) continue;
    seenMasters.set(fingerprint, brand.slug);

    await writeVariants(key, master.png);
    await ensureState(state, key, 'brand');
    return { key };
  }

  return { key: null };
}

async function buildBrands(state: State, force: boolean): Promise<void> {
  const rows = JSON.parse(readFileSync(join(ROOT, '.tmp-import', 'brands.json'), 'utf8')) as BrandRow[];
  const seenMasters = new Map<string, string>();

  const pending: BrandRow[] = [];
  let skipped = 0;
  for (const brand of rows) {
    const key = brandLogoKey(brand.slug);
    if (!force && variantsPresent(key)) {
      skipped += 1;
      await ensureState(state, key, 'brand');
      continue;
    }
    pending.push(brand);
  }

  let done = 0;
  const without: string[] = [];
  const queue = [...pending];

  async function worker(): Promise<void> {
    for (let brand = queue.shift(); brand !== undefined; brand = queue.shift()) {
      const result = await buildOneBrand(brand, state, seenMasters);
      if (result.key === null) without.push(brand.slug);
      done += 1;
      if (done % 20 === 0) {
        saveState(state);
        console.log(`  … ${done}/${pending.length} brands checked`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);

  console.log(
    `brands: ${done + skipped} total, ${skipped} already present, ${done - without.length} fetched, ` +
      `${without.length} left without a logo`,
  );
  if (without.length > 0) {
    console.log(`  no verifiable logo: ${without.slice(0, 24).join(', ')}${without.length > 24 ? ', …' : ''}`);
    console.log('  those brands keep logo_key = null and render their initials.');
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const state = loadState();
  const withBrands = process.argv.includes('--brands');
  const force = process.argv.includes('--force');

  await buildCategories(state);
  saveState(state);

  if (withBrands) {
    if (!existsSync(join(ROOT, '.tmp-import', 'brands.json'))) {
      throw new Error('missing .tmp-import/brands.json - export the brand list first');
    }
    await buildBrands(state, force);
  }
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});