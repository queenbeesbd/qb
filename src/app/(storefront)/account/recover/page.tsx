import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RecoverView } from '@/features/account/RecoverView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = {
  title: 'Account recovery',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * The one-time credential entry point.
 *
 * Deliberately **not** a customer-facing "forgot password" link: there is no self-service reset and no
 * provider to deliver one (ADR 0012), so this page does nothing until the owner has read a credential
 * aloud. The page says that plainly rather than pretending to send something. A signed-in visitor is
 * sent back to their account, because recovery is not a step an authenticated customer needs.
 */
export default async function CustomerRecoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const notice = typeof params.error === 'string' ? params.error : null;

  const principal = await currentCustomerPrincipal();
  if (principal !== null) redirect(next);

  return <RecoverView next={next} notice={notice} />;
}
