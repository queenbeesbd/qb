import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import { withTransaction } from '@/db/client';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { loadDeliveryRates } from '@/server/delivery/service';
import { CHECKOUT_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';

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
 * implemented, unused design.
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
  const principal = await requireCustomerPage(CHECKOUT_PATH);
  const params = await searchParams;
  const notice = typeof params.notice === 'string' ? params.notice : null;
  const rates = await withTransaction((tx) => loadDeliveryRates(tx));

  return (
    <CheckoutForm
      csrfToken={principal.csrfToken}
      idempotencyKey={randomUUID()}
      notice={notice}
      customerEmail={principal.email}
      delivery={{
        defaultMinor: rates.defaultMinor,
        overrides: Object.fromEntries(rates.overrides),
      }}
    />
  );
}
