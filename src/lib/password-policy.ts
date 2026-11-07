/**
 * Password length bounds.
 *
 * Shared between the server policy (`src/server/auth/password.ts`, which enforces it) and the forms
 * (which state it and set `minLength`). It lives in `src/lib/` rather than in the server module so a
 * client component can import it without pulling a server-only path into the bundle.
 */

/**
 * The owner/staff minimum. Unchanged: an administrative credential may reach every order and every
 * setting, so it keeps the longer floor and the plain length-only rule.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * The customer minimum (2026-11-08): **eight characters, with at least one letter or special
 * character** - a digits-only password is refused. Length is still the main control; the one
 * composition rule exists only to stop a password that is entirely a number.
 */
export const CUSTOMER_PASSWORD_MIN_LENGTH = 8;

/** A bound, not a policy: scrypt cost grows with input size, so an unbounded body is a cheap DoS vector. */
export const PASSWORD_MAX_LENGTH = 200;
