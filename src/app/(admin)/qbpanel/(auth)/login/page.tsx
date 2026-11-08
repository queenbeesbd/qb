import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { currentStaffPrincipal } from '@/server/auth/guard';
import { ADMIN_ROOT } from '@/server/auth/constants';
import { safeReturnPath } from '@/server/auth/request-guards';
import { LoginView, type LoginError } from './LoginView';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The sign-in page.
 *
 * An already-authenticated visitor is sent to the admin root, so signing in twice cannot leave two
 * sessions. The `next` parameter is validated by `safeReturnPath` before it is rendered, so the form
 * cannot be used as an open redirect.
 *
 * The `error` parameter carries a fixed code, never a message: a reflected string would be an
 * injection surface and could be crafted to disclose whether an account exists.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await currentStaffPrincipal();
  if (principal !== null) redirect(ADMIN_ROOT);

  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error: LoginError = rawError === 'throttled' ? 'throttled' : rawError === 'invalid' ? 'invalid' : null;

  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  // Validated here, not in the form: only a same-origin `/qbpanel/...` path survives, so the sign-in
  // page cannot be turned into an open redirect.
  const next = safeReturnPath(rawNext);

  return <LoginView error={error} next={next} />;
}
