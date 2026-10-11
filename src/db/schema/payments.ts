import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { customer, staffUser } from './identity';
import { order } from './orders';
import { CLAIM_STATE, PAYMENT_METHOD, REFUND_METHOD, REFUND_STATE, colIn } from './values';

/**
 * Payments, claims and refunds - data-model section 8.
 *
 * `refund` deliberately contains **no reference to inventory, a reservation or a movement**. That
 * absence is the structural guarantee that a refund can never silently restore sellable stock
 * (data-model 8.3).
 */

export const paymentRecipient = pgTable(
  'payment_recipient',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    method: text('method').notNull(),
    accountNumber: text('account_number').notNull(),
    accountLabel: text('account_label').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdByStaffId: bigint('created_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    // Exactly one active recipient per method: the storefront can never show two numbers.
    uniqueIndex('payment_recipient_active_unique')
      .on(t.method)
      .where(sql`${t.isActive}`),
    check('payment_recipient_method_is_mfs', sql`${t.method} in ('bkash', 'nagad')`),
    check('payment_recipient_account_format', sql`${t.accountNumber} ~ '^01[3-9][0-9]{8}$'`),
    check(
      'payment_recipient_deactivated_consistent',
      sql`${t.deactivatedAt} is null or ${t.isActive} = false`,
    ),
  ],
);

export const paymentClaim = pgTable(
  'payment_claim',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    paymentRecipientId: bigint('payment_recipient_id', { mode: 'number' })
      .notNull()
      .references(() => paymentRecipient.id, { onDelete: 'restrict' }),
    senderMsisdn: text('sender_msisdn').notNull(),
    transactionReference: text('transaction_reference').notNull(),
    claimedAmountMinor: integer('claimed_amount_minor').notNull(),
    state: text('state').notNull().default('submitted'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    submittedByCustomerId: bigint('submitted_by_customer_id', { mode: 'number' }).references(
      () => customer.id,
      { onDelete: 'restrict' },
    ),
    recordedByStaffId: bigint('recorded_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    resolvedByStaffId: bigint('resolved_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    resolutionReason: text('resolution_reason'),
    verifiedAmountMinor: integer('verified_amount_minor'),
    mismatchAcknowledged: boolean('mismatch_acknowledged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // The primary enforcement of the D11 one-active-submitted-claim bound, per order.
    uniqueIndex('payment_claim_active_unique')
      .on(t.orderId)
      .where(sql`${t.state} = 'submitted'`),
    index('payment_claim_queue_idx').on(t.state, t.submittedAt),
    // Non-unique on purpose: a duplicate reference must be flagged for a human, not rejected by
    // the database as though it were a validation error (data-model 8.2).
    index('payment_claim_reference_idx').on(t.transactionReference),
    index('payment_claim_sender_idx').on(t.senderMsisdn),
    index('payment_claim_recipient_idx').on(t.paymentRecipientId),
    check('payment_claim_state_valid', colIn('state', CLAIM_STATE)),
    check('payment_claim_sender_format', sql`${t.senderMsisdn} ~ '^01[3-9][0-9]{8}$'`),
    check('payment_claim_reference_len', sql`char_length(${t.transactionReference}) between 6 and 64`),
    check('payment_claim_amount_positive', sql`${t.claimedAmountMinor} > 0`),
    check(
      'payment_claim_verified_needs_actor_and_amount',
      sql`${t.state} <> 'verified' or (${t.resolvedAt} is not null and ${t.resolvedByStaffId} is not null and ${t.verifiedAmountMinor} is not null)`,
    ),
    // Every rejection and false-claim finding carries an auditable reason and actor (D9).
    check(
      'payment_claim_adverse_decision_needs_actor_and_reason',
      sql`${t.state} not in ('rejected', 'falsely_claimed') or (${t.resolvedAt} is not null and ${t.resolvedByStaffId} is not null and ${t.resolutionReason} is not null and char_length(${t.resolutionReason}) >= 10)`,
    ),
    check('payment_claim_withdrawn_is_not_resolved', sql`${t.state} <> 'withdrawn' or ${t.resolvedAt} is null`),
    check(
      'payment_claim_has_origin',
      sql`${t.submittedByCustomerId} is not null or ${t.recordedByStaffId} is not null`,
    ),
    check(
      'payment_claim_mismatch_ack_requires_verified_amount',
      sql`${t.mismatchAcknowledged} = false or ${t.verifiedAmountMinor} is not null`,
    ),
  ],
);

export const refund = pgTable(
  'refund',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(),
    method: text('method').notNull(),
    destinationNote: text('destination_note'),
    state: text('state').notNull().default('requested'),
    reason: text('reason').notNull(),
    requestedByCustomerId: bigint('requested_by_customer_id', { mode: 'number' }).references(
      () => customer.id,
      { onDelete: 'restrict' },
    ),
    recordedByStaffId: bigint('recorded_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    processingAt: timestamp('processing_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    completedByStaffId: bigint('completed_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    evidenceNote: text('evidence_note'),
    externalReference: text('external_reference'),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'date' }),
    failureReason: text('failure_reason'),
  },
  (t) => [
    index('refund_order_idx').on(t.orderId),
    index('refund_queue_idx')
      .on(t.state, t.requestedAt)
      .where(sql`${t.state} in ('requested', 'processing')`),
    check('refund_state_valid', colIn('state', REFUND_STATE)),
    check('refund_method_valid', colIn('method', REFUND_METHOD)),
    check('refund_amount_positive', sql`${t.amountMinor} > 0`),
    check('refund_reason_len', sql`char_length(${t.reason}) >= 3`),
    check(
      'refund_has_origin',
      sql`${t.requestedByCustomerId} is not null or ${t.recordedByStaffId} is not null`,
    ),
    // A refund cannot be marked completed without confirmed evidence and a named actor.
    check(
      'refund_completed_requires_evidence',
      sql`${t.state} <> 'completed' or (${t.completedAt} is not null and ${t.completedByStaffId} is not null and ${t.evidenceNote} is not null and char_length(${t.evidenceNote}) >= 5)`,
    ),
    check(
      'refund_failed_requires_reason',
      sql`${t.state} <> 'failed' or (${t.failedAt} is not null and ${t.failureReason} is not null)`,
    ),
  ],
);

/** Kept for reference: the MFS methods a prepaid order may use. */
export const MFS_PAYMENT_METHODS = PAYMENT_METHOD.filter((m) => m !== 'cod');
