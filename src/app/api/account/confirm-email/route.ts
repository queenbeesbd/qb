/**
 * POST /api/account/confirm-email - consume the link mailed to a requested new address.
 *
 * Unauthenticated: the confirmation link is what proves the requester owns the new address, so it must
 * work from whichever device reads the mail. The token is single-use and expires in a day.
 *
 * The response moves the customer to the sign-in page when it succeeds - every session was revoked with
 * the address, so signing in with the new address is the next step - and to the generic refusal
 * otherwise.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { CUSTOMER_CONFIRM_EMAIL_PATH } from '@/server/customer-auth/constants';
import { scheduleEmailChanged } from '@/server/customer-auth/email-delivery';
import { confirmCustomerEmailChange } from '@/server/customer-auth/email-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_CONFIRM_EMAIL_PATH}?error=invalid`);
  }

  const rawToken = form.get('token');
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (token === '') return redirectTo(`${CUSTOMER_CONFIRM_EMAIL_PATH}?error=invalid`);

  const result = await withTransaction((tx) => confirmCustomerEmailChange(tx, { rawToken: token }));

  if (!result.ok) {
    return redirectTo(
      `${CUSTOMER_CONFIRM_EMAIL_PATH}?token=${encodeURIComponent(token)}&error=${result.failure === 'email_taken' ? 'taken' : 'invalid'}`,
    );
  }

  // The previous address is told what happened; that notice is the whole point of keeping it.
  scheduleEmailChanged((task) => after(task), {
    previousEmail: result.previousEmail,
    newEmail: result.newEmail,
    changedAt: new Date(),
  });

  return redirectTo('/account/login?notice=emailChanged');
}
