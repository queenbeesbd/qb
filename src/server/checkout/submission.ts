/**
 * Who is allowed to submit a checkout form, and the body they submitted.
 *
 * There are exactly two ways in (ADR 0024):
 *
 * - **A signed-in customer** - session-bound CSRF token and the same-origin check, both already
 *   implemented by `guardCustomerMutation`.
 * - **A guest** - allowed only when the owner has switched guest ordering on, and only from this
 *   origin. A guest has no session, so there is no CSRF token to bind; the order's own idempotency key
 *   and validation carry that weight, and the origin check is the second control.
 *
 * **Why this module exists.** The order route and the promotion preview must accept exactly the same
 * callers. They did not: the preview kept the session-only guard after guest ordering shipped, so a
 * guest could fill in the whole form and then have every promotion code refused. Two copies of this
 * branch are how that happens, so there is one copy.
 *
 * A refusal never explains itself beyond a status code, and a signed-in request with a bad CSRF token
 * is **never** quietly treated as a guest.
 */

import { withTransaction } from '@/db/client';

import { isSameOrigin } from '../auth/request-guards';
import { guardCustomerMutation } from '../customer-auth/guard';
import { loadCheckoutSettings } from '../settings/checkout';

export type CheckoutSubmission =
  | { readonly ok: true; readonly form: FormData; readonly customerId: number | null }
  /** No session and guest ordering is off: the caller decides between sign-in and a plain refusal. */
  | { readonly ok: false; readonly kind: 'unauthenticated' }
  /** A session with a bad token, a cross-origin guest post, or an unreadable body. */
  | { readonly ok: false; readonly kind: 'refused'; readonly status: number }
  /** A guest post whose body could not be parsed as a form. */
  | { readonly ok: false; readonly kind: 'invalid_body' };

export async function readCheckoutSubmission(request: Request): Promise<CheckoutSubmission> {
  const guard = await guardCustomerMutation(request);
  if (guard.ok) {
    return { ok: true, form: guard.form, customerId: guard.principal.customerId };
  }

  // A signed-in request that fails CSRF or origin is a refusal, not a guest.
  if (guard.reason === 'csrf') {
    return { ok: false, kind: 'refused', status: guard.status };
  }

  const settings = await withTransaction((tx) => loadCheckoutSettings(tx));
  if (!settings.guestOrders) return { ok: false, kind: 'unauthenticated' };
  if (!isSameOrigin(request)) return { ok: false, kind: 'refused', status: 403 };

  try {
    return { ok: true, form: await request.formData(), customerId: null };
  } catch {
    return { ok: false, kind: 'invalid_body' };
  }
}
