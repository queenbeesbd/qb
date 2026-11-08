/**
 * POST /api/qbpanel/session/redeem
 *
 * Consumes an owner-issued single-use credential token and sets the password.
 *
 * This endpoint is unauthenticated by nature - the person redeeming has no working credential yet -
 * so it is protected by the token itself: 256 bits of randomness, single-use, 30-minute lifetime, and
 * stored only as a digest. The token is read from the request body, never from the query string, so
 * it cannot leak through history, a referrer header or a proxy log.
 *
 * Redemption does **not** sign the person in. They return to the sign-in form and use the credential
 * they just set, which keeps one code path responsible for issuing sessions.
 */

import { withTransaction } from '@/db/client';
import { REDEEM_PATH } from '@/server/auth/constants';
import { isSameOrigin } from '@/server/auth/request-guards';
import { passwordPolicyError } from '@/server/auth/password';
import { redeemCredentialToken } from '@/server/auth/service';
import { sessionContextFrom } from '@/server/auth/session';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${REDEEM_PATH}?error=invalidToken`);
  }

  const token = form.get('token');
  const password = form.get('password');
  const confirm = form.get('confirm');

  if (typeof token !== 'string' || token === '') return redirectTo(`${REDEEM_PATH}?error=invalidToken`);
  if (typeof password !== 'string' || password === '') return redirectTo(`${REDEEM_PATH}?error=weakPassword`);

  // Checked before the token is consumed, so a typo does not burn the single use.
  if (passwordPolicyError(password) !== null) return redirectTo(`${REDEEM_PATH}?error=weakPassword`);
  if (confirm !== password) return redirectTo(`${REDEEM_PATH}?error=mismatch`);

  const result = await withTransaction((tx) =>
    redeemCredentialToken(tx, { rawToken: token, password, context: sessionContextFrom(request.headers) }),
  );

  if (!result.ok) {
    const code =
      result.failure === 'weak_password'
        ? 'weakPassword'
        : result.failure === 'account_disabled'
          ? 'accountDisabled'
          : 'invalidToken';
    return redirectTo(`${REDEEM_PATH}?error=${code}`);
  }

  return redirectTo(`${REDEEM_PATH}?done=1`);
}
