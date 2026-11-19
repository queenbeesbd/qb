/**
 * POST /api/qbpanel/reviews/compose - the owner publishes a review from words a customer left elsewhere
 * (owner direction, 2026-11-19).
 *
 * Behind `review.moderate`, like the decision route, and behind `guardMutation`, so the session, the
 * CSRF token and the same-origin check all run before anything is read. The service re-checks the
 * permission and refuses a body or rating outside the bounds the form draws.
 *
 * A photograph is stored **before** the transaction opens, exactly as it is on the product page and in
 * the catalog editors: a file that cannot be decoded refuses the whole submission instead of leaving a
 * review whose picture silently never arrived. `saveUpload` produces the key, the dimensions and the
 * content type from the decoded bytes and re-encodes to WebP at the catalog's square sizes, so a review
 * photo needs no second pipeline.
 *
 * Every outcome is a redirect back to the queue with a fixed notice code - never an echoed value.
 */

import { withTransaction } from '@/db/client';
import { invalidateStorefrontCatalog } from '@/server/catalog/cache';
import { saveUpload } from '@/server/catalog/uploads';
import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { REVIEWS_PATH } from '@/server/auth/constants';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { parseId } from '@/server/catalog/validation';
import { createOwnerReview } from '@/server/reviews/service';

export const dynamic = 'force-dynamic';

function back(notice: string): Response {
  return redirectTo(`${REVIEWS_PATH}?state=approved&notice=${notice}`);
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

  const productId = parseId(form.get('productId'));
  const rawRating = form.get('rating');
  const rawBody = form.get('body');
  if (productId === null || typeof rawRating !== 'string' || typeof rawBody !== 'string') {
    return back('writeInvalid');
  }

  /*
   * The form offers one to five stars and the column stores halves; a value that is not one of those
   * five is a refusal rather than a rounded guess, which is the same rule the customer's form follows.
   */
  const stars = Number(rawRating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return back('writeInvalid');

  const photoField = form.get('photo');
  const photo = photoField instanceof File && photoField.size > 0 ? photoField : null;
  let image: { key: string; width: number; height: number } | null = null;
  if (photo !== null) {
    try {
      const stored = await saveUpload(photo, 'square');
      image = { key: stored.key, width: stored.width, height: stored.height };
    } catch {
      return back('writeInvalid');
    }
  }

  try {
    await withTransaction((tx) =>
      createOwnerReview(tx, actor, {
        productId,
        ratingHalves: stars * 2,
        body: rawBody,
        image,
      }),
    );
    // The review is on an approved row from the start, and the product page's list is cached.
    invalidateStorefrontCatalog();
    return back('written');
  } catch (error) {
    if (error instanceof ValidationError) return back('writeInvalid');
    if (error instanceof AuthorizationError) return back('denied');
    throw error;
  }
}
