import type { Metadata } from 'next';

import { VerifyPhoneView } from '@/features/account/VerifyPhoneView';
import { safeCustomerNext } from '@/server/customer-auth/guard';

export const metadata: Metadata = { title: 'Verify your number', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * The destination of the registration SMS code.
 *
 * The number is carried in the query string because the code is entered on whatever device received the
 * message, signed in or not; the server re-reads it to find the account, so the value only selects which
 * row to compare the code against. `next` is allowlisted by `safeCustomerNext`, never used raw.
 */
export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPhone = single(params.phone).trim();
  const error = single(params.error);

  return (
    <VerifyPhoneView
      phone={rawPhone.length === 0 ? null : rawPhone.slice(0, 20)}
      next={safeCustomerNext(single(params.next) || null)}
      sent={single(params.sent) === '1'}
      verified={single(params.verified) === '1'}
      notice={error === 'invalid' || error === 'throttled' ? error : null}
    />
  );
}
