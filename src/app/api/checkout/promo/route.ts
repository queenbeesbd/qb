/**
 * POST /api/checkout/promo - what a promotion code would take off this cart, right now.
 *
 * A read that happens to be a POST: the cart lives in the browser, so the lines have to be sent, and a
 * GET with a cart in the query string would put order contents in the URL and in every log on the way.
 * It writes nothing. The code is re-resolved against the stored rule and the **same** line pricing order
 * creation uses, so the discount shown here is the discount the order will carry.
 *
 * **Who may ask.** Exactly the callers the order route accepts, through the same resolver
 * (`readCheckoutSubmission`): a signed-in customer with a session-bound CSRF token, or a guest while
 * the owner's guest-ordering switch is on, from this origin. The preview originally required a session,
 * which survived guest checkout shipping and made every code fail for a guest with no explanation - the
 * form offered a control that could never succeed.
 *
 * The answer is a plain JSON result, including the refusal reason, because the form turns each reason
 * into a sentence the customer can act on. It never discloses whether a *different* code exists: an
 * unknown code and a paused one are both "that code cannot be used".
 */

import { withTransaction } from '@/db/client';
import { deny, json } from '@/app/api/admin/responses';
import { readCheckoutSubmission } from '@/server/checkout/submission';
import { OrderRefusalError, resolveOrderLines } from '@/server/orders/create';
import { parseCartLines } from '@/server/orders/validation';
import { resolvePromo } from '@/server/promotions/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const submission = await readCheckoutSubmission(request);
  if (!submission.ok) {
    // The form maps these to a sentence; the status alone never says which check failed.
    if (submission.kind === 'unauthenticated') {
      return json({ ok: false, reason: 'unauthenticated' }, 401);
    }
    if (submission.kind === 'invalid_body') {
      return json({ ok: false, reason: 'invalid_cart' }, 400);
    }
    return deny(submission.status);
  }

  const { form } = submission;
  const lines = parseCartLines(form.get('lines'));
  if (lines === null) return json({ ok: false, reason: 'invalid_cart' }, 400);

  const result = await withTransaction(async (tx) => {
    const { subtotalMinor } = await resolveOrderLines(tx, lines);
    return resolvePromo(tx, form.get('promoCode'), subtotalMinor, { lock: false });
  }).catch((error: unknown) => {
    // A cart that is no longer orderable is a cart-level answer, not a promotion answer.
    if (error instanceof OrderRefusalError) return { ok: false as const, reason: 'unavailable' as const };
    throw error;
  });

  if (!result.ok) return json({ ok: false, reason: result.reason });
  return json({ ok: true, code: result.code, discountMinor: result.discountMinor });
}
