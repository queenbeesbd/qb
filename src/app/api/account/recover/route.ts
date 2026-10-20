/**
 * POST /api/account/recover - redeem a one-time recovery credential (Phase 23).
 *
 * Unauthenticated and state-changing, so it is protected by a same-origin check, a source-keyed
 * throttle, and a credential with 256 bits of entropy. A successful redemption mints a session, so the
 * customer lands signed in and with a password they chose.
 *
 * There is no CSRF token: the credential **is** the authorisation, it is single-use, and it never travels
 * in a URL, so a cross-site request that could form this body would already need the credential itself.
 * The same-origin check is still applied, because it costs nothing and closes a trivial forgery.
 *
 * Every failure redirects to the same page with the same generic code, so the response never reveals
 * whether a credential existed, expired, was used or was superseded.
 */

import { withTransaction } from '@/db/client';
import { sessionContextFrom } from '@/server/auth/session';
import { isSameOrigin } from '@/server/auth/request-guards';
import {
  CUSTOMER_RECOVERY_PATH,
  CUSTOMER_LOGIN_PATH,
} from '@/server/customer-auth/constants';
import { safeCustomerNext, setCustomerSessionCookie } from '@/server/customer-auth/guard';
import { createCustomerSession, redeemCustomerRecovery } from '@/server/customer-auth/recovery';
import { deny, redirectTo } from '@/app/api/admin/responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_RECOVERY_PATH}?error=invalid`);
  }

  const rawNext = form.get('next');
  const next = safeCustomerNext(typeof rawNext === 'string' ? rawNext : null);
  const token = form.get('token');
  const password = form.get('password');
  if (typeof token !== 'string' || typeof password !== 'string' || token === '' || password === '') {
    return redirectTo(`${CUSTOMER_RECOVERY_PATH}?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const context = sessionContextFrom(request.headers);

  const result = await withTransaction((tx) =>
    redeemCustomerRecovery(tx, {
      rawToken: token.trim(),
      password,
      context,
      createSession: async (customerId) => {
        const session = await createCustomerSession(tx, customerId, context);
        return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
      },
    }),
  );

  if (!result.ok) {
    const code =
      result.failure === 'weak_password'
        ? 'weak'
        : result.failure === 'throttled'
          ? 'throttled'
          : 'invalid';
    // A spent or dead credential is never echoed back into the page.
    return redirectTo(`${CUSTOMER_RECOVERY_PATH}?error=${code}&next=${encodeURIComponent(next)}`);
  }

  await setCustomerSessionCookie(result.rawToken);
  return redirectTo(next === CUSTOMER_LOGIN_PATH ? '/account' : next);
}
