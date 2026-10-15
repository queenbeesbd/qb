import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginView } from '@/features/account/LoginView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'সাইন ইন', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Customer sign-in. An already-authenticated visitor is sent straight to the return path. */
export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const notice = typeof params.error === 'string' ? params.error : null;

  const principal = await currentCustomerPrincipal();
  if (principal !== null) redirect(next);

  return <LoginView next={next} notice={notice} />;
}
