import type { Metadata } from 'next';

import { ResetPasswordView, type ResetNotice } from '@/features/account/ResetPasswordView';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const NOTICES: readonly ResetNotice[] = ['invalid', 'weak', 'mismatch', 'throttled'];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * Two entries to the same form: a mailed recovery link (a token in the query string) and the code a
 * phone-first account receives (the number in the query string, the digits typed).
 *
 * Nothing here validates either - the server does that when the form is submitted, and a dead credential
 * is one generic sentence.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = single(params.token).trim();
  const rawPhone = single(params.phone).trim();
  const notice = single(params.error);
  return (
    <ResetPasswordView
      token={rawToken.length === 0 ? null : rawToken.slice(0, 200)}
      phone={rawPhone.length === 0 ? null : rawPhone.slice(0, 20)}
      notice={(NOTICES as readonly string[]).includes(notice) ? (notice as ResetNotice) : null}
    />
  );
}
