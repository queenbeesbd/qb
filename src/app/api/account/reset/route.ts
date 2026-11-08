/**
 * POST /api/account/reset - choose a new password from a mailed recovery link.
 *
 * Unauthenticated and state-changing: the token **is** the authorisation, so the controls are the token
 * itself (256 bits, single-use, one hour), a same-origin check and a source-keyed redemption throttle.
 * The password never travels in the URL and is never echoed back.
 *
 * Every refusal is one code on the same page: an unknown, expired, reused or superseded link is
 * indistinguishable, so this endpoint cannot be used to probe whether a token ever existed.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_RESET_PATH } from '@/server/customer-auth/constants';
import { resetCustomerPasswordWithToken } from '@/server/customer-auth/email-security';

export const dynamic = 'force-dynamic';

function backTo(token: string, code: string): Response {
  return redirectTo(`${CUSTOMER_RESET_PATH}?token=${encodeURIComponent(token)}&error=${code}`);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_RESET_PATH}?error=invalid`);
  }

  const rawToken = form.get('token');
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  const password = form.get('password');
  const confirm = form.get('confirm');

  if (token === '') return redirectTo(`${CUSTOMER_RESET_PATH}?error=invalid`);
  if (typeof password !== 'string' || password !== confirm) return backTo(token, 'mismatch');

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    resetCustomerPasswordWithToken(tx, { rawToken: token, password, context }),
  );

  if (!result.ok) {
    return backTo(token, result.failure === 'weak_password' ? 'weak' : result.failure === 'throttled' ? 'throttled' : 'invalid');
  }

  // No session is minted here: the customer proves the new password at the sign-in form, which is also
  // the first evidence that the change is usable.
  return redirectTo('/account/login?notice=resetDone');
}
