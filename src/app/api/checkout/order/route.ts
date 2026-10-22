/**
 * POST /api/checkout/order - create a Cash on Delivery order.
 *
 * The one place an order comes into existence. The request carries **ids and quantities plus delivery
 * contact**, and optionally a promotion code; it can carry no price, no discount, no total, no
 * availability and no payment method, because nothing here reads one. `createOrder` resolves every line from database state, and the totals the customer is
 * shown afterwards are the ones the server computed.
 *
 * A refusal is a redirect back to the checkout page with a fixed notice code - never a table of reasons
 * that would distinguish a hidden product from an out-of-stock one. An unauthenticated submission is
 * sent to sign in with the checkout path preserved; the cart is in the browser, so it survives.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { notifyOrderPlaced } from '@/server/integrations/telegram';
import { CHECKOUT_PATH, CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { customerLoginUrl, guardCustomerMutation } from '@/server/customer-auth/guard';
import { OrderRefusalError, createOrder } from '@/server/orders/create';
import {
  orderFingerprint,
  parseCartLines,
  parseContact,
  parseIdempotencyKey,
} from '@/server/orders/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') return redirectTo(customerLoginUrl(CHECKOUT_PATH));
    return deny(guard.status);
  }

  const { principal, form } = guard;

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
        customerId: principal.customerId,
        idempotencyKey,
        fingerprint: orderFingerprint(lines, contact, promoCode),
        lines,
        contact,
        promoCode,
      }),
    );
    /*
     * Telling the owner is a **separate, failable act** against a third party, so it is scheduled after
     * the response rather than awaited inside it: the customer never waits for Telegram, a Telegram
     * outage cannot fail or roll back an order, and a replayed submission (the customer's second click)
     * does not ring the owner's phone twice for one order.
     */
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
          // A notification failure is not the customer's problem and is not a reason to change this
          // response: the order exists, and the COD workflow does not depend on a chat app.
        });
      });
    }

    // `placed=1` is what tells the confirmation page to clear the browser cart - and only then.
    return redirectTo(`${CUSTOMER_ORDERS_PATH}/${created.orderNumber}?placed=1`);
  } catch (error) {
    if (error instanceof OrderRefusalError) {
      return redirectTo(`${CHECKOUT_PATH}?notice=${error.reason}`);
    }
    throw error;
  }
}
