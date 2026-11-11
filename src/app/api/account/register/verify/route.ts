/**
 * POST /api/account/register/verify - step 2: enter the code.
 *
 * The identifier comes from the sign-up cookie, never from the form: the code is compared against the
 * pending row that cookie names, so this cannot be used to guess codes for a number somebody else
 * started. A wrong code counts against the row (dead at five) and against the source.
 *
 * Success does not create an account. It issues a 256-bit ticket, stores only its digest, and hands
 * the raw value back in the cookie for step 3.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { sessionContextFrom } from '@/server/auth/session';
import { CUSTOMER_REGISTER_PATH } from '@/server/customer-auth/constants';
import { verifyRegistrationCode } from '@/server/customer-auth/registration';
import { readSignupState, writeSignupState } from '@/server/customer-auth/signup-cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=invalid_code`);
  }

  const state = await readSignupState();
  if (state === null || state.ticket !== null) {
    return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=session`);
  }

  const context = sessionContextFrom(request.headers);
  const result = await withTransaction((tx) =>
    verifyRegistrationCode(tx, { identifier: state.identifier, code: form.get('code'), context }),
  );

  if (!result.ok) return redirectTo(`${CUSTOMER_REGISTER_PATH}?error=${result.failure}`);

  await writeSignupState({
    identifier: result.identifier,
    channel: result.channel,
    ticket: result.ticket,
    next: state.next,
  });

  return redirectTo(CUSTOMER_REGISTER_PATH);
}
