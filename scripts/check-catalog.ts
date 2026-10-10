/**
 * Catalog integrity check. Runs without a test framework so it stays cheap and
 * dependency-free. Fails on any violated invariant.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { products } from '../src/data/catalog';
import { categories } from '../src/data/categories';
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
  if (categoryIds.has(product.categoryId) === false) {
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
    if (!image.localPath.startsWith('/catalog/')) continue;
    const file = join(process.cwd(), 'public', image.localPath.replace(/^\//, ''));
    if (!existsSync(file)) errors.push(`${label}: missing local asset ${image.localPath}`);
    if (image.rights !== 'placeholder' && image.rights !== 'pending_review') {
      errors.push(`${label}: unexpected image rights value`);
    }
  }
  if (product.availability === 'in_stock' && discountPercent(product.priceMinor, product.compareAtPriceMinor) === -1) {
    errors.push(`${label}: invalid discount percentage`);
  }
  const saving = discountAmount(product.priceMinor, product.compareAtPriceMinor);
  if (saving !== null && saving <= 0) errors.push(`${label}: non-positive saving`);
  if (product.isDemo !== true) errors.push(`${label}: demo marker missing`);
}

if (errors.length > 0) {
  console.error(`Catalog check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

const discounted = products.filter(
  (product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
).length;
console.log(
  `Catalog OK: ${products.length} products, ${categories.length} categories, ${discounted} with verified discounts.`,
);
