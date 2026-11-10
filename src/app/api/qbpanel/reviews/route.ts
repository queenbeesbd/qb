/**
 * POST /api/qbpanel/reviews - publish or refuse a pending review (ADR 0035).
 *
 * `guardMutation` enforces the session, the CSRF token and the same-origin check before anything is
 * read; the service then re-checks `review.moderate` and performs a state-guarded update, so a
 * review that another tab already decided is a conflict rather than a second, silent decision.
 *
 * The redirect carries a fixed notice code and the tab it came from, never a submitted value.
 */

import { withTransaction } from '@/db/client';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { REVIEWS_PATH } from '@/server/auth/constants';
import { AuthorizationError, ConflictError } from '@/server/authz/authorize';
import { decideReview } from '@/server/reviews/service';

export const dynamic = 'force-dynamic';

const DECISIONS = ['approved', 'rejected'] as const;
const TABS = ['pending', 'approved', 'rejected'] as const;

type Tab = (typeof TABS)[number];

function back(state: Tab, notice: string): Response {
  return redirectTo(`${REVIEWS_PATH}?state=${state}&notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.reviewModerate);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${REVIEWS_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawState = form.get('state');
  const state: Tab = typeof rawState === 'string' && (TABS as readonly string[]).includes(rawState)
    ? (rawState as Tab)
    : 'pending';

  const rawId = form.get('reviewId');
  const reviewId = typeof rawId === 'string' && /^\d{1,18}$/.test(rawId) ? Number(rawId) : null;
  const rawDecision = form.get('decision');
  const decision =
    typeof rawDecision === 'string' && (DECISIONS as readonly string[]).includes(rawDecision)
      ? (rawDecision as 'approved' | 'rejected')
      : null;

  if (reviewId === null || decision === null) return back(state, 'invalid');

  try {
    await withTransaction((tx) => decideReview(tx, actor, reviewId, decision));
    return back(state, decision === 'approved' ? 'published' : 'refused');
  } catch (error) {
    if (error instanceof ConflictError) return back(state, 'conflict');
    if (error instanceof AuthorizationError) return back(state, 'denied');
    throw error;
  }
}
