/**
 * Normalises free text for search: trims, collapses whitespace, case-folds and
 * strips vowel marks so a Bengali spelling of a Latin name still matches loosely. Bengali
 * letters, digits and conjuncts are preserved: search must keep working for owner-entered Bangla
 * product names and customer text even though the interface itself is English.
 */
export function normaliseForSearch(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u09BE-\u09CD\u09D7]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
