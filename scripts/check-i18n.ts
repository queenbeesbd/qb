/**
 * Translation completeness check. Asserts Bangla/English key parity, identical
 * placeholder tokens per key, and no empty strings.
 */
import { dictionary } from '../src/i18n/dictionaries';

const errors: string[] = [];
const bnKeys = Object.keys(dictionary.bn).sort();
const enKeys = Object.keys(dictionary.en).sort();

for (const key of bnKeys) {
  if (!(key in dictionary.en)) errors.push(`en: missing key ${key}`);
}
for (const key of enKeys) {
  if (!(key in dictionary.bn)) errors.push(`bn: missing key ${key}`);
}

for (const locale of ['bn', 'en'] as const) {
  const entries = Object.entries(dictionary[locale]) as [string, string][];
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${locale}: empty value for ${key}`);
    }
    const other = (locale === 'bn' ? dictionary.en : dictionary.bn) as Record<string, string>;
    const tokens = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const a = tokens(value);
    const b = tokens(other[key] ?? '');
    if (a.join(',') !== b.join(',')) {
      errors.push(`${key}: placeholder mismatch between bn and en`);
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(`i18n OK: ${bnKeys.length} keys present in bn and en with matching placeholders.`);
