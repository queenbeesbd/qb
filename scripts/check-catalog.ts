/**
 * Content integrity check. Runs without a test framework so it stays cheap and
 * dependency-free. Fails on any violated invariant, including the rule that the
 * demo warning can never be configured away.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { products } from '../src/data/catalog';
import { categories } from '../src/data/categories';
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

  if (product.availability === 'in_stock' && discountPercent(product.priceMinor, product.compareAtPriceMinor) === -1) {
    errors.push(`${label}: invalid discount percentage`);
  }
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  if (saving !== null && saving <= 0) errors.push(`${label}: non-positive saving`);
  if (product.isDemo !== true) errors.push(`${label}: demo marker missing`);
}

// The demonstration must never be able to present itself as a live shop.
const demoAnnouncement = announcements.find((announcement) => announcement.id === 'demo-preview');
if (!demoAnnouncement) {
  errors.push('announcements: the locked demo-preview announcement is missing');
} else {
  if (!demoAnnouncement.locked) {
    errors.push('announcements: the demo-preview announcement must be locked');
  }
  if (!demoAnnouncement.message.bn || !demoAnnouncement.message.en) {
    errors.push('announcements: the demo-preview announcement needs both locales');
  }
  if (!activeAnnouncements().some((announcement) => announcement.id === 'demo-preview')) {
    errors.push('announcements: the demo-preview announcement is not active');
  }
}

for (const announcement of announcements) {
  if (!announcement.message.bn || !announcement.message.en) {
    errors.push(`announcements: ${announcement.id} needs both locales`);
  }
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
    `${activeAnnouncements().length} active announcement(s) including the locked demo warning.`,
);
