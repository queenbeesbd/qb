/**
 * Customer registration and sign-in input validation.
 *
 * Pure functions over untrusted input: no database, no request object, so every rule is unit-testable
 * and every caller checks the same thing. Failure is `null` rather than an exception - the caller
 * decides whether a malformed field becomes a form notice or a refusal.
 *
 * The email is normalised for storage, lookup and throttling (trimmed, lower-cased). The address the
 * person typed is never used as an identity key: the schema's unique index is on `lower(email)`.
 *
 * A phone number is the other sign-in identifier (2026-11-11). It is normalised to the schema's own
 * 11-digit Bangladeshi form - `01[3-9]` then eight digits - so `+880 1712-345678`, `01712345678`
 * and `1712345678` all name the same account. There is **no verification of the number yet**: no SMS
 * provider is configured, so the account claims only that the number was typed.
 */

import { normalizeEmail } from '../auth/tokens';

/** `customer.email` is bounded at 254 by a CHECK constraint; mirror it here. */
export const MAX_EMAIL_LENGTH = 254;

/** The schema's `customer_phone_format` check, mirrored here. */
const PHONE_PATTERN = /^01[3-9][0-9]{8}$/;

/** `customer.display_name` is bounded at 80 by a CHECK constraint. */
export const MAX_DISPLAY_NAME_LENGTH = 80;

/**
 * A conservative address shape.
 *
 * Deliberately simple: it rejects whitespace, requires a single `@`, a dotted domain and a plausible
 * TLD. The authority on whether an address exists is the person reading it, and no verification mail
 * is sent at launch (ADR 0012), so this only stops obvious typos.
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

/** Normalised email, or `null` when absent, malformed or over the length bound. */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = normalizeEmail(value);
  if (email === '' || email.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

/**
 * A Bangladeshi mobile number in the schema's 11-digit form, or `null`.
 *
 * Deliberately strict about the digits and permissive about how a person types them: spaces, dashes
 * and brackets are dropped, an `880` country prefix is removed, and a bare 10-digit subscriber number
 * gains its leading zero. What is stored is the canonical form, so the unique index on `phone` is the
 * same value for the same number however it was entered.
 */
export function parsePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/[^0-9]/g, '');
  if (digits.startsWith('880')) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  if (!PHONE_PATTERN.test(digits)) return null;
  return digits;
}

/**
 * Optional display name.
 *
 * An empty value normalises to `null` rather than `''`, so "absent" has exactly one representation
 * and a blank name cannot be mistaken for a name.
 */
export function parseDisplayName(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized === '') return { ok: true, value: null };
  if (normalized.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false };
  return { ok: true, value: normalized };
}

/** The submitted password, or `null` when it is not a string. Length policy is separate. */
export function parsePassword(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
