/**
 * POST /api/checkout/order - create an order.
 *
 * The one place an order comes into existence. The request carries **ids and quantities plus delivery
 * contact and a payment method**; it can carry no price, no total and no availability, because nothing
 * here reads one. `createOrder` resolves every line from database state, and the totals the customer is
 * shown afterwards are the ones the server computed.
 *
 * A refusal is a redirect back to the checkout page with a fixed notice code - never a table of reasons
 * that would distinguish a hidden product from an out-of-stock one. An unauthenticated submission is
 * sent to sign in with the checkout path preserved; the cart is in the browser, so it survives.
 */

import { sql } from 'drizzle-orm';
import { withTransaction } from '@/db/client';
import { paymentRecipient } from '@/db/schema';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { CHECKOUT_PATH, CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { customerLoginUrl, guardCustomerMutation } from '@/server/customer-auth/guard';
import { OrderRefusalError, createOrder } from '@/server/orders/create';
import {
  orderFingerprint,
  parseCartLines,
  parseContact,
  parseIdempotencyKey,
  parsePaymentClaim,
  parsePaymentMethod,
  type PaymentClaimFields,
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
    recipientPhone: form.get('recipientPhone'),
    addressLine: form.get('addressLine'),
    area: form.get('area'),
    city: form.get('city'),
    postcode: form.get('postcode'),
    deliveryNote: form.get('deliveryNote'),
  });
  const paymentMethod = parsePaymentMethod(form.get('paymentMethod'));
  const idempotencyKey = parseIdempotencyKey(form.get('idempotencyKey'));

  if (lines === null || contact === null || paymentMethod === null || idempotencyKey === null) {
    return redirectTo(`${CHECKOUT_PATH}?notice=invalid`);
  }

  // A prepaid submission carries its claim fields; COD carries none - a claim exists only where a
  // transfer exists to verify. Parsing happens before any write, so nothing partial is stored.
  let claim: PaymentClaimFields | null = null;
  let recipientId = 0;
  if (paymentMethod !== 'cod') {
    claim = parsePaymentClaim({
      senderMsisdn: form.get('senderMsisdn'),
      transactionReference: form.get('transactionReference'),
      claimedAmount: form.get('claimedAmount'),
    });
    if (claim === null) return redirectTo(`${CHECKOUT_PATH}?notice=invalid`);
  }

  try {
    const created = await withTransaction(async (tx) => {
      // The recipient is resolved from owner configuration inside the same transaction, per request:
      // the customer can never name a recipient row, and a missing one refuses the order rather than
      // letting a claim be written against nothing. `createOrder` re-checks that the row is still
      // active and belongs to the chosen method before it uses it.
      const recipient =
        claim === null
          ? null
          : await tx
              .select({ id: paymentRecipient.id })
              .from(paymentRecipient)
              .where(sql`${paymentRecipient.method} = ${paymentMethod} and ${paymentRecipient.isActive}`)
              .limit(1)
              .then((rows) => rows[0]?.id ?? null);
      if (claim !== null && recipient === null) {
        throw new OrderRefusalError(
          'payment_unavailable',
          'no active payment recipient for this method',
        );
      }
      recipientId = recipient ?? 0;

      return createOrder(tx, {
        customerId: principal.customerId,
        idempotencyKey,
        fingerprint: orderFingerprint(lines, contact, paymentMethod, claim),
        lines,
        contact,
        paymentMethod,
        claim: claim === null ? null : { ...claim, paymentRecipientId: recipientId },
      });
    });
    // `placed=1` is what tells the confirmation page to clear the browser cart - and only then.
    return redirectTo(`${CUSTOMER_ORDERS_PATH}/${created.orderNumber}?placed=1`);
  } catch (error) {
    if (error instanceof OrderRefusalError) {
      return redirectTo(`${CHECKOUT_PATH}?notice=${error.reason}`);
    }
    throw error;
  }
}
