import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterView } from '@/features/account/RegisterView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Customer registration.
 *
 * Two modes, one form: **phone** (the default) requires a Bangladeshi mobile number plus an email
 * address used for recovery and verification, and **email** requires only the address. The account is
 * usable immediately in both modes; the verification mail is not a gate (owner decision, 2026-11-11).
 */
export default async function CustomerRegisterPage({
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

  return <RegisterView next={next} notice={notice} method={method} />;
}
