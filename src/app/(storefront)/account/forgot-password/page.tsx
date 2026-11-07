import type { Metadata } from 'next';

import { ForgotPasswordView } from '@/features/account/ForgotPasswordView';
import { safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * The self-service recovery request (ADR 0030).
 *
 * A signed-in visitor is not shown this page - they can change the password from the account page - but
 * it does not redirect either: a customer who follows an old link is simply told to sign in.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const sent = params.sent === '1';
  return <ForgotPasswordView next={next} sent={sent} />;
}
