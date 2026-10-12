import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ADMIN_ROOT } from '@/server/auth/constants';
import { currentStaffPrincipal } from '@/server/auth/guard';
import { RedeemView, type RedeemError } from './RedeemView';

export const metadata: Metadata = {
  title: 'Set password',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const ERRORS: readonly string[] = ['invalidToken', 'weakPassword', 'mismatch', 'accountDisabled'];

/**
 * The credential redemption page.
 *
 * The token is deliberately **not** read from the query string: it is typed or pasted into the form
 * and submitted in the body, so it never appears in browser history, a referrer header, a proxy log
 * or a shared link. A token arriving as `?token=...` is therefore not honoured, which is the safer
 * default even though it is slightly less convenient.
 *
 * The `error` parameter carries a fixed code, never a message, so the page cannot reflect
 * attacker-controlled text.
 */
export default async function AdminRedeemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await currentStaffPrincipal();
  if (principal !== null) redirect(ADMIN_ROOT);

  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error: RedeemError = rawError !== undefined && ERRORS.includes(rawError) ? (rawError as RedeemError) : null;
  const done = params.done === '1';

  return <RedeemView error={error} token="" done={done} />;
}
