import type { Metadata } from 'next';

import { VerifyEmailView } from '@/features/account/VerifyEmailView';

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
 * The destination of a registration verification link (owner decision, 2026-11-11).
 *
 * The link only **offers** the confirmation; the address is marked verified when the button is pressed,
 * so a link preview or a security scanner cannot consume it. `verified=1` is the post-redirect state.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = single(params.token).trim();
  const verified = single(params.verified) === '1';
  const error = single(params.error);

  return (
    <VerifyEmailView
      token={raw.length === 0 ? null : raw.slice(0, 200)}
      verified={verified}
      notice={error === 'invalid' ? 'invalid' : null}
    />
  );
}
