/**
 * POST /api/products/[slug]/reviews - a customer writes a review of a product they bought.
 *
 * Authenticated and CSRF-bound through `guardCustomerMutation`: no account, no review. The purchase
 * proof is re-checked inside the transaction that writes the row (`reviewEligibility`), so a slug
 * that arrived in a form is worth nothing on its own.
 *
 * The review is written **pending**. It is visible to its author immediately, because the product
 * page reads their own row whatever its state, and to nobody else until the owner publishes it in
 * `/qbpanel/reviews` (ADR 0035).
 *
 * Every outcome is a redirect back to the product page with a fixed notice code - never a message
 * echoed from the request - and the code is a closed set the page knows how to phrase.
 */

import { withTransaction } from '@/db/client';
import { product } from '@/db/schema';
import { sql } from 'drizzle-orm';

import { deny, redirectTo } from '@/app/api/qbpanel/responses';
import { ValidationError } from '@/server/authz/authorize';
import { saveUpload } from '@/server/catalog/uploads';
import { guardCustomerMutation } from '@/server/customer-auth/guard';
import { submitReview } from '@/server/reviews/service';

export const dynamic = 'force-dynamic';

/** The product page anchor, so a returned notice is beside the form that produced it. */
const REVIEWS_ANCHOR = '#product-reviews-title';

/** Slugs are bounded and shaped by the catalog's own rule; anything else is not a product page. */
function productPath(slug: string, notice: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  return `/products/${slug}?review=${notice}${REVIEWS_ANCHOR}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const guard = await guardCustomerMutation(request);
  if (!guard.ok) return deny(guard.status);

  const { slug } = await params;
  const back = (notice: string): Response =>
    redirectTo(productPath(slug, notice) ?? '/products');

  const rating = guard.form.get('rating');
  const body = guard.form.get('body');
  if (typeof rating !== 'string' || typeof body !== 'string') return back('invalid');

  /*
   * The form offers one to five stars; the column stores halves. A value that is not one of those
   * five is a refusal rather than a rounded guess - "4.5 from a customer" is not an option the form
   * ever presented.
   */
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return back('invalid');

  /*
   * The photograph, when one was chosen, is decoded and stored **before** the transaction opens - the
   * same order the product editor uses, so a file that cannot be read refuses the whole submission
   * instead of leaving a review whose photo silently never arrived. A browser supplies bytes and
   * nothing else: `saveUpload` produces the key, the dimensions and the content type from the decoded
   * image, strips EXIF (including location), and re-encodes to WebP.
   *
   * The square contract is the catalog's own, so a review photo is served by the same
   * `/catalog/<key>-<width>.webp` route at 320/600/1050 and needs no second pipeline.
   */
  const photoField = guard.form.get('photo');
  const photo = photoField instanceof File && photoField.size > 0 ? photoField : null;
  let image: { key: string; width: number; height: number } | null = null;
  if (photo !== null) {
    try {
      const stored = await saveUpload(photo, 'square');
      image = { key: stored.key, width: stored.width, height: stored.height };
    } catch {
      return back('invalidPhoto');
    }
  }

  try {
    const result = await withTransaction(async (tx) => {
      const rows = await tx
        .select({ id: product.id })
        .from(product)
        .where(sql`${product.slug} = ${slug} and ${product.deletedAt} is null`);
      const productId = rows[0]?.id;
      if (productId === undefined) return { ok: false as const, reason: 'not_purchased' as const };

      return submitReview(tx, {
        customerId: guard.principal.customerId,
        productId,
        ratingHalves: stars * 2,
        body,
        image,
      });
    });

    if (!result.ok) return back(result.reason === 'already_reviewed' ? 'already' : 'notPurchased');
    return back('submitted');
  } catch (error) {
    // A body outside the bounds, or an unreadable value: the form says what to fix, and nothing is
    // written. Any other failure propagates to the route's error boundary rather than being disguised.
    if (error instanceof ValidationError) return back('invalid');
    throw error;
  }
}
