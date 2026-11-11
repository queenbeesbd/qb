/**
 * POST /api/account/phone-verification - re-send the registration SMS code.
 *
 * Authenticated and CSRF-bound: the number is read from the session's own customer row, never from the
 * form, so this cannot be used to text a number somebody else controls. Throttled on the account, so
 * the shop's SMS credit is not a free messaging service.
 *
 * Already verified, no number and an unconfigured provider are stated outcomes, not errors.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { CUSTOMER_SECURITY_PATH } from '@/server/customer-auth/constants';
import { schedulePhoneVerification } from '@/server/customer-auth/email-delivery';
import { requestCustomerPhoneVerification } from '@/server/customer-auth/account-security';
import { guardCustomerMutation } from '@/server/customer-auth/guard';

export const dynamic = 'force-dynamic';

function backTo(code: string): Response {
  return redirectTo(`${CUSTOMER_SECURITY_PATH}?notice=${code}`);
}

const FAILURES: Record<string, string> = {
  verified: 'phoneAlreadyVerified',
  unavailable: 'verificationUnavailable',
  throttled: 'verificationThrottled',
  not_configured: 'smsUnavailable',
};

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const result = await withTransaction((tx) =>
    requestCustomerPhoneVerification(tx, { customerId: guard.principal.customerId }),
  );

  if (!result.ok) return backTo(FAILURES[result.failure] ?? 'verificationUnavailable');

  if (!schedulePhoneVerification((task) => after(task), result.delivery)) return backTo('smsUnavailable');
  return backTo('verificationSent');
}
