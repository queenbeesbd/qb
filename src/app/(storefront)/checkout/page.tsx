import type { Metadata } from 'next';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withTransaction } from '@/db/client';
import { paymentRecipient } from '@/db/schema';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { CHECKOUT_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';

export const metadata: Metadata = {
  title: 'চেকআউট',
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

  // The configured recipients, read from the database at render. A method without a configured
  // recipient **cannot be chosen**: no instructions are shown and no invented number is displayed
  // (ADR 0014) - the form renders that method as unavailable instead.
  const recipients = await withTransaction((tx) =>
    tx
      .select({ method: paymentRecipient.method, accountNumber: paymentRecipient.accountNumber, accountLabel: paymentRecipient.accountLabel })
      .from(paymentRecipient)
      .where(sql`${paymentRecipient.isActive}`),
  );

  return (
    <CheckoutForm
      csrfToken={principal.csrfToken}
      idempotencyKey={randomUUID()}
      notice={notice}
      customerEmail={principal.email}
      recipients={recipients.map((row) => ({
        method: row.method,
        accountNumber: row.accountNumber,
        accountLabel: row.accountLabel,
      }))}
    />
  );
}
