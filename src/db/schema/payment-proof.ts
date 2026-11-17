import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { staffUser } from './identity';
import { order } from './orders';
import { colIn, PAYMENT_PROOF_REVIEW_STATE, PAYMENT_PROOF_UPLOADER } from './values';

/**
 * One optional screenshot of an advance payment, per order - ADR 0042.
 *
 * **This table does not make anything paid.** Cash on Delivery is still the only method an order
 * records (ADR 0015), and nothing here touches `order.payment_state`, `order.cod_state`, `order.status`,
 * the charged total, stock or refunds. The row is a customer's own attachment plus the owner's reading
 * of it: `pending` until the owner compares it with the shop's bKash statement and marks it `checked`
 * or `rejected`. It is evidence a human looks at, never a state the system trusts.
 *
 * **One row per order.** A re-upload replaces the file columns and resets the decision to `pending`,
 * because a new screenshot is a new claim and an old "checked" must not silently cover it. The unique
 * index is the rule, so no code path can accumulate a second image behind the first.
 *
 * **The bytes are private.** `storage_key` names an object outside the public catalog tree
 * (`payment-proof/...`); a screenshot carries a transaction id and a phone number, so it is served only
 * through an authenticated `order.read` route, never as a public asset path (ADR 0006's catalog
 * contract does not apply to it).
 */
export const paymentProof = pgTable(
  'payment_proof',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    /** Our own key, never a provider URL. The route that reads it is permission-gated. */
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** `customer` for the only upload path that exists today; `staff` is reserved, not offered. */
    uploadedBy: text('uploaded_by').notNull().default('customer'),
    reviewState: text('review_state').notNull().default('pending'),
    /** The owner account that read it. Null while pending, and required once decided. */
    reviewedBy: bigint('reviewed_by', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    /** Required on a rejection (the reason is typed), optional on a check. */
    reviewNote: text('review_note'),
  },
  (t) => [
    uniqueIndex('payment_proof_order_unique').on(t.orderId),
    check('payment_proof_uploaded_by_valid', colIn('uploaded_by', PAYMENT_PROOF_UPLOADER)),
    check('payment_proof_review_state_valid', colIn('review_state', PAYMENT_PROOF_REVIEW_STATE)),
    // A decision is a state plus an actor plus a moment, or none of the three.
    check(
      'payment_proof_decision_complete',
      sql`(${t.reviewState} = 'pending' and ${t.reviewedBy} is null and ${t.reviewedAt} is null)
          or (${t.reviewState} in ('checked', 'rejected') and ${t.reviewedBy} is not null and ${t.reviewedAt} is not null)`,
    ),
    // A refusal states why. "Rejected" with no words leaves the next reader guessing, and the owner
    // typing the reason is the only record of what was wrong with the screenshot.
    check(
      'payment_proof_rejection_reason',
      sql`${t.reviewState} <> 'rejected'
          or (${t.reviewNote} is not null and char_length(btrim(${t.reviewNote})) between 3 and 500)`,
    ),
    check('payment_proof_byte_size_positive', sql`${t.byteSize} > 0`),
    check('payment_proof_dimensions_positive', sql`${t.width} > 0 and ${t.height} > 0`),
    // The key names one object under the private prefix and nothing else - no traversal, no scheme.
    check(
      'payment_proof_storage_key_format',
      sql`${t.storageKey} ~ '^payment-proof/[a-z0-9]+(-[a-z0-9]+)*\\.webp$'
          and char_length(${t.storageKey}) <= 160`,
    ),
  ],
);
