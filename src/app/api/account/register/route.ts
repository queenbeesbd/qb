/**
 * POST /api/account/register
 *
 * An unauthenticated state-changing endpoint, so it has no session to bind a CSRF token to and relies
 * on the same-origin check plus throttling, exactly as the owner sign-in route does. On success it also
 * issues the session, so a new customer does not have to sign in again immediately - which matters
 * because the cart lives in the browser and must survive the step.
 *
 * The password is never echoed, never logged and never placed in the redirect target.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMER_REGISTER_PATH } from '@/server/customer-auth/constants';
import { safeCustomerNext, setCustomerSessionCookie } from '@/server/customer-auth/guard';
import { registerCustomer } from '@/server/customer-auth/service';
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
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=invalid`);
  }

  const rawNext = form.get('next');
  const next = safeCustomerNext(typeof rawNext === 'string' ? rawNext : null);
  const password = form.get('password');
  const confirm = form.get('confirmPassword');
  if (typeof password !== 'string' || typeof confirm !== 'string' || password !== confirm) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=mismatch&next=${encodeURIComponent(next)}`);
  }

  const context = sessionContextFrom(request.headers);

  const result = await withTransaction(async (tx) => {
    const registered = await registerCustomer(tx, {
      email: form.get('email'),
      password,
      displayName: form.get('displayName'),
      context,
    });
    if (!registered.ok) return registered;
    const session = await createCustomerSession(tx, registered.customerId, context);
    return { ok: true as const, token: session.token };
  });

  if (!result.ok) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=${result.failure}&next=${encodeURIComponent(next)}`);
  }

  await setCustomerSessionCookie(result.token);
  return redirectTo(next);
}
