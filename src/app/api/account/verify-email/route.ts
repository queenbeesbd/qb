/**
 * POST /api/account/verify-email - consume the link mailed at registration.
 *
 * Unauthenticated: the link is what proves the requester controls the address, so it must work from
 * whichever device reads the mail. The token is single-use and expires in two days. The account was
 * already usable, so success changes no session and needs none.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { CUSTOMER_VERIFY_EMAIL_PATH } from '@/server/customer-auth/constants';
import { confirmCustomerEmailVerification } from '@/server/customer-auth/email-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_VERIFY_EMAIL_PATH}?error=invalid`);
  }

  const rawToken = form.get('token');
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (token === '') return redirectTo(`${CUSTOMER_VERIFY_EMAIL_PATH}?error=invalid`);

  const result = await withTransaction((tx) =>
    confirmCustomerEmailVerification(tx, { rawToken: token }),
  );

  if (!result.ok) return redirectTo(`${CUSTOMER_VERIFY_EMAIL_PATH}?error=invalid`);

  return redirectTo(`${CUSTOMER_VERIFY_EMAIL_PATH}?verified=1`);
}
