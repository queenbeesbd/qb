import type { Metadata } from 'next';

import { ResetPasswordView, type ResetNotice } from '@/features/account/ResetPasswordView';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const NOTICES: readonly ResetNotice[] = ['invalid', 'weak', 'mismatch', 'throttled', 'missing'];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * The recovery link's destination.
 *
 * The token is read from the query string and posted back by the form; nothing here validates it - the
 * server does that when the form is submitted, and a dead token is one generic sentence.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = single(params.token).trim();
  const notice = single(params.error);
  return (
    <ResetPasswordView
      token={raw.length === 0 ? null : raw.slice(0, 200)}
      notice={(NOTICES as readonly string[]).includes(notice) ? (notice as ResetNotice) : null}
    />
  );
}
