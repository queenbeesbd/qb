/**
 * POST /api/checkout/order - create a Cash on Delivery order.
 *
 * The one place an order comes into existence. The request carries **ids and quantities plus delivery
 * contact**, and optionally a promotion code; it can carry no price, no discount, no total, no
 * availability and no payment method, because nothing here reads one. `createOrder` resolves every line
 * from database state, and the totals the customer is shown afterwards are the ones the server computed.
 *
 * **Two ways in (Phase 42), resolved by one shared helper.** A signed-in customer posts through the
 * session-bound guard, as before. When the owner has enabled guest ordering, an anonymous visitor may
 * post the same form: there is no session to bind a CSRF token to, so that path relies on the
 * same-origin check, the per-render idempotency key (an unguessable submission handle) and the order's
 * own validation. `readCheckoutSubmission` is the single definition of that branch, shared with the
 * promotion preview so the two endpoints cannot accept different callers again. `createOrder` is told
 * there is no customer, so the order is written with `customer_id = null` - never attributed to somebody
 * else.
 *
 * A refusal is a redirect back to the checkout page with a fixed notice code - never a table of reasons
 * that would distinguish a hidden product from an out-of-stock one.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { orderReceiptPath } from '@/lib/order-paths';
import { readCheckoutSubmission } from '@/server/checkout/submission';
import { CHECKOUT_PATH } from '@/server/customer-auth/constants';
import { customerLoginUrl } from '@/server/customer-auth/guard';
import { notifyOrderPlaced } from '@/server/integrations/telegram';
import { OrderRefusalError, createOrder } from '@/server/orders/create';
import {
  orderFingerprint,
  parseCartLines,
  parseContact,
  parseIdempotencyKey,
} from '@/server/orders/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const submission = await readCheckoutSubmission(request);
  if (!submission.ok) {
    // No session and guest ordering is off: the D12 behaviour, sign in with the cart preserved.
    if (submission.kind === 'unauthenticated') {
      return redirectTo(customerLoginUrl(CHECKOUT_PATH));
    }
    if (submission.kind === 'invalid_body') {
      return redirectTo(`${CHECKOUT_PATH}?notice=invalid`);
    }
    return deny(submission.status);
  }

  const { form, customerId } = submission;
  const lines = parseCartLines(form.get('lines'));
  const contact = parseContact({
    recipientName: form.get('recipientName'),
    districtCode: form.get('districtCode'),
    recipientPhone: form.get('recipientPhone'),
    addressLine: form.get('addressLine'),
    area: form.get('area'),
    city: form.get('city'),
    postcode: form.get('postcode'),
    deliveryNote: form.get('deliveryNote'),
  });
  const idempotencyKey = parseIdempotencyKey(form.get('idempotencyKey'));
  const rawPromoCode = form.get('promoCode');
  const promoCode = typeof rawPromoCode === 'string' && rawPromoCode.trim() !== '' ? rawPromoCode.trim() : null;

  if (lines === null || contact === null || idempotencyKey === null) {
    return redirectTo(`${CHECKOUT_PATH}?notice=invalid`);
  }

  try {
    const created = await withTransaction((tx) =>
      createOrder(tx, {
        customerId,
        idempotencyKey,
        fingerprint: orderFingerprint(lines, contact, promoCode),
        lines,
        contact,
        promoCode,
      }),
    );

    if (!created.replayed) {
      after(async () => {
        await notifyOrderPlaced({
          orderNumber: created.orderNumber,
          totalMinor: created.totalMinor,
          itemCount: lines.length,
          districtCode: contact.districtCode,
          recipientName: contact.recipientName,
          recipientPhone: contact.recipientPhone,
        }).catch(() => {
          // A notification failure is not the customer's problem and never changes this response.
        });
      });
    }

    // The order number is the handle, and both viewers land on the same receipt: a customer reaches it
    // again from their order list, and a guest - who has no list - keeps this link.
    return redirectTo(orderReceiptPath(created.orderNumber, { placed: true }));
  } catch (error) {
    if (error instanceof OrderRefusalError) {
      return redirectTo(`${CHECKOUT_PATH}?notice=${error.reason}`);
    }
    throw error;
  }
}
