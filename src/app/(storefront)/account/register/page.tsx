import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterView } from '@/features/account/RegisterView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'অ্যাকাউন্ট খুলুন', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Customer registration: email and password only. There is no verification mail and no reset flow. */
export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const notice = typeof params.error === 'string' ? params.error : null;

  const principal = await currentCustomerPrincipal();
  if (principal !== null) redirect(next);

  return <RegisterView next={next} notice={notice} />;
}
