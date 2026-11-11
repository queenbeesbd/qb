/**
 * POST /api/account/verification - re-send the registration verification mail.
 *
 * Authenticated and CSRF-bound: the address is read from the session's own customer row, never from the
 * form, so this cannot be used to mail an address somebody else controls. Throttled on the account.
 *
 * Already verified and no live address are stated outcomes, not errors. A provider failure changes
 * nothing the customer sees - the message is scheduled after the response.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { CUSTOMER_SECURITY_PATH } from '@/server/customer-auth/constants';
import { scheduleEmailVerification } from '@/server/customer-auth/email-delivery';
import { requestCustomerEmailVerification } from '@/server/customer-auth/account-security';
import { guardCustomerMutation } from '@/server/customer-auth/guard';
import { sessionContextFrom } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

function backTo(code: string): Response {
  return redirectTo(`${CUSTOMER_SECURITY_PATH}?notice=${code}`);
}

const FAILURES: Record<string, string> = {
  verified: 'emailAlreadyVerified',
  unavailable: 'verificationUnavailable',
  throttled: 'verificationThrottled',
};

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    requestCustomerEmailVerification(tx, {
      customerId: guard.principal.customerId,
      context,
    }),
  );

  if (!result.ok) return backTo(FAILURES[result.failure] ?? 'verificationUnavailable');

  scheduleEmailVerification((task) => after(task), result.delivery);
  return backTo('verificationSent');
}
