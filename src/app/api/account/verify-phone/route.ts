/**
 * POST /api/account/verify-phone - consume the six-digit code sent at registration.
 *
 * Unauthenticated: the code is what proves the requester holds the number, so it must work from
 * whichever device received the message. The code is single-use, expires in ten minutes, dies after
 * five wrong guesses and is throttled by source. The account was already usable, so success changes no
 * session and needs none.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_VERIFY_PHONE_PATH } from '@/server/customer-auth/constants';
import { confirmCustomerPhoneVerification } from '@/server/customer-auth/account-security';
import { safeCustomerNext } from '@/server/customer-auth/guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_VERIFY_PHONE_PATH}?error=invalid`);
  }

  const phoneRaw = form.get('phone');
  const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';
  const nextRaw = form.get('next');
  const next = safeCustomerNext(typeof nextRaw === 'string' ? nextRaw : null);
  const context = sessionContextFrom(request.headers);

  if (phone === '') return redirectTo(`${CUSTOMER_VERIFY_PHONE_PATH}?error=invalid`);

  const result = await withTransaction((tx) =>
    confirmCustomerPhoneVerification(tx, { phone, code: form.get('code'), context }),
  );

  const back = `phone=${encodeURIComponent(phone)}&next=${encodeURIComponent(next)}`;
  if (!result.ok) {
    const code = result.failure === 'throttled' ? 'throttled' : 'invalid';
    return redirectTo(`${CUSTOMER_VERIFY_PHONE_PATH}?${back}&error=${code}`);
  }

  return redirectTo(`${CUSTOMER_VERIFY_PHONE_PATH}?${back}&verified=1`);
}
