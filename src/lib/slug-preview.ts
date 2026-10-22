/**
 * The slug an empty slug field would produce, for the editors that show it back.
 *
 * This is a **preview**, not the authority: the server derives the stored slug itself
 * (`slugify` in `src/server/catalog/validation.ts`) and refuses one that is malformed or taken. The two
 * follow the same normalise-lowercase-strip rule on purpose, so the address under the field is the
 * address the save will use rather than a guess that quietly differs.
 */
export function slugPreview(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}
