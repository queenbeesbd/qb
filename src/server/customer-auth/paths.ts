/**
 * Customer return-path validation.
 *
 * Pure functions with no database and no request object, so the rule is unit-testable directly: only a
 * same-origin, relative path inside the customer tree - or the checkout page, or one order receipt -
 * may be used as a post-authentication return target. Everything else resolves to the account root, so
 * the sign-in form cannot become an open redirect or an exfiltration vector.
 */

import {
  ACCOUNT_ROOT,
  CHECKOUT_PATH,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_PATH_PATTERN,
  RECEIPT_PATH_PATTERN,
} from './constants';

export function safeCustomerNext(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined || candidate === '') return ACCOUNT_ROOT;
  // An absolute URL, or a protocol-relative `//host` form, is never accepted.
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return ACCOUNT_ROOT;
  // A backslash is treated as a path separator by some browsers; reject rather than normalise.
  if (candidate.includes('\\')) return ACCOUNT_ROOT;
  // An encoded separator could be decoded downstream into a new path segment.
  if (/%2f|%5c/i.test(candidate)) return ACCOUNT_ROOT;
  // Query and fragment are dropped: customer routes carry no state in the URL.
  const path = candidate.split('?')[0]?.split('#')[0] ?? '';
  if (path === CHECKOUT_PATH) return CHECKOUT_PATH;
  // A guest who is asked to sign in from their receipt returns to it, so the claim is one tap away.
  if (RECEIPT_PATH_PATTERN.test(path)) return path;
  if (CUSTOMER_PATH_PATTERN.test(path)) return path;
  return ACCOUNT_ROOT;
}

/** The sign-in URL for a return path, already validated. */
export function customerLoginUrl(next: string | null | undefined): string {
  return `${CUSTOMER_LOGIN_PATH}?next=${encodeURIComponent(safeCustomerNext(next))}`;
}
