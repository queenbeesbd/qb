/**
 * POST /api/admin/payment-recipients - the owner configures which account receives a prepaid method.
 *
 * One route with an explicit `action`, because the four mutations share a target, a permission, a
 * validation boundary and an audit convention. The order of checks is fixed and cannot be reordered by
 * the request body:
 *
 *   1. session, permission (`payment.recipient_manage`), CSRF and same-origin - in `guardMutation`;
 *   2. the action name must be one this route implements, so an unknown action cannot fall through;
 *   3. the recipient id must parse, and the method must be one a recipient can exist for;
 *   4. the service re-checks the permission and validates every field against the database constraints.
 *
 * Nothing here reads a method, a number or a label from a query string, and nothing is returned in the
 * response beyond a fixed notice code - the values themselves are re-read from the page.
 */

import { withTransaction } from '@/db/client';
import { RECIPIENTS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { ConflictError, ValidationError } from '@/server/authz/authorize';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { parseId } from '@/server/catalog/validation';
import {
  createRecipient,
  deactivateRecipient,
  reactivateRecipient,
  updateRecipient,
} from '@/server/payments/recipients';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

/** Every action this route implements. An unlisted value is refused, never treated as a default. */
const ACTIONS = ['create', 'update', 'deactivate', 'reactivate'] as const;
type Action = (typeof ACTIONS)[number];

function readAction(value: FormDataEntryValue | null): Action | null {
  if (typeof value !== 'string') return null;
  return (ACTIONS as readonly string[]).includes(value) ? (value as Action) : null;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.paymentRecipientManage);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const action = readAction(form.get('action'));
  if (action === null) return redirectTo(`${RECIPIENTS_PATH}?notice=invalid`);

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    if (action === 'create') {
      await withTransaction((tx) =>
        createRecipient(tx, actor, {
          method: form.get('method'),
          accountNumber: form.get('accountNumber'),
          accountLabel: form.get('accountLabel'),
        }),
      );
      return redirectTo(`${RECIPIENTS_PATH}?notice=created`);
    }

    const recipientId = parseId(form.get('recipientId'));
    if (recipientId === null) return redirectTo(`${RECIPIENTS_PATH}?notice=invalid`);

    if (action === 'update') {
      const result = await withTransaction((tx) =>
        updateRecipient(tx, actor, {
          recipientId,
          accountNumber: form.get('accountNumber'),
          accountLabel: form.get('accountLabel'),
        }),
      );
      // `replaced` is its own notice: when a claim already referenced the row, the save created a new
      // row so the claim keeps showing the account it was actually paid into. The owner is told.
      return redirectTo(`${RECIPIENTS_PATH}?notice=${result.outcome}`);
    }

    if (action === 'deactivate') {
      await withTransaction((tx) => deactivateRecipient(tx, actor, { recipientId }));
      return redirectTo(`${RECIPIENTS_PATH}?notice=deactivated`);
    }

    await withTransaction((tx) => reactivateRecipient(tx, actor, { recipientId }));
    return redirectTo(`${RECIPIENTS_PATH}?notice=reactivated`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${RECIPIENTS_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${RECIPIENTS_PATH}?notice=conflict`);
    throw error;
  }
}
