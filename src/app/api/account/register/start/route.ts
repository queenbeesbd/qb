/**
 * POST /api/account/register/start - step 1: ask for a code.
 *
 * Unauthenticated and state-changing, so it depends on the same-origin check and on throttling keyed
 * by both the identifier and the source. Nothing is written to `customer`: a pending
 * `customer_registration` row holds the scrypt digest of a six-digit code until it is entered, which
 * is what makes a registration flood cost a message rather than an account (ADR 0038).
 *
 * A duplicate identifier is refused by name - the accepted enumeration surface registration has always
 * had, because a person choosing a number or address must be told it is in use.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_REGISTER_PATH } from '@/server/customer-auth/constants';
import { scheduleRegistrationCode } from '@/server/customer-auth/email-delivery';
import { safeCustomerNext } from '@/server/customer-auth/guard';
import { startRegistration } from '@/server/customer-auth/registration';
import { writeSignupState } from '@/server/customer-auth/signup-cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=invalid`);
  }

  const method = form.get('method');
  const nextRaw = form.get('next');
  const next = safeCustomerNext(typeof nextRaw === 'string' ? nextRaw : null);
  const context = sessionContextFrom(request.headers);

  const result = await withTransaction((tx) =>
    startRegistration(tx, { method, identifier: form.get('identifier'), context }),
  );

  const back = method === 'email' ? '&method=email' : '';
  if (!result.ok) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=${result.failure}${back}`);
  }

  // The cookie records which identifier the code went to; the code itself is never stored anywhere
  // readable, only its digest in the pending row.
  await writeSignupState({
    identifier: result.delivery.to,
    channel: result.delivery.channel,
    ticket: null,
    next,
  });

  // After the response: a provider failure means nothing was registered, and the form says so.
  scheduleRegistrationCode((task) => after(task), result.delivery);

  return redirectTo(`${CUSTOMER_REGISTER_PATH}?sent=1`);
}
