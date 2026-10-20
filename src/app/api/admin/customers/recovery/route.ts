/**
 * POST /api/admin/customers/recovery - issue a one-time customer recovery credential (Phase 23).
 *
 * Requires `customer.credential_reset`, which is **privileged**: the service re-checks it, so a caller
 * that skips this check fails closed and the refusal is recorded durably.
 *
 * The credential is delivered the only way this product can deliver one: through the flash cookie, which
 * is httpOnly, scoped to `/admin`, and read once on the next render. Never a URL, never a client bundle,
 * never a log. The owner reads it to the customer during the call; the customer replaces it immediately.
 */

import { withTransaction } from '@/db/client';
import { CUSTOMERS_PATH } from '@/server/auth/constants';
import { clearIssuedTokenFlash, setIssuedTokenFlash } from '@/server/auth/flash';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError } from '@/server/authz/authorize';
import { parseId } from '@/server/catalog/validation';
import { issueCustomerRecovery } from '@/server/customer-auth/recovery';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.customerCredentialReset);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') {
      return redirectTo(`${CUSTOMERS_PATH}?notice=denied`);
    }
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const customerId = parseId(form.get('customerId'));
  const reason = typeof form.get('reason') === 'string' ? (form.get('reason') as string) : '';
  if (customerId === null) return redirectTo(`${CUSTOMERS_PATH}?notice=invalid`);

  try {
    const issued = await withTransaction((tx) =>
      issueCustomerRecovery(
        tx,
        {
          staffUserId: principal.staffUserId,
          permissions: principal.permissions,
          roleCodes: roleCodes(principal),
        },
        { customerId, reason },
      ),
    );

    if (!issued.ok) {
      const notice = issued.failure === 'invalid_reason' ? 'invalid' : 'unavailable';
      return redirectTo(`${CUSTOMERS_PATH}/${customerId}?notice=${notice}`);
    }

    // Drop any flash left over from an earlier issuance before writing this one, so a stale value can
    // never be rendered as if it were the code just created.
    await clearIssuedTokenFlash();
    await setIssuedTokenFlash({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      purpose: 'customer_password_reset',
      subject: String(customerId),
    });

    return redirectTo(`${CUSTOMERS_PATH}/${customerId}?notice=tokenIssued`);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return redirectTo(`${CUSTOMERS_PATH}?notice=denied`);
    }
    throw error;
  }
}
