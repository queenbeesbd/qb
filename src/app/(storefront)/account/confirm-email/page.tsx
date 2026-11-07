import type { Metadata } from 'next';

import { ConfirmEmailView } from '@/features/account/ConfirmEmailView';

export const metadata: Metadata = {
  title: 'Confirm your email address',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * The destination of a change-of-address confirmation link (ADR 0030).
 *
 * The link only **offers** the change; the account moves when the button is pressed, so a link preview
 * or a security scanner cannot consume it. Success sends the customer to sign in with the new address,
 * because every session ends with the change.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = single(params.token).trim();
  const error = single(params.error);
  return (
    <ConfirmEmailView
      token={raw.length === 0 ? null : raw.slice(0, 200)}
      notice={error === 'taken' ? 'taken' : error === 'invalid' ? 'invalid' : null}
    />
  );
}
