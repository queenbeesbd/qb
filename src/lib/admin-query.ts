/**
 * Query-string helpers for the admin list surfaces (Phase 30).
 *
 * Every list is filtered and paginated by the **server**, and the whole state lives in the URL:
 * `q`, the status/availability filter, the date range, the page size and the page number. That makes
 * a filtered list linkable, makes the back button work, and means the browser never narrows a stale
 * full list on its own.
 *
 * Two rules are load-bearing here:
 *
 * 1. **A bad parameter is clamped, never thrown.** A hand-typed `?page=9999`, `?size=7` or
 *    `?from=2026-02-31` must render a page, not an error screen. Anything unrecognised falls back to
 *    the documented default, so an invalid URL is indistinguishable from an absent one.
 * 2. **Pagination is never carried across a filter change.** `buildQueryHref` only writes the keys it
 *    is given, and the callers omit `page` when they change a filter - so narrowing a list always
 *    returns to its first page instead of landing on an empty second page.
 *
 * Nothing here touches the database, so it is unit-testable without a cluster.
 */

/** The page sizes the owner may choose. Deliberately small, bounded and explicit. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Canonical positive integer: no sign, no whitespace, no `25abc`. */
const DIGITS = /^[1-9]\d*$/;
const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A 1-based page number. Anything else is page 1. */
export function readPageNumber(value: string | undefined): number {
  if (value === undefined || !DIGITS.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

/**
 * A page size from the documented set. A value outside it falls back to the list's own default
 * rather than being clamped to a neighbour: silently serving 100 rows to someone who asked for 7 is
 * a different lie from serving the default.
 */
export function readPageSize(value: string | undefined, fallback: number): number {
  if (value === undefined || !DIGITS.test(value)) return fallback;
  const parsed = Number(value);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : fallback;
}

/**
 * A `<input type="date">` value, or `''`.
 *
 * The shape is checked **and** the calendar: `2026-02-31` would otherwise be accepted by the regex
 * and silently roll forward to 3 March, which would filter a different week than the owner asked for.
 */
export function readDateInput(value: string | undefined): string {
  const match = DATE_INPUT.exec(value ?? '');
  if (match === null) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export type DateBounds = { readonly start: Date | null; readonly end: Date | null };

/**
 * The half-open `[start, end)` interval for a date range, in the server's local calendar.
 *
 * `end` is the **start of the day after** `to`, so a range includes both named days without the
 * 23:59:59.999 edge that loses the last millisecond. Both inputs are inclusive to the owner, which
 * is what the two date fields say. A backwards range is swapped rather than silently emptied: the
 * owner typed two dates and meant the span between them.
 *
 * Local time is the same convention `codDecidedToday` already uses for "today".
 */
export function dateRangeBounds(from: string, to: string): DateBounds {
  const startDay = from === '' ? null : from;
  const endDay = to === '' ? null : to;
  if (startDay === null && endDay === null) return { start: null, end: null };

  const [lower, upper] =
    startDay !== null && endDay !== null && startDay > endDay ? [endDay, startDay] : [startDay, endDay];

  const start = lower === null ? null : atLocalMidnight(lower, 0);
  const end = upper === null ? null : atLocalMidnight(upper, 1);
  return { start, end };
}

function atLocalMidnight(value: string, dayOffset: number): Date {
  const [year, month, day] = value.split('-').map(Number);
  // The Date constructor normalises an overflow (31 April becomes 1 May), which is exactly the
  // "next day" arithmetic wanted here and needs no manual month-length table.
  return new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + dayOffset);
}

/**
 * A URL for `basePath` carrying exactly the given parameters.
 *
 * Empty, `null` and `undefined` values are dropped, so an unfiltered list is a clean path rather
 * than `?q=&filter=all&size=25` - and two equivalent states always produce the same string.
 */
export function buildQueryHref(
  basePath: string,
  query: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search === '' ? basePath : `${basePath}?${search}`;
}
