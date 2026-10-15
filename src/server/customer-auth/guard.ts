/**
 * Server-side access control for the customer surface.
 *
 * Every protected account page and every customer mutation goes through this module. The rules it
 * exists to make unmissable:
 *
 * - **Deny by default.** No principal, or a banned account, is refused. There is no default-allow
 *   branch.
 * - **The actor is derived from the session cookie only.** A customer id, an email or a hidden form
 *   field is never consulted - none of them is even read as an identity.
 * - **Authorization is re-derived per request.** A revoked session or a banned account takes effect on
 *   the next request, because nothing is cached between requests.
 * - **Object-level access is a query predicate, not a UI decision.** Account pages load orders filtered
 *   by the session's `customer_id`; another customer's order returns "not found".
 * - **The boundary is here, not in the UI.**
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { withTransaction } from '@/db/client';

import { csrfTokenMatches, isSameOrigin } from '../auth/request-guards';
import { cookiesMustBeSecure, sessionContextFrom } from '../auth/session';
import { deriveLabeledToken } from '../auth/tokens';
import { CUSTOMER_SESSION_ABSOLUTE_MS, CUSTOMER_SESSION_COOKIE } from './constants';
import { customerLoginUrl, safeCustomerNext } from './paths';
import { readCustomerToken, resolveCustomerSession, type CustomerPrincipal } from './session';

/**
 * The per-session CSRF token, derived from the raw session token exactly as the owner surface does.
 * The label differs so a customer token can never be accepted on an owner route, or the reverse.
 */
export function customerCsrfToken(rawSessionToken: string): string {
  return deriveLabeledToken('queenbees.customer.csrf.v1', rawSessionToken);
}

async function readCustomerCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CUSTOMER_SESSION_COOKIE)?.value;
}

/**
 * Resolves the principal for a Server Component.
 *
 * `cache` means the layout and the page in one request share a single resolution, so a storefront page
 * does not read the session table twice.
 */
export const currentCustomerPrincipal = cache(async (): Promise<CustomerPrincipal | null> => {
  const rawToken = await readCustomerCookie();
  if (rawToken === undefined) return null;
  const resolved = await withTransaction((tx) =>
    resolveCustomerSession(tx, rawToken, customerCsrfToken),
  );
  return resolved?.principal ?? null;
});

/** Resolves the principal for a route handler, reading the cookie from the request itself. */
export async function principalFromRequest(request: Request): Promise<CustomerPrincipal | null> {
  const rawToken = readCustomerToken(request);
  if (rawToken === undefined) return null;
  const resolved = await withTransaction((tx) =>
    resolveCustomerSession(tx, rawToken, customerCsrfToken),
  );
  return resolved?.principal ?? null;
}

// Path validation lives in a pure module so it can be unit-tested without Next.js; re-exported here
// because every caller already imports this guard.
export { customerLoginUrl, safeCustomerNext };

/**
 * Page guard: sends an unauthenticated visitor to sign in, preserving where they were going.
 *
 * No "forbidden" surface exists for a customer: a customer either owns a resource or the resource is
 * not found, so there is nothing to distinguish.
 */
export async function requireCustomerPage(nextPath: string): Promise<CustomerPrincipal> {
  const principal = await currentCustomerPrincipal();
  if (principal === null) redirect(customerLoginUrl(nextPath));
  return principal;
}

export type GuardedCustomerMutation =
  | { ok: true; principal: CustomerPrincipal; csrfToken: string; form: FormData }
  | { ok: false; reason: 'unauthenticated' | 'csrf'; status: number };

/**
 * Route-handler guard for a **state-changing** customer request.
 *
 * Two independent checks after authentication: the same-origin check and the session-bound CSRF token.
 * The body is parsed exactly once, here, so a handler cannot act on form data that was never checked.
 */
export async function guardCustomerMutation(request: Request): Promise<GuardedCustomerMutation> {
  const rawToken = readCustomerToken(request);
  if (rawToken === undefined) return { ok: false, reason: 'unauthenticated', status: 401 };

  const principal = await principalFromRequest(request);
  if (principal === null) return { ok: false, reason: 'unauthenticated', status: 401 };

  if (!isSameOrigin(request)) return { ok: false, reason: 'csrf', status: 403 };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, reason: 'csrf', status: 400 };
  }

  const expected = customerCsrfToken(rawToken);
  if (!csrfTokenMatches(expected, form.get('csrf'))) {
    return { ok: false, reason: 'csrf', status: 403 };
  }

  return { ok: true, principal, csrfToken: expected, form };
}

/**
 * Writes the session cookie. `Secure` whenever the deployment is not local development or test, so a
 * local plain-HTTP sign-in still works while production is protected.
 */
export async function setCustomerSessionCookie(rawToken: string): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(CUSTOMER_SESSION_ABSOLUTE_MS / 1000),
  });
}

/** Clears the session cookie by overwriting it with an empty expiring value, as the owner flow does. */
export async function clearCustomerSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: cookiesMustBeSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export { sessionContextFrom };
export type { CustomerPrincipal };
