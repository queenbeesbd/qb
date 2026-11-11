/**
 * POST /api/account/email - change the registered email address.
 *
 * Authenticated and CSRF-bound. The current password is required: a borrowed session is not evidence
 * that the person at the keyboard owns the account, and the address is a sign-in identifier.
 *
 * **The address changes here** (owner decision, 2026-11-12). There is no confirmation link to the new
 * address and no verification step - verification exists only at registration and in recovery. The
 * address is stored unverified, every session is revoked with the identifier, and this route mints one
 * for the browser that made the change. The previous address is told what happened; that notice is a
 * record, not a gate.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { CUSTOMER_SECURITY_PATH } from '@/server/customer-auth/constants';
import { scheduleEmailChanged } from '@/server/customer-auth/email-delivery';
import { changeCustomerEmail } from '@/server/customer-auth/account-security';
import {
  guardCustomerMutation,
  setCustomerSessionCookie,
} from '@/server/customer-auth/guard';
import { createCustomerSession } from '@/server/customer-auth/session';
import { sessionContextFrom } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

function backTo(code: string): Response {
  return redirectTo(`${CUSTOMER_SECURITY_PATH}?notice=${code}`);
}

const FAILURES: Record<string, string> = {
  wrong_password: 'emailWrongPassword',
  invalid_email: 'emailInvalid',
  same_email: 'emailSame',
  email_taken: 'emailTaken',
  throttled: 'emailThrottled',
  unavailable: 'emailUnavailable',
};

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    changeCustomerEmail(tx, {
      customerId: guard.principal.customerId,
      newEmail: guard.form.get('newEmail'),
      currentPassword: guard.form.get('currentPassword'),
      context,
    }),
  );

  if (!result.ok) return backTo(FAILURES[result.failure] ?? 'emailInvalid');

  // The address changed, so every session established against the old one was revoked; keep the browser
  // that made the change signed in.
  const session = await withTransaction((tx) =>
    createCustomerSession(tx, guard.principal.customerId, context),
  );
  await setCustomerSessionCookie(session.token);

  if (result.previousEmail !== null) {
    scheduleEmailChanged((task) => after(task), {
      previousEmail: result.previousEmail,
      newEmail: result.newEmail,
      changedAt: new Date(),
    });
  }

  return backTo('emailChanged');
}
