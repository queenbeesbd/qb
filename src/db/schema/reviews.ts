import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { product } from './catalog';
import { customer, staffUser } from './identity';
import { order } from './orders';
import { colIn, REVIEW_STATE } from './values';

/**
 * Product reviews - ADR 0035.
 *
 * One row is one customer's words about one product they bought. Three rules shape the table:
 *
 * 1. **Only a buyer may review.** `order_id` records the order that entitles the customer to speak,
 *    and the server checks that the order is theirs and contains the product before inserting. The
 *    foreign key makes the proof part of the row rather than a claim made only in prose.
 * 2. **One review per customer per product.** The unique index is the rule, not a convention: a
 *    second submission is a refusal, not a second opinion, and editing is deliberately unsupported -
 *    the owner decides what is published, so a customer rewriting the words under an approved review
 *    would change a page the owner had already read.
 * 3. **Publishing is the owner's act.** A row is born `pending` and is visible to nobody but its
 *    author until the owner approves it. `state`, `decided_by` and `decided_at` are the only columns
 *    that may change after insert; `queenbees_guard_review_immutable_body` freezes the rest.
 *
 * The star rating on the row is the customer's own and is shown with their review. It is **never
 * aggregated** into a product figure - the stars a product card draws come from
 * `product.rating_halves`, which the owner sets (`product_rating_halves_valid`).
 */
export const productReview = pgTable(
  'product_review',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'restrict' }),
    /** The order that entitled this customer to review: proof of purchase, not a display field. */
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    /**
     * The customer's rating in **half stars** (2 = one star, 10 = five). Whole stars only: the form
     * offers five choices, and the check below is what keeps a client from inventing a half step.
     */
    ratingHalves: integer('rating_halves').notNull(),
    /** The review itself, as plain text. Never rendered as HTML, never sanitised into markup. */
    body: text('body').notNull(),
    /**
     * An optional photograph the customer attached, as an asset key under `/catalog/` - the same
     * contract product photography uses: our own key, never a URL, so `src/lib/images.ts` derives
     * every rendered path. The bytes are decoded and re-encoded by `saveUpload` (EXIF stripped, 40 MP
     * ceiling), and the key, width and height come from the decoded bytes, never the request.
     *
     * Nullable, and all three columns are null together: a review with no photograph makes no claim
     * about one. The photo is published with the review, so an unpublished review's photo is not
     * linked from anywhere.
     */
    imageKey: text('image_key'),
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    state: text('state').notNull().default('pending'),
    /** The owner account that published or refused it. Null while pending, and required after. */
    decidedBy: bigint('decided_by', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // One opinion per customer per product. Archiving a product does not free the slot.
    uniqueIndex('product_review_customer_product_unique').on(t.customerId, t.productId),
    // The product page reads published reviews newest first.
    index('product_review_published_idx')
      .on(t.productId, t.createdAt.desc())
      .where(sql`${t.state} = 'approved'`),
    // The owner's queue reads the oldest pending review first.
    index('product_review_queue_idx').on(t.state, t.createdAt),
    check('product_review_state_valid', colIn('state', REVIEW_STATE)),
    check(
      'product_review_rating_valid',
      sql`${t.ratingHalves} between 2 and 10 and ${t.ratingHalves} % 2 = 0`,
    ),
    check('product_review_body_len', sql`char_length(${t.body}) between 10 and 1000`),
    // The three photo columns are one fact: all present, or all absent. A key with no dimensions
    // would leave the renderer guessing the frame, and an address with no key would point nowhere.
    check(
      'product_review_image_complete',
      sql`(${t.imageKey} is null and ${t.imageWidth} is null and ${t.imageHeight} is null)
          or (${t.imageKey} is not null and ${t.imageWidth} is not null and ${t.imageHeight} is not null)`,
    ),
    check(
      'product_review_image_key_format',
      sql`${t.imageKey} is null or (${t.imageKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.imageKey}) <= 120)`,
    ),
    check(
      'product_review_image_dimensions_positive',
      sql`${t.imageWidth} is null or (${t.imageWidth} > 0 and ${t.imageHeight} > 0)`,
    ),
    // A decision is a state plus an actor plus a moment, or none of the three. A row cannot claim to
    // have been approved without saying who approved it and when.
    check(
      'product_review_decision_complete',
      sql`(${t.state} = 'pending' and ${t.decidedBy} is null and ${t.decidedAt} is null)
          or (${t.state} in ('approved', 'rejected') and ${t.decidedBy} is not null and ${t.decidedAt} is not null)`,
    ),
  ],
);
