/**
 * POST /api/account/password - change the password from the account page.
 *
 * Authenticated and CSRF-bound through `guardCustomerMutation`: a session is required, and the current
 * password is required again inside the service. The service revokes **every** customer session when the
 * password changes, and this route immediately mints a replacement for the browser that made the change,
 * so the customer stays where they are while every other device is signed out.
 *
 * The password never appears in a redirect, a log or the response body.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { CUSTOMER_SECURITY_PATH } from '@/server/customer-auth/constants';
import { schedulePasswordChanged } from '@/server/customer-auth/email-delivery';
import { changeCustomerPassword } from '@/server/customer-auth/account-security';
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

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const newPassword = guard.form.get('newPassword');
  if (typeof newPassword !== 'string' || newPassword !== guard.form.get('confirmPassword')) {
    return backTo('passwordMismatch');
  }

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    changeCustomerPassword(tx, {
      customerId: guard.principal.customerId,
      currentPassword: guard.form.get('currentPassword'),
      newPassword,
      context,
    }),
  );

  if (!result.ok) {
    const code =
      result.failure === 'weak_password'
        ? 'weakPassword'
        : result.failure === 'throttled'
          ? 'throttled'
          : result.failure === 'wrong_password'
            ? 'wrongPassword'
            : 'passwordUnavailable';
    return backTo(code);
  }

  // Every session was revoked by the change; the browser that made it gets a fresh one, so the customer
  // is not thrown out of the tab they used.
  const session = await withTransaction((tx) =>
    createCustomerSession(tx, guard.principal.customerId, context),
  );
  await setCustomerSessionCookie(session.token);

  // An account with no address has nowhere to send the notice; the change is still recorded.
  if (result.email !== null) {
    schedulePasswordChanged((task) => after(task), { to: result.email, changedAt: new Date() });
  }

  return backTo('passwordChanged');
}
