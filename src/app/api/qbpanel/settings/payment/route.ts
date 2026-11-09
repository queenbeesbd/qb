/**
 * POST /api/qbpanel/settings/payment - the payment instructions the checkout publishes.
 *
 * `settings.write`: this text tells a customer where to send money, so it is as consequential as a
 * price. The route checks the session, CSRF and origin; the service re-checks the permission, refuses
 * markup, validates the bKash number, its visibility switch and the advance threshold. A redirect
 * carries a fixed notice code, never the submitted text or the number.
 *
 * The editor lives under **Settings -> Other settings -> Checkout instructions**, so a refusal returns
 * to that page rather than to Contact and policies, which no longer owns this block.
 *
 * **This does not enable a payment method.** Cash on Delivery is still the only method the order
 * accepts; the block is an instruction the owner confirms on the phone.
 */

import { withTransaction } from '@/db/client';
import { OTHER_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { savePaymentInstructions } from '@/server/settings/payment';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${OTHER_SETTINGS_PATH}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo('denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  /*
   * An unticked checkbox posts nothing, so the value list is read rather than `get()`: any explicit
   * `true` means on, its absence means off. The service then receives one of the two literals and
   * refuses anything else, instead of guessing a state from a truthy string.
   */
  const bkashVisible = form.getAll('bkashVisible').includes('true') ? 'true' : 'false';

  try {
    await withTransaction((tx) =>
      savePaymentInstructions(tx, actor, {
        instructions: form.get('instructions') ?? '',
        bkashNumber: form.get('bkashNumber') ?? '',
        bkashVisible,
        sendMoneyNote: form.get('sendMoneyNote') ?? '',
        advanceThreshold: form.get('advanceThreshold') ?? '',
      }),
    );
    return backTo('paymentSaved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
