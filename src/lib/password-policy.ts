/**
 * Password length bounds.
 *
 * Shared between the server policy (`src/server/auth/password.ts`, which enforces it) and the forms
 * (which state it and set `minLength`). It lives in `src/lib/` rather than in the server module so a
 * client component can import it without pulling a server-only path into the bundle.
 */

/** Length is the only requirement - no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;

/** A bound, not a policy: scrypt cost grows with input size, so an unbounded body is a cheap DoS vector. */
export const PASSWORD_MAX_LENGTH = 200;
