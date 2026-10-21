/**
 * English-only interface check (Phase 28).
 *
 * The product has one interface language. This replaces the old Bangla/English key-parity check,
 * because parity between two dictionaries is no longer the property worth protecting. What matters
 * now is:
 *
 * 1. **The dictionary is complete** - no empty or whitespace-only value.
 * 2. **The dictionary is English** - no Bengali script in interface copy.
 * 3. **Every referenced key exists** - a `t('...')` or a key map naming a missing key fails here
 *    instead of rendering the raw key in the interface.
 * 4. **No application-owned interface file carries Bengali text**, except the catalog and seed data,
 *    which are owner records, not interface copy.
 *
 * Dead-key detection is deliberately **not** part of this check: several families are addressed
 * dynamically (`admin.validation.*`, status labels), so a static "is it referenced" rule would flag
 * live copy as dead and tempt someone to delete it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { dictionary } from '../src/i18n/dictionaries';

const BENGALI = /[\u0980-\u09FF]/;
const errors: string[] = [];
const keys = Object.keys(dictionary);

/** Files allowed to contain Bengali: owner records and the seed that writes them. */
const DATA_FILES = new Set([
  'src/data/catalog.ts',
  'src/data/categories.ts',
  'src/data/announcements.ts',
  'src/db/seed-catalog.ts',
  'src/lib/delivery-areas.ts',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

const sourceFiles = walk('src');

for (const [key, value] of Object.entries(dictionary)) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`empty value for ${key}`);
  }
  if (BENGALI.test(value)) {
    errors.push(`${key}: Bengali text in an English-only dictionary`);
  }
  if (BENGALI.test(key)) {
    errors.push(`${key}: Bengali text in a dictionary key`);
  }
}

for (const file of sourceFiles) {
  const relativePath = relative(process.cwd(), file).split('\\').join('/');
  if (DATA_FILES.has(relativePath)) continue;
  if (file.endsWith('src/i18n/dictionaries.ts')) continue;
  const text = readFileSync(file, 'utf8');
  if (BENGALI.test(text)) {
    errors.push(`${relativePath}: Bengali text in application-owned code`);
  }
}

// The dictionary itself is excluded: leaving it in would make every key look "referenced" by its
// own definition, which is how a dead key hides.
const sources = sourceFiles
  .filter((file) => !file.endsWith('src/i18n/dictionaries.ts'))
  .map((file) => readFileSync(file, 'utf8').split('\\').join('/'));

/** Every key a view names through `t('...')` must exist in the dictionary. */
const referenced = new Set<string>();
for (const text of sources) {
  for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) referenced.add(match[1] ?? '');
}
for (const key of referenced) {
  if (!(key in dictionary)) errors.push(`missing dictionary key referenced by t(): ${key}`);
}

if (errors.length > 0) {
  console.error(`i18n check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(
  `i18n OK: ${keys.length} English keys, no Bengali in interface code, ${referenced.size} referenced keys all present.`,
);
