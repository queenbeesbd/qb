/**
 * POST /api/account/reset - choose a new password from a mailed link or a six-digit SMS code.
 *
 * Unauthenticated and state-changing: the token or the code **is** the authorisation, so the controls
 * are the credential itself (a 256-bit link that dies after an hour, a six-digit code that dies after
 * ten minutes or five wrong guesses), a same-origin check and a source-keyed redemption throttle. The
 * password never travels in the URL and is never echoed back.
 *
 * Every refusal is one code on the same page: an unknown, expired, reused or superseded credential is
 * indistinguishable, so this endpoint cannot be used to probe whether an account or a code ever existed.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_RESET_PATH } from '@/server/customer-auth/constants';
import {
  resetCustomerPasswordWithCode,
  resetCustomerPasswordWithToken,
} from '@/server/customer-auth/account-security';

export const dynamic = 'force-dynamic';

function backTo(token: string, phone: string, code: string): Response {
  const params = new URLSearchParams();
  if (token !== '') params.set('token', token);
  if (phone !== '') params.set('phone', phone);
  params.set('error', code);
  return redirectTo(`${CUSTOMER_RESET_PATH}?${params.toString()}`);
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
  const rawPhone = form.get('phone');
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  const password = form.get('password');
  const confirm = form.get('confirm');

  if (token === '' && phone === '') return redirectTo(`${CUSTOMER_RESET_PATH}?error=invalid`);
  if (typeof password !== 'string' || password !== confirm) return backTo(token, phone, 'mismatch');

  const context = sessionContextFrom(request.headers);
  const result =
    token !== ''
      ? await withTransaction((tx) =>
          resetCustomerPasswordWithToken(tx, { rawToken: token, password, context }),
        )
      : await withTransaction((tx) =>
          resetCustomerPasswordWithCode(tx, {
            phone,
            code: form.get('code'),
            password,
            context,
          }),
        );

  if (!result.ok) {
    const code =
      result.failure === 'weak_password'
        ? 'weak'
        : result.failure === 'throttled'
          ? 'throttled'
          : 'invalid';
    return backTo(token, phone, code);
  }

  // No session is minted here: the customer proves the new password at the sign-in form, which is also
  // the first evidence that the change is usable.
  return redirectTo('/account/login?notice=resetDone');
}
