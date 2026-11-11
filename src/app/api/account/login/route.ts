/**
 * POST /api/account/login
 *
 * Unauthenticated and state-changing, so it is protected by a same-origin check, throttling by account
 * and by source, and a generic failure that never reveals whether an address has an account. A session
 * is minted only on success, so an existing anonymous cookie is never promoted.
 *
 * Recovery is a separate, self-service flow (ADR 0030) that only ends by sending the customer back here
 * with a new password: this route remains the only place a customer session is minted from a password.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMER_LOGIN_PATH } from '@/server/customer-auth/constants';
import { safeCustomerNext, setCustomerSessionCookie } from '@/server/customer-auth/guard';
import { signInCustomer } from '@/server/customer-auth/service';
import { createCustomerSession } from '@/server/customer-auth/session';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_LOGIN_PATH}?error=invalid`);
  }

  const rawNext = form.get('next');
  const next = safeCustomerNext(typeof rawNext === 'string' ? rawNext : null);
  const method = form.get('method');
  const identifier = form.get('identifier');
  const password = form.get('password');
  if (
    typeof identifier !== 'string' ||
    identifier.trim() === '' ||
    typeof password !== 'string' ||
    password === ''
  ) {
    const back = typeof method === 'string' && method === 'email' ? '&method=email' : '';
    return redirectTo(`${CUSTOMER_LOGIN_PATH}?error=invalid&next=${encodeURIComponent(next)}${back}`);
  }

  const context = sessionContextFrom(request.headers);

  const result = await withTransaction((tx) =>
    signInCustomer(tx, {
      method,
      identifier,
      password,
      context,
      createSession: async (customerId) => {
        const session = await createCustomerSession(tx, customerId, context);
        return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
      },
    }),
  );

  if (!result.ok) {
    const code = result.failure === 'throttled' ? 'throttled' : 'invalid';
    const back = typeof method === 'string' && method === 'email' ? '&method=email' : '';
    return redirectTo(`${CUSTOMER_LOGIN_PATH}?error=${code}&next=${encodeURIComponent(next)}${back}`);
  }

  // The raw token is placed in the cookie here and nowhere else.
  await setCustomerSessionCookie(result.rawToken);
  return redirectTo(next);
}
