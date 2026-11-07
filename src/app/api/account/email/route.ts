/**
 * POST /api/account/email - request a change of the registered email address.
 *
 * Authenticated and CSRF-bound. The current password is required: a borrowed session is not evidence
 * that the person at the keyboard owns the account, and the address being changed is the login
 * identifier itself.
 *
 * **The account address does not change here.** The service verifies the password, refuses an address
 * that is already taken or the same as the current one, stores the request with a hashed single-use
 * token, and this route mails the confirmation **to the new address**. Only that link moves the account.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { ACCOUNT_ROOT } from '@/server/customer-auth/constants';
import { scheduleEmailChangeConfirmation } from '@/server/customer-auth/email-delivery';
import { requestCustomerEmailChange } from '@/server/customer-auth/email-security';
import { guardCustomerMutation } from '@/server/customer-auth/guard';
import { sessionContextFrom } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

function backTo(code: string): Response {
  return redirectTo(`${ACCOUNT_ROOT}?notice=${code}`);
}

const FAILURES: Record<string, string> = {
  wrong_password: 'emailWrongPassword',
  invalid_email: 'emailInvalid',
  same_email: 'emailSame',
  email_taken: 'emailTaken',
  throttled: 'emailThrottled',
};

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    requestCustomerEmailChange(tx, {
      customerId: guard.principal.customerId,
      newEmail: guard.form.get('newEmail'),
      currentPassword: guard.form.get('currentPassword'),
      context,
    }),
  );

  if (!result.ok) return backTo(FAILURES[result.failure] ?? 'emailInvalid');

  scheduleEmailChangeConfirmation((task) => after(task), {
    to: result.newEmail,
    token: result.token,
  });

  return backTo('emailConfirmSent');
}
