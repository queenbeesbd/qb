/**
 * POST /api/account/register - step 3: create the account.
 *
 * The account exists only now, and only for the identifier that was proved in step 2: the sign-up
 * cookie's ticket is consumed by a guarded `UPDATE ... WHERE consumed_at IS NULL`, then the customer
 * row is written with `email_verified_at` or `phone_verified_at` already set (ADR 0038).
 *
 * Unauthenticated and state-changing, so it relies on the same-origin check, the CSRF-free cookie the
 * steps share, and throttling by source. On success it also issues the session, so a new customer does
 * not have to sign in again - the cart lives in the browser and must survive the step.
 *
 * The password is never echoed, never logged and never placed in the redirect target.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMER_REGISTER_PATH } from '@/server/customer-auth/constants';
import { setCustomerSessionCookie } from '@/server/customer-auth/guard';
import { completeRegistration } from '@/server/customer-auth/registration';
import { createCustomerSession } from '@/server/customer-auth/session';
import { clearSignupState, readSignupState } from '@/server/customer-auth/signup-cookie';
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

  const state = await readSignupState();
  if (state === null || state.ticket === null) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=session`);
  }

  const password = form.get('password');
  const confirm = form.get('confirmPassword');
  if (typeof password !== 'string' || typeof confirm !== 'string' || password !== confirm) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=mismatch`);
  }

  const context = sessionContextFrom(request.headers);

  const result = await withTransaction(async (tx) => {
    const registered = await completeRegistration(tx, {
      ticket: state.ticket,
      password,
      displayName: form.get('displayName'),
      context,
    });
    if (!registered.ok) return registered;
    const session = await createCustomerSession(tx, registered.customerId, context);
    return { ok: true as const, token: session.token };
  });

  if (!result.ok) {
    // A dead ticket means the code step has to be done again; every other refusal keeps the ticket.
    if (result.failure === 'invalid_ticket') {
      await clearSignupState();
      return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=session`);
    }
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=${result.failure}`);
  }

  await clearSignupState();
  await setCustomerSessionCookie(result.token);
  return redirectTo(state.next);
}
