/**
 * POST /api/checkout/order - create a Cash on Delivery order.
 *
 * The one place an order comes into existence. The request carries **ids and quantities plus delivery
 * contact**, and optionally a promotion code; it can carry no price, no discount, no total, no
 * availability and no payment method, because nothing here reads one. `createOrder` resolves every line
 * from database state, and the totals the customer is shown afterwards are the ones the server computed.
 *
 * **Two ways in (Phase 42).** A signed-in customer posts through the session-bound guard, as before. When
 * the owner has enabled guest ordering, an anonymous visitor may post the same form: there is no session
 * to bind a CSRF token to, so that path relies on the same-origin check, the per-render idempotency key
 * (an unguessable submission handle) and the order's own validation. `createOrder` is told there is no
 * customer, so the order is written with `customer_id = null` - never attributed to somebody else.
 *
 * A refusal is a redirect back to the checkout page with a fixed notice code - never a table of reasons
 * that would distinguish a hidden product from an out-of-stock one.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { CHECKOUT_PATH, CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { customerLoginUrl, guardCustomerMutation } from '@/server/customer-auth/guard';
import { isSameOrigin } from '@/server/auth/request-guards';
import { notifyOrderPlaced } from '@/server/integrations/telegram';
import { OrderRefusalError, createOrder } from '@/server/orders/create';
import {
  orderFingerprint,
  parseCartLines,
  parseContact,
  parseIdempotencyKey,
} from '@/server/orders/validation';
import { loadCheckoutSettings } from '@/server/settings/checkout';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  let form: FormData;
  let customerId: number | null;

  if (guard.ok) {
    form = guard.form;
    customerId = guard.principal.customerId;
  } else if (guard.reason === 'unauthenticated') {
    // Anonymous: allowed only when the owner has switched guest ordering on, and only from this origin.
    const settings = await withTransaction((tx) => loadCheckoutSettings(tx));
    if (!settings.guestOrders) return redirectTo(customerLoginUrl(CHECKOUT_PATH));
    if (!isSameOrigin(request)) return deny(403);

    try {
      form = await request.formData();
    } catch {
      return redirectTo(`${CHECKOUT_PATH}?notice=invalid`);
    }
    customerId = null;
  } else {
    // A signed-in request with a bad CSRF token is a refusal, never a quiet fall-back to guest mode.
    return deny(guard.status);
  }

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

    // The order number is the handle: a signed-in customer gets it under their account, and a guest gets
    // the same confirmation page by number, which is the only receipt a guest can have.
    return redirectTo(`${CUSTOMER_ORDERS_PATH}/${created.orderNumber}?placed=1`);
  } catch (error) {
    if (error instanceof OrderRefusalError) {
      return redirectTo(`${CHECKOUT_PATH}?notice=${error.reason}`);
    }
    throw error;
  }
}
