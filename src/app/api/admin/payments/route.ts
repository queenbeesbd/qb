/**
 * POST /api/admin/payments - one verification decision on a submitted claim.
 *
 * The decision (verify / reject / falsely_claimed / hold / release_hold) is re-checked server-side:
 * session, same-origin, CSRF token and the per-action permission, then the guarded transition in
 * `decideVerification`, which is idempotent-by-conflict and audited in the same transaction. The body
 * carries no verdict the server did not compute: `verifiedAmount` is recorded, never trusted, and a
 * mismatch must be explicitly acknowledged rather than auto-decided.
 */

import { withTransaction } from '@/db/client';
import { PAYMENTS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { decideVerification, type VerificationDecision } from '@/server/orders/manage';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const DECISIONS: readonly VerificationDecision[] = ['verify', 'reject', 'falsely_claimed', 'hold', 'release_hold'];

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const claimId = parseId(form.get('claimId'));
  const rawDecision = typeof form.get('decision') === 'string' ? (form.get('decision') as string) : '';
  const decision = (DECISIONS as readonly string[]).includes(rawDecision)
    ? (rawDecision as VerificationDecision)
    : null;

  if (claimId === null || decision === null) return redirectTo(`${PAYMENTS_PATH}?notice=invalid`);

  try {
    await withTransaction((tx) =>
      decideVerification(tx, {
        staffUserId: principal.staffUserId,
        permissions: principal.permissions,
        roleCodes: roleCodes(principal),
      }, {
        claimId,
        decision,
        rawVerifiedAmount: form.get('verifiedAmount'),
        reason: typeof form.get('reason') === 'string' ? (form.get('reason') as string) : undefined,
        mismatchAcknowledged: form.get('mismatchAcknowledged') === '1',
      }),
    );
    const notice: Record<VerificationDecision, string> = {
      verify: 'verified',
      reject: 'rejected',
      falsely_claimed: 'falselyClaimed',
      hold: 'held',
      release_hold: 'holdReleased',
    };
    return redirectTo(`${PAYMENTS_PATH}?notice=${notice[decision]}`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${PAYMENTS_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${PAYMENTS_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${PAYMENTS_PATH}?notice=denied`);
    throw error;
  }
}