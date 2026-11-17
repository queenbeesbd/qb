/**
 * POST /api/orders/[orderNumber]/proof - attach or replace the payment screenshot (ADR 0042).
 *
 * **Why this exists beside checkout.** The owning shop's own notice tells a customer to send the
 * screenshot on WhatsApp, and an advance payment is usually made *around* the order rather than before
 * it. A field that only existed on the checkout form would therefore be empty exactly when the customer
 * finally pays. The receipt is the one page they still hold afterwards, so it carries the same optional
 * field.
 *
 * **Who may post.** Exactly who may read the receipt: the signed-in customer the order belongs to, or
 * anyone holding a guest order's number. That is the same handle the receipt already depends on, and the
 * order number is an unguessable token rather than a sequence. What the attachment grants is nothing -
 * it changes no order column, and the owner decides what it means.
 *
 * A signed-in request with a bad CSRF token is a refusal, **never** quietly treated as a guest (the rule
 * `readCheckoutSubmission` settled). A guest post must be same-origin.
 *
 * Every outcome is a redirect to the receipt with a fixed notice code, so nothing here can be used to
 * enumerate orders or to echo a submitted value back into the page.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { guardCustomerMutation } from '@/server/customer-auth/guard';
import { attachProof, proofTarget } from '@/server/orders/proof';
import { saveProof } from '@/server/orders/proof-upload';
import { loadPaymentInstructions } from '@/server/settings/payment';

export const dynamic = 'force-dynamic';

/** The receipt route. Bounded and allowlisted by shape so the redirect cannot become an open redirect. */
function receiptPath(orderNumber: string, proof: string): string | null {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(orderNumber)) return null;
  return `/orders/${orderNumber}?proof=${proof}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
): Promise<Response> {
  const { orderNumber } = await context.params;
  const reference = orderNumber.slice(0, 64);

  const guard = await guardCustomerMutation(request);
  let form: FormData;
  let viewerCustomerId: number | null;
  if (guard.ok) {
    form = guard.form;
    viewerCustomerId = guard.principal.customerId;
  } else {
    // A signed-in caller that failed CSRF is a refusal, not a guest.
    if (guard.reason === 'csrf') return deny(guard.status);
    if (!isSameOrigin(request)) return deny(403);
    try {
      form = await request.formData();
    } catch {
      return deny(400);
    }
    viewerCustomerId = null;
  }

  const back = (notice: string): Response => {
    const path = receiptPath(reference, notice);
    return path === null ? deny(404) : redirectTo(path);
  };

  const { proofEnabled } = await withTransaction((tx) => loadPaymentInstructions(tx));
  if (!proofEnabled) return back('unavailable');

  const upload = form.get('paymentProof');
  if (!(upload instanceof File) || upload.size === 0) return back('invalid');

  let asset;
  try {
    asset = await saveProof(upload);
  } catch {
    return back('invalid');
  }

  const attached = await withTransaction(async (tx) => {
    const target = await proofTarget(tx, viewerCustomerId, reference);
    if (target === null) return false;
    await attachProof(tx, target, asset);
    return true;
  });

  return attached ? back('uploaded') : deny(404);
}
