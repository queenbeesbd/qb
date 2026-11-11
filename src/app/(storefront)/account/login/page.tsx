import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginView } from '@/features/account/LoginView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Customer sign-in by phone (the default) or email. Already-authenticated visitors skip the form. */
export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const notice = typeof params.error === 'string' ? params.error : null;
  const method = params.method === 'email' ? 'email' : 'phone';

  const principal = await currentCustomerPrincipal();
  if (principal !== null) redirect(next);

  return <LoginView next={next} notice={notice} method={method} />;
}
