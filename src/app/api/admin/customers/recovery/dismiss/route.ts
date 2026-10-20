/**
 * POST /api/admin/customers/recovery/dismiss - discard a displayed one-time credential (Phase 23).
 *
 * The credential is shown on exactly one render, but a page render cannot clear a cookie in this version
 * of Next.js (\`.set\`/\`.delete\` are permitted only in a Server Function or a Route Handler), so the
 * "show it once" contract needs one explicit round trip: the detail page posts here after rendering the
 * code, and this route deletes the flash cookie.
 *
 * It renders nothing and reveals nothing. It takes no input beyond the CSRF token, so it cannot be used
 * to probe another owner's state, and clearing an absent cookie is a no-op.
 */

import { clearIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { deny, redirectTo } from '../../../responses';
import { CUSTOMERS_PATH } from '@/server/auth/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.customerRead);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${CUSTOMERS_PATH}?notice=denied`);
    return deny(guard.status);
  }

  await clearIssuedTokenFlash();

  const customerId = guard.form.get('customerId');
  return redirectTo(
    typeof customerId === 'string' && /^[0-9]{1,18}$/.test(customerId)
      ? `${CUSTOMERS_PATH}/${customerId}`
      : CUSTOMERS_PATH,
  );
}
