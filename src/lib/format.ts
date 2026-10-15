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
