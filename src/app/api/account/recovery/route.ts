/**
 * POST /api/account/recovery - ask for a password-recovery link.
 *
 * Unauthenticated and state-changing, so it is protected by a same-origin check and by a throttle keyed
 * on both the address and the source. There is no CSRF token to bind: there is no session, and the form
 * carries nothing but an email address.
 *
 * **The answer never varies.** Registered, suspended, malformed, throttled, provider down, provider not
 * configured - every case redirects to the same page with the same sentence. The only thing an attacker
 * can learn from this endpoint is that it exists.
 */

import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/admin/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_FORGOT_PATH } from '@/server/customer-auth/constants';
import { schedulePasswordRecovery } from '@/server/customer-auth/email-delivery';
import { requestCustomerPasswordReset } from '@/server/customer-auth/email-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_FORGOT_PATH}?sent=1`);
  }

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    requestCustomerPasswordReset(tx, { email: form.get('email'), context }),
  );

  // Scheduled after the response, and only when a message was actually composed. A failure to send
  // changes nothing the customer sees - which is exactly the behaviour an enumeration-safe answer needs.
  if (result.delivery !== null) {
    schedulePasswordRecovery((task) => after(task), result.delivery);
  }

  return redirectTo(`${CUSTOMER_FORGOT_PATH}?sent=1`);
}
