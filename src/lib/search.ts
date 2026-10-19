/**
 * One literal-search helper for admin list filters.
 *
 * ILIKE treats `%`, `_` and `\\` as pattern syntax. A customer's or owner's search text is data, not a
 * pattern, so those characters are escaped into literals before the value is used as a parameter
 * (PostgreSQL's default LIKE escape character is the backslash). This is a presentation filter on an
 * already-authorised read, never an authorisation control.
 */
export function likeTerm(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
