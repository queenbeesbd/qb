/**
 * Opaque token and digest primitives.
 *
 * Everything here is a pure function over Node's crypto module: no database, no request, no
 * environment. That keeps the security-critical arithmetic testable in isolation, and it is the
 * only module that decides how a secret is represented at rest.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Label mixed into the derived CSRF token. Versioned so the derivation can be rotated without
 * invalidating sessions issued under the old label (they simply fail the new comparison).
 */
const CSRF_LABEL = 'queenbees.staff.csrf.v1';

/** Token shape: 32 random bytes, base64url. Rejected before any database lookup if it differs. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 256 bits of entropy, base64url so it is safe in a cookie value. */
export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A numeric one-time code, for delivery over a channel that can carry only a few digits.
 *
 * Six digits are small enough to type from an SMS and large enough that guessing needs a throttle; the
 * digest that is stored is keyed (see the SMS integration), so the number space is not the only
 * defence. `randomInt` is uniform, unlike `Math.random`, and every position including a leading zero
 * is random.
 */
export function createNumericCode(length = 6): string {
  let code = '';
  for (let index = 0; index < length; index += 1) code += String(randomInt(0, 10));
  return code;
}

/**
 * The single digest form for anything secret or pseudonymous: session tokens, recovery tokens and
 * throttle subjects. One function means a stored digest can never be computed two different ways,
 * which would silently break lookups and revocation.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Derives the per-session CSRF token from the raw session token.
 *
 * No extra column and no extra secret: the raw token is a 256-bit value that only the server and the
 * holder's httpOnly cookie know, so a value keyed by it cannot be forged by a cross-site attacker
 * who cannot read the cookie. The derived token is never persisted.
 */
export function deriveCsrfToken(rawSessionToken: string): string {
  return deriveLabeledToken(CSRF_LABEL, rawSessionToken);
}

/**
 * Derives a per-session token under an explicit label.
 *
 * The customer surface uses its own label (`queenbees.customer.csrf.v1`), so a token derived for one
 * principal can never be accepted for the other even if the two ever shared a session value by
 * accident. The label is a constant defined in code, never request data.
 */
export function deriveLabeledToken(label: string, rawSessionToken: string): string {
  return createHmac('sha256', rawSessionToken).update(label).digest('hex');
}

/** Constant-time comparison for equal-length secrets. Length mismatch or empty fails closed. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Email normalisation for lookup, throttling and comparison. The address itself is stored as given. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** True when a value has the shape of one of our tokens. A predicate, not a validator. */
export function looksLikeToken(value: string): value is string {
  return TOKEN_PATTERN.test(value);
}
