/**
 * Catalog input validation and normalization.
 *
 * Pure functions with no database and no request object, so the rules can be unit-tested directly and
 * reused by every mutation path. Three properties are deliberate:
 *
 * 1. **Nothing here trusts a formatted value.** A price arrives as the owner typed it and is converted
 *    to integer poisha by integer arithmetic - never `parseFloat`, never a multiplication that can
 *    produce 74999.99999999999. A value the browser sends is a *claim*, and this is where the claim is
 *    checked, not where it is believed.
 * 2. **Failure is `null`, not an exception.** The caller decides whether a malformed field is a redirect
 *    to a validation notice or a refusal, so this layer never decides policy.
 * 3. **The bounds mirror the database `CHECK` constraints.** They are duplicated on purpose: the
 *    database is the guarantee, and these are the same rules expressed early enough to give the owner a
 *    useful message instead of a constraint violation.
 *
 * Sources: `src/db/schema/catalog.ts` (length and format checks), `docs/data-model.md` 5.1 and 5.2,
 * and `docs/requirements.md` (all money is integer poisha).
 */

import { PRODUCT_AVAILABILITY } from '@/db/schema/values';

export type Availability = (typeof PRODUCT_AVAILABILITY)[number];

/**
 * Bilingual text bounds. They match the schema's `char_length` checks, which differ per field:
 * a category name is 80, a product name is 200.
 */
export const TEXT_BOUNDS = {
  categoryName: 80,
  productName: 200,
  /** Descriptions have no schema bound; this is an input sanity bound, recorded rather than implied. */
  description: 4000,
  packSize: 80,
  altText: 300,
  /** `product_variant.sku` is `lenAtMost 64`. */
  sku: 64,
} as const;

/**
 * Input bound for a price, in poisha. 100,000,000 poisha is 1,000,000 BDT.
 *
 * This is an input sanity bound, not a business rule: the schema bound is `int4` (2,147,483,647). A
 * catalog price above one million BDT is far more likely to be a typo than a real price, and refusing
 * it early is cheaper than storing it.
 */
export const MAX_PRICE_MINOR = 100_000_000;

/** Slug format, identical to the `product_slug_format` / `category_slug_format` checks. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `product_variant.sku` / `brand.slug` style token: lowercase, digits, `-` or `_`. */
export const SLUG_MAX_LENGTH = 80;

/**
 * Normalizes free text: trims, collapses internal whitespace runs, and removes control characters.
 *
 * Whitespace collapsing is safe for Bengali - it does not touch conjunct clusters or add letter
 * spacing, which `AGENTS.md` forbids for Bangla. It only replaces runs of whitespace with one space.
 */
export function normalizeText(raw: string): string {
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Reads a required bilingual field. Returns `null` when the value is absent, not a string, empty after
 * normalization, or longer than `max`.
 */
export function parseRequiredText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeText(value);
  if (normalized.length === 0 || normalized.length > max) return null;
  return normalized;
}

/**
 * Reads an optional bilingual field. An empty value normalizes to `null` rather than `''`, so "absent"
 * has exactly one representation in the database and a blank description cannot be mistaken for a
 * description that exists.
 */
export function parseOptionalText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const normalized = normalizeText(value);
  if (normalized.length === 0) return { ok: true, value: null };
  if (normalized.length > max) return { ok: false };
  return { ok: true, value: normalized };
}

/**
 * Converts an owner-typed price into integer poisha, or `null`.
 *
 * Accepted: `750`, `750.5`, `750.50`, ` 750 ` (BDT). Rejected: negative, zero (when `allowZero` is
 * false), more than two decimal places, an exponent, a thousands separator, a currency symbol, a
 * non-Latin digit set, or a value above `MAX_PRICE_MINOR`.
 *
 * **A number is refused too.** A bare number has no unit, so accepting one would mean guessing whether it
 * is BDT or poisha - and guessing wrong is a 100x money error. A price therefore arrives only as the
 * owner typed it, and only this function decides what it means.
 *
 * The arithmetic is integer-only: the fraction is padded to two digits and added as an integer, so
 * `750.1` is 75010 and never 75009.99999999999.
 */
export function parsePoisha(value: unknown, options: { allowZero?: boolean } = {}): number | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  // Deliberately strict: ASCII digits only, no sign, no separator, no exponent, no symbol.
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (match === null) return null;

  const whole = Number.parseInt(match[1] ?? '', 10);
  const fractionDigits = match[2] ?? '';
  const fraction = fractionDigits === '' ? 0 : Number.parseInt(fractionDigits.padEnd(2, '0'), 10);

  const minor = whole * 100 + fraction;
  return checkPoishaRange(minor, options.allowZero ?? false) ? minor : null;
}

function checkPoishaRange(minor: number, allowZero: boolean): boolean {
  if (!Number.isSafeInteger(minor)) return false;
  if (minor < 0) return false;
  if (minor === 0 && !allowZero) return false;
  return minor <= MAX_PRICE_MINOR;
}
/**
 * Reads an availability value from a request.
 *
 * Only the two documented states are accepted. There is no default and no coercion: an unrecognized
 * value is `null`, which the caller refuses. That is what stops a client inventing a third state or
 * passing a quantity where a state is expected.
 */
export function parseAvailability(value: unknown): Availability | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return (PRODUCT_AVAILABILITY as readonly string[]).includes(candidate)
    ? (candidate as Availability)
    : null;
}

/**
 * Derives a slug from arbitrary text. Used only when the owner leaves the slug field blank.
 *
 * Non-Latin input (Bangla) has no ASCII transliteration here on purpose: inventing one would produce a
 * slug the owner never wrote and cannot predict. Bangla-only input therefore yields `null` and the
 * caller asks for a slug explicitly.
 */
export function slugify(raw: string): string | null {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (ascii === '') return null;
  return truncateSlug(ascii);
}

/**
 * Validates an owner-supplied slug. Returns `null` when it is malformed, so a slug is either exactly
 * what the owner typed or rejected - it is never silently rewritten into something else.
 */
export function parseSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0 || candidate.length > SLUG_MAX_LENGTH) return null;
  return SLUG_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Truncates at a `-` boundary so the result still matches the slug format. Truncating mid-token would
 * leave a trailing `-`, which the format check refuses.
 */
function truncateSlug(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  const trimmed = lastDash > 0 ? cut.slice(0, lastDash) : cut;
  return trimmed.replace(/-+$/, '');
}

/**
 * Reads a SKU. Uppercase letters and digits with `-` are the convention the catalog already uses; the
 * schema only bounds the length, so the shape is normalized here rather than enforced as policy.
 */
export function parseSku(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  if (candidate === '' || candidate.length > TEXT_BOUNDS.sku) return null;
  return /^[A-Z0-9][A-Z0-9-]*$/.test(candidate) ? candidate : null;
}

/** Reads a non-negative integer, used for `sort_order` and image ordering. */
export function parseSortOrder(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= 10_000 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/**
 * Reads a positive database id from a form field or path segment.
 *
 * Bigint columns are returned as numbers by the schema (`mode: 'number'`), so the value is bounded to
 * `Number.MAX_SAFE_INTEGER` and rejected otherwise - a value that large is not a real row id.
 */
export function parseId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,15}$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Reads a base-key for a local catalog image asset.
 *
 * The format is the one `src/lib/images.ts` builds paths from: lowercase letters, digits and single
 * dashes. Anything else - a path separator, a `..`, an absolute path, a URL, a percent-encoding - is
 * rejected here, before it can reach the filesystem. The allowlist in `assets.ts` is the second,
 * independent check, so a syntactically valid key that is not a real asset is still refused.
 */
export function parseImageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 120) return null;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate) ? candidate : null;
}

/**
 * Reads an email address for an owner account.
 *
 * Bounded and deliberately shallow: the address is a sign-in identifier, and no mail is ever sent to
 * it (no mail provider is authorized), so there is nothing to verify and no reason to accept an
 * exotic address.
 */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0 || candidate.length > 254) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) return null;
  return candidate;
}

/** Reads a human display name, bounded by the same 80 characters the staff screen already uses. */
export function parseDisplayName(value: unknown): string | null {
  return parseRequiredText(value, 80);
}
