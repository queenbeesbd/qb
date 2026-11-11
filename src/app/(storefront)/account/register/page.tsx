import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterView } from '@/features/account/RegisterView';
import { currentCustomerPrincipal, safeCustomerNext } from '@/server/customer-auth/guard';
import { readSignupState } from '@/server/customer-auth/signup-cookie';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Customer registration - three steps, and the account is created at the **end** (ADR 0038).
 *
 * 1. choose a mobile number or an email address and ask for a code;
 * 2. enter the six-digit code;
 * 3. choose a password and a name.
 *
 * The step is derived from the httpOnly sign-up cookie, never from the URL, so a refreshed page lands
 * where the person actually is and an identifier never appears in the address bar. The account exists
 * only after step 3; until then the pending row is the only record.
 */
export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeCustomerNext(typeof params.next === 'string' ? params.next : null);
  const notice = typeof params.error === 'string' ? params.error : null;
  const sent = params.sent === '1';

  const principal = await currentCustomerPrincipal();
  if (principal !== null) redirect(next);

  const signup = await readSignupState();
  const step = signup === null ? 'identifier' : signup.ticket === null ? 'code' : 'password';
  const method = signup === null ? (params.method === 'email' ? 'email' : 'phone') : signup.channel;

  return (
    <RegisterView
      step={step}
      method={method}
      identifier={signup?.identifier ?? null}
      next={next}
      notice={notice}
      sent={sent}
    />
  );
}
