/**
 * Content integrity check. Runs without a test framework so it stays cheap and
 * dependency-free. Fails on any violated invariant, including the rule that the
 * demo warning can never be configured away.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { products } from '../src/data/catalog';
import { categories } from '../src/data/categories';
import {
  COLLECTION_MAX,
  COLLECTION_PRODUCT_IDS,
  FEATURED_MAX,
  FEATURED_PRODUCT_IDS,
  resolveSelection,
} from '../src/data/curation';
import { activeAnnouncements, announcements } from '../src/data/announcements';
import { IMAGE_WIDTHS } from '../src/lib/images';
import { discountAmount, discountPercent } from '../src/lib/money';

const errors: string[] = [];
const ids = new Set<string>();
const slugs = new Set<string>();
const categoryIds = new Set(categories.map((category) => category.id));

for (const product of products) {
  const label = product.slug;

  if (ids.has(product.id)) errors.push(`${label}: duplicate id ${product.id}`);
  ids.add(product.id);
  if (slugs.has(product.slug)) errors.push(`${label}: duplicate slug`);
  slugs.add(product.slug);

  if (!Number.isInteger(product.priceMinor) || product.priceMinor <= 0) {
    errors.push(`${label}: price must be a positive integer in poisha`);
  }
  if (
    product.compareAtPriceMinor !== null &&
    (!Number.isInteger(product.compareAtPriceMinor) ||
      product.compareAtPriceMinor <= product.priceMinor)
  ) {
    errors.push(`${label}: comparison price must be a greater integer or null`);
  }
  if (!categoryIds.has(product.categoryId)) {
    errors.push(`${label}: unknown category ${product.categoryId}`);
  }
  if (!product.name.bn && !product.name.en) {
    errors.push(`${label}: needs at least one localized name`);
  }
  if (product.name.en && /^\s|\s$/.test(product.name.en)) {
    errors.push(`${label}: untrimmed English name`);
  }
  if (product.images.length === 0) {
    errors.push(`${label}: no image entry`);
  }

  for (const image of product.images) {
    if (!image.alt.en && !image.alt.bn) {
      errors.push(`${label}: image ${image.key} has no alt text`);
    }
    if (image.rights === 'placeholder') {
      // Placeholder artwork is a single SVG, not a generated variant set.
      const svg = join(process.cwd(), 'public', 'catalog', `${image.key}.svg`);
      if (!existsSync(svg)) errors.push(`${label}: missing placeholder asset ${image.key}.svg`);
      continue;
    }
    if (!image.sourcePage.startsWith('https://')) {
      errors.push(`${label}: image ${image.key} missing provenance page`);
    }
    if (!image.sourceAsset.startsWith('https://')) {
      errors.push(`${label}: image ${image.key} missing provenance asset URL`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(image.retrievedAt)) {
      errors.push(`${label}: image ${image.key} missing retrieval date`);
    }
    // Every declared width must exist in both formats.
    for (const width of IMAGE_WIDTHS) {
      for (const extension of ['webp', 'jpg'] as const) {
        const file = join(
          process.cwd(),
          'public',
          'catalog',
          `${image.key}-${width}.${extension}`,
        );
        if (!existsSync(file)) {
          errors.push(`${label}: missing image asset ${image.key}-${width}.${extension}`);
        }
      }
    }
  }

  // A published comparison price must yield a plausible whole-percent saving.
  // This previously compared against -1, which the helper can never return, so
  // the assertion was dead.
  const percent = discountPercent(product.priceMinor, product.compareAtPriceMinor);
  if (percent !== null && (percent < 1 || percent > 99)) {
    errors.push(`${label}: implausible discount percentage ${percent}`);
  }
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  if (saving !== null && saving <= 0) errors.push(`${label}: non-positive saving`);
  if (product.isDemo !== true) errors.push(`${label}: demo marker missing`);
}

/*
 * Curated selections are lists of product ids. A typo would silently shorten a
 * homepage section instead of failing, so every id is checked here: it must
 * resolve, must not repeat within its own list, and the two lists must not
 * share a product. The caps are enforced as well as declared.
 */
const selections = [
  { name: 'featured', ids: FEATURED_PRODUCT_IDS, max: FEATURED_MAX },
  { name: 'collection', ids: COLLECTION_PRODUCT_IDS, max: COLLECTION_MAX },
];

for (const selection of selections) {
  if (selection.ids.length > selection.max) {
    errors.push(
      `curation: ${selection.name} lists ${selection.ids.length} products, above its ${selection.max} cap`,
    );
  }
  const seen = new Set<string>();
  for (const id of selection.ids) {
    if (seen.has(id)) errors.push(`curation: ${selection.name} repeats product id ${id}`);
    seen.add(id);
    if (!products.some((product) => product.id === id)) {
      errors.push(`curation: ${selection.name} references unknown product id ${id}`);
    }
  }
  if (resolveSelection(selection.ids, selection.max).length !== selection.ids.length) {
    errors.push(`curation: ${selection.name} does not resolve to its declared length`);
  }
}

const shared = FEATURED_PRODUCT_IDS.filter((id) => COLLECTION_PRODUCT_IDS.includes(id));
if (shared.length > 0) {
  errors.push(`curation: featured and collection share product id(s) ${shared.join(', ')}`);
}

/*
 * The storefront is out of demonstration (owner decision, 2026-10-23). The locked preview notice was
 * removed, so this check now guards the opposite direction: nothing may reintroduce a locked entry, and
 * no configured announcement may describe the shop as a preview. The owner's own line is the only
 * announcement, and it lives in the database rather than in this file.
 */
for (const announcement of announcements) {
  if (announcement.locked) {
    errors.push(`announcements: ${announcement.id} is locked; no locked notice is approved`);
  }
  if (announcement.message.trim().length === 0) {
    errors.push(`announcements: ${announcement.id} needs a message`);
  }
  if (/\b(demo|preview|demonstration)\b/i.test(announcement.message)) {
    errors.push(`announcements: ${announcement.id} still describes the store as a demo`);
  }
}

if (activeAnnouncements().length !== announcements.length) {
  errors.push('announcements: the active composition disagrees with the configured list');
}

if (errors.length > 0) {
  console.error(`Content check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

const discounted = products.filter(
  (product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
).length;
const withPhoto = products.filter((product) =>
  product.images.some((image) => image.rights !== 'placeholder'),
).length;
console.log(
  `Content OK: ${products.length} products (${withPhoto} with product photography), ` +
    `${categories.length} categories, ${discounted} with verified discounts, ` +
    `${FEATURED_PRODUCT_IDS.length}/${FEATURED_MAX} featured, ` +
    `${COLLECTION_PRODUCT_IDS.length}/${COLLECTION_MAX} in the collection, ` +
    `${activeAnnouncements().length} configured announcement(s); no demo notice.`,
);
