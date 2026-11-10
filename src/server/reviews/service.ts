/**
 * Product reviews (ADR 0035).
 *
 * One module for the three reads and two writes the feature needs, so the storefront, the customer's
 * own form and the owner's queue cannot disagree about what "published" means.
 *
 * Three rules, each enforced here:
 *
 * 1. **Only a buyer reviews, and only once.** Eligibility is a real order of theirs, not cancelled,
 *    containing the product. The order is recorded on the row as proof. The unique index refuses a
 *    second review even if this check is ever bypassed.
 * 2. **A review is born pending.** Only `approved` rows are published, and only the owner sets that -
 *    through `decideReview`, behind `review.moderate`.
 * 3. **Customer stars are never aggregated.** No function here returns an average, and the product
 *    card's stars come from `product.rating_halves` instead.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { productReview } from '@/db/schema';
import { recordAudit } from '@/server/auth/audit';
import { ConflictError, ValidationError, requirePermission } from '@/server/authz/authorize';
import type { ActorContext } from '@/server/authz/authorize';
import { PERMISSIONS } from '@/server/authz/permissions';
import { MIN_RATING_HALVES, MAX_RATING_HALVES } from '@/lib/rating';

/** The bounds the form promises, enforced again here and by the table's own check. */
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 1000;

/** How many published reviews a product page draws. More than this states the gap rather than hiding it. */
export const PUBLISHED_REVIEW_PAGE_SIZE = 10;

export type PublishedReview = {
  readonly ratingHalves: number;
  readonly body: string;
  readonly createdAt: Date;
  /** The attached photograph, as our own asset key, or null when the customer attached none. */
  readonly imageKey: string | null;
};

export type OwnReview = PublishedReview & {
  readonly state: 'pending' | 'approved' | 'rejected';
};

/**
 * Published reviews for one product, newest first.
 *
 * Scoped by `product_id` **and** `state = 'approved'`: a pending or refused review is invisible to
 * every reader except its author, and the author's own copy comes from `getOwnReview` instead.
 */
export async function listPublishedReviews(
  tx: Transaction,
  productId: number,
  limit: number = PUBLISHED_REVIEW_PAGE_SIZE,
): Promise<PublishedReview[]> {
  const rows = await tx
    .select({
      ratingHalves: productReview.ratingHalves,
      body: productReview.body,
      createdAt: productReview.createdAt,
      imageKey: productReview.imageKey,
    })
    .from(productReview)
    .where(sql`${productReview.productId} = ${productId} and ${productReview.state} = 'approved'`)
    .orderBy(sql`${productReview.createdAt} desc, ${productReview.id} desc`)
    .limit(limit);

  return rows;
}

/** How many reviews are published on a product, so the page can say when it is showing only some. */
export async function countPublishedReviews(tx: Transaction, productId: number): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(productReview)
    .where(sql`${productReview.productId} = ${productId} and ${productReview.state} = 'approved'`);
  return rows[0]?.count ?? 0;
}

/** The signed-in customer's own review of one product, whatever its state - the reason it is visible. */
export async function getOwnReview(
  tx: Transaction,
  customerId: number,
  productId: number,
): Promise<OwnReview | null> {
  const rows = await tx
    .select({
      ratingHalves: productReview.ratingHalves,
      body: productReview.body,
      createdAt: productReview.createdAt,
      imageKey: productReview.imageKey,
      state: productReview.state,
    })
    .from(productReview)
    .where(sql`${productReview.customerId} = ${customerId} and ${productReview.productId} = ${productId}`);

  const row = rows[0];
  if (row === undefined) return null;
  return {
    ratingHalves: row.ratingHalves,
    body: row.body,
    createdAt: row.createdAt,
    imageKey: row.imageKey,
    state: row.state as OwnReview['state'],
  };
}

export type ReviewEligibility =
  | { readonly allowed: true; readonly orderId: number }
  | { readonly allowed: false; readonly reason: 'not_purchased' | 'already_reviewed' };

/**
 * Whether this customer may review this product, and the order that entitles them.
 *
 * The purchase test is a real `order_item` on an order of theirs that was not cancelled: an order
 * that was refused or cancelled is not a purchase, so it cannot buy the right to speak about the
 * product. A claimed guest order qualifies too - claiming is what makes it theirs.
 */
export async function reviewEligibility(
  tx: Transaction,
  customerId: number,
  productId: number,
): Promise<ReviewEligibility> {
  const existing = await tx
    .select({ id: productReview.id })
    .from(productReview)
    .where(sql`${productReview.customerId} = ${customerId} and ${productReview.productId} = ${productId}`);
  if (existing.length > 0) return { allowed: false, reason: 'already_reviewed' };

  // Raw SQL because the purchase proof joins four tables; the driver's row type is cast at this one
  // boundary, exactly as the analytics reads do.
  const rows = (await tx.execute(sql`
    select o.id::text as order_id
    from "order" o
    join order_item oi on oi.order_id = o.id
    join product_variant pv on pv.id = oi.variant_id
    join product p on p.id = pv.product_id
    where o.customer_id = ${customerId}
      and p.id = ${productId}
      and o.status <> 'cancelled'
    order by o.placed_at desc
    limit 1
  `)) as unknown as { rows: { order_id: string }[] };

  const orderId = rows.rows[0]?.order_id;
  if (orderId === undefined) return { allowed: false, reason: 'not_purchased' };
  return { allowed: true, orderId: Number(orderId) };
}

/**
 * Writes a customer's review, pending the owner's decision.
 *
 * Eligibility is re-checked **inside** the caller's transaction rather than trusted from the page
 * that drew the form: a form can be submitted twice, a page can be stale, and an order can be
 * cancelled between the two. The unique index is the second line of defence.
 */
export async function submitReview(
  tx: Transaction,
  input: {
    readonly customerId: number;
    readonly productId: number;
    readonly ratingHalves: number;
    readonly body: string;
    /**
     * The optional photograph, already decoded and stored by `saveUpload` before this transaction
     * opened. Only the key and the decoded dimensions cross in; the bytes are never in the database.
     */
    readonly image?: { readonly key: string; readonly width: number; readonly height: number } | null;
  },
): Promise<{ ok: true; reviewId: number } | { ok: false; reason: 'not_purchased' | 'already_reviewed' }> {
  const body = input.body.trim();
  if (body.length < REVIEW_BODY_MIN || body.length > REVIEW_BODY_MAX) {
    throw new ValidationError(`a review must be between ${REVIEW_BODY_MIN} and ${REVIEW_BODY_MAX} characters`);
  }
  if (
    !Number.isInteger(input.ratingHalves) ||
    input.ratingHalves < MIN_RATING_HALVES ||
    input.ratingHalves > MAX_RATING_HALVES ||
    input.ratingHalves % 2 !== 0
  ) {
    throw new ValidationError('choose a whole-star rating between one and five');
  }

  const eligibility = await reviewEligibility(tx, input.customerId, input.productId);
  if (!eligibility.allowed) return { ok: false, reason: eligibility.reason };

  try {
    const inserted = await tx
      .insert(productReview)
      .values({
        productId: input.productId,
        customerId: input.customerId,
        orderId: eligibility.orderId,
        ratingHalves: input.ratingHalves,
        body,
        imageKey: input.image?.key ?? null,
        imageWidth: input.image?.width ?? null,
        imageHeight: input.image?.height ?? null,
        state: 'pending',
      })
      .returning({ id: productReview.id });
    const reviewId = inserted[0]?.id;
    if (reviewId === undefined) throw new Error('review insert returned no id');
    return { ok: true, reviewId };
  } catch (error) {
    // Two concurrent submissions: the loser is a conflict, not a server error.
    if (isUniqueViolation(error)) return { ok: false, reason: 'already_reviewed' };
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (hasCode(error, '23505')) return true;
  return typeof error === 'object' && error !== null && 'cause' in error && hasCode(error.cause, '23505');
}

function hasCode(value: unknown, code: string): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && value.code === code;
}

export type AdminReview = {
  readonly id: number;
  readonly productId: number;
  readonly productName: string;
  readonly productSlug: string;
  readonly customerEmail: string;
  readonly ratingHalves: number;
  readonly body: string;
  /** The customer's photograph, as an asset key, so the owner sees what they would publish. */
  readonly imageKey: string | null;
  readonly state: 'pending' | 'approved' | 'rejected';
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
};

/** One page of the moderation queue, oldest pending first - the order a worklist is worked in. */
export async function listReviewsForAdmin(
  tx: Transaction,
  options: { readonly state?: 'pending' | 'approved' | 'rejected'; readonly limit?: number; readonly offset?: number },
): Promise<AdminReview[]> {
  const state = options.state ?? 'pending';
  // Raw SQL because the queue joins three tables; the driver's row type is cast at this boundary.
  const rows = (await tx.execute(sql`
    select r.id::text as id,
           p.id::text as product_id,
           p.name_en as product_name_en,
           p.slug as product_slug,
           c.email as customer_email,
           r.rating_halves,
           r.body,
           r.image_key,
           r.state,
           r.created_at,
           r.decided_at
    from product_review r
    join product p on p.id = r.product_id
    join customer c on c.id = r.customer_id
    where r.state = ${state}
    order by r.created_at ${state === 'pending' ? sql`asc` : sql`desc`}, r.id asc
    limit ${options.limit ?? 25}
    offset ${options.offset ?? 0}
  `)) as unknown as {
    rows: {
      id: string;
      product_id: string;
      product_name_en: string;
      product_slug: string;
      customer_email: string;
      rating_halves: number;
      body: string;
      image_key: string | null;
      state: string;
      created_at: Date;
      decided_at: Date | null;
    }[];
  };

  return rows.rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.product_id),
    productName: row.product_name_en,
    productSlug: row.product_slug,
    customerEmail: row.customer_email,
    ratingHalves: Number(row.rating_halves),
    body: row.body,
    imageKey: row.image_key,
    state: row.state as AdminReview['state'],
    // Raw SQL hands timestamps back as the driver's string form, not a Date: convert once here so
    // every consumer of `AdminReview` gets the type it declares.
    createdAt: new Date(row.created_at),
    decidedAt: row.decided_at === null ? null : new Date(row.decided_at),
  }));
}

export async function countReviewsForAdmin(
  tx: Transaction,
  state: 'pending' | 'approved' | 'rejected',
): Promise<number> {
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(productReview)
    .where(sql`${productReview.state} = ${state}`);
  return rows[0]?.count ?? 0;
}

/**
 * Publishes or refuses a pending review.
 *
 * A state-guarded update - `where state = 'pending'` - so two owners clicking at once cannot both
 * decide, and a decided review cannot be re-decided. The audit row commits with the decision, and
 * carries the words and stars as they were at that moment, so the trail shows what was published.
 */
export async function decideReview(
  tx: Transaction,
  actor: ActorContext,
  reviewId: number,
  decision: 'approved' | 'rejected',
): Promise<boolean> {
  await requirePermission(actor, PERMISSIONS.reviewModerate, 'review', reviewId);

  const rows = await tx
    .select({
      productId: productReview.productId,
      customerId: productReview.customerId,
      ratingHalves: productReview.ratingHalves,
      body: productReview.body,
      state: productReview.state,
    })
    .from(productReview)
    .where(sql`${productReview.id} = ${reviewId}`);
  const review = rows[0];
  if (review === undefined) throw new ConflictError('no such review');
  if (review.state !== 'pending') throw new ConflictError('that review has already been decided');

  const updated = await tx
    .update(productReview)
    .set({ state: decision, decidedBy: actor.staffUserId, decidedAt: new Date(), updatedAt: new Date() })
    .where(sql`${productReview.id} = ${reviewId} and ${productReview.state} = 'pending'`)
    .returning({ id: productReview.id });

  if (updated.length === 0) throw new ConflictError('that review has already been decided');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: decision === 'approved' ? 'review.published' : 'review.refused',
    entityType: 'review',
    entityId: reviewId,
    after: {
      productId: review.productId,
      ratingHalves: review.ratingHalves,
      // The words are recorded so the trail shows what was published or refused. They are the
      // customer's own text, already stored in the review row itself.
      body: review.body,
      state: decision,
    },
  });

  return true;
}
