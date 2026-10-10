import type { Locale } from './types';

/**
 * Formats the demo capture date for display. The value stored in the catalog is
 * always an ISO date so it never depends on locale formatting.
 */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Normalises free text for search: trims, collapses whitespace, case-folds and
 * strips vowel marks so "niacinamide" and "নিয়াসিনামাইড" both match loosely.
 * Bengali letters, digits and conjuncts are preserved.
 */
export function normaliseForSearch(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u09BE-\u09CD\u09D7]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
