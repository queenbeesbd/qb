/**
 * POST /api/account/logout
 *
 * The only state-changing customer endpoint that needs no permission - every authenticated customer may
 * sign themselves out - but it still requires the CSRF token, because a forced cross-site sign-out is a
 * denial of service rather than a harmless no-op.
 */

import { withTransaction } from '@/db/client';
import { clearCustomerSessionCookie, guardCustomerMutation } from '@/server/customer-auth/guard';
import { signOutCustomer } from '@/server/customer-auth/service';
import { ACCOUNT_ROOT } from '@/server/customer-auth/constants';
import { deny, redirectTo } from '@/app/api/admin/responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  await withTransaction((tx) => signOutCustomer(tx, guard.principal.sessionId));
  await clearCustomerSessionCookie();
  return redirectTo(ACCOUNT_ROOT);
}
