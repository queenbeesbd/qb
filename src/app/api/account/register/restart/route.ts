/**
 * POST /api/account/register/restart - forget the pending registration.
 *
 * The code step needs a way back to the identifier form without waiting ten minutes, and a page render
 * may not clear a cookie in this version of Next.js. Clearing the cookie makes the pending row
 * unreachable from this browser; the row itself expires on its own.
 */

import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { isSameOrigin } from '@/server/auth/request-guards';
import { CUSTOMER_REGISTER_PATH } from '@/server/customer-auth/constants';
import { clearSignupState } from '@/server/customer-auth/signup-cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return deny(403);
  await clearSignupState();
  return redirectTo(CUSTOMER_REGISTER_PATH);
}
