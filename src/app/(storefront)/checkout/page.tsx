import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { withTransaction } from '@/db/client';
import { CART_COOKIE_NAME, parseCartIds } from '@/features/cart/cart-cookie';
import { selectCartProducts } from '@/features/cart/cart-product';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { getStorefrontCatalog } from '@/server/catalog/storefront';
import { isRepeatCustomer, loadDeliveryRates } from '@/server/delivery/service';
import { loadPaymentInstructions } from '@/server/settings/payment';
import { CHECKOUT_PATH, CUSTOMER_SESSION_COOKIE } from '@/server/customer-auth/constants';
import { currentCustomerPrincipal, requireCustomerPage } from '@/server/customer-auth/guard';
import { loadCheckoutSettings } from '@/server/settings/checkout';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Checkout.
 *
 * D12: ordering requires an account, so an unauthenticated visitor is sent to sign in with the checkout
 * path preserved - the cart lives in the browser, so it survives the step and the customer lands back
 * here.
 *
 * **Cash on Delivery only (Phase 17).** Nothing on this page reads a payment-recipient configuration,
 * because there is no prepaid method to configure: the schema's recipient and claim tables stay as
 * implemented, unused design. The payment card publishes the shop's **static** advance-payment notice
 * (owner decision, 2026-11-10) and the owner's bKash number - copy the owner confirms on the phone, not
 * a method the order records. The owner decides whether the number block is drawn at all
 * (`payment.bkash_visible`).
 *
 * The idempotency key is minted **once per page render** and carried in the form. A double submission of
 * the same rendered form is therefore the same submission and returns the original order, while a fresh
 * visit is a new attempt. The key is not a secret; it is a submission handle.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * Guest ordering (Phase 42) is the owner's switch, not a default. With no session there is nothing to
   * sign in with, so the only question is whether the owner allows a guest to order; when they do not,
   * this is the D12 behaviour unchanged - sign in, come back, cart intact.
   *
   * The session is **resolved**, not assumed from the cookie's presence. A cookie that no longer
   * resolves - expired, revoked, rotated - is not a session, and reading it as one sent that visitor to
   * the sign-in page even with guest ordering on, while the order route treated the very same request as
   * anonymous. The page and the route now agree: no principal means a guest, and only the owner's own
   * policy can send that visitor to sign in.
   */
  const sessionCookie = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const hasSessionCookie = sessionCookie !== undefined && sessionCookie !== '';
  const principal = hasSessionCookie ? await currentCustomerPrincipal() : null;

  if (principal === null) {
    const { guestOrders } = await withTransaction((tx) => loadCheckoutSettings(tx));
    if (!guestOrders) await requireCustomerPage(CHECKOUT_PATH);
  }

  const params = await searchParams;
  const notice = typeof params.notice === 'string' ? params.notice : null;
  /*
   * The pricing rules and this customer's standing are read together: the delivery hierarchy, the
   * automatic repeat discount and the payment block all depend on the same two facts - is there a
   * session, and has that account completed a purchase before.
   */
  const { rates, repeatCustomer, payment } = await withTransaction(async (tx) => ({
    rates: await loadDeliveryRates(tx),
    repeatCustomer: await isRepeatCustomer(tx, principal?.customerId ?? null),
    payment: await loadPaymentInstructions(tx),
  }));
  /*
   * Checkout draws the cart's lines, so it is the other route that needs product records - and, like
   * /cart, it asks for the ones the cart names rather than for the whole catalog (Phase 45b). The
   * cookie's ids are validated against the catalog before anything is projected.
   */
  const cartIds = parseCartIds((await cookies()).get(CART_COOKIE_NAME)?.value);
  const catalog = await getStorefrontCatalog();

  return (
    <CheckoutForm
      csrfToken={principal?.csrfToken ?? null}
      idempotencyKey={randomUUID()}
      notice={notice}
      customerEmail={principal?.email ?? null}
      pricing={{
        defaultMinor: rates.defaultMinor,
        overrides: Object.fromEntries(rates.overrides),
        conditional: rates.conditional ?? {
          enabled: false,
          minSubtotalMinor: null,
          dhakaMinor: null,
          chattogramMinor: null,
          othersMinor: null,
        },
        repeat: rates.repeat ?? { enabled: false, chattogramMinor: null, othersMinor: null },
        repeatDiscount: rates.repeatDiscount ?? {
          enabled: false,
          percent: null,
          minSubtotalMinor: null,
        },
      }}
      customer={{ authenticated: principal !== null, repeatCustomer }}
      payment={{
        bkashNumber: payment.bkashNumber,
        bkashVisible: payment.bkashVisible,
        sendMoneyNote: payment.sendMoneyNote,
        advanceThresholdMinor: payment.advanceThresholdMinor,
      }}
      products={selectCartProducts(catalog.products, cartIds)}
    />
  );
}
