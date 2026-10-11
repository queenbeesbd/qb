import { sql, type SQL } from 'drizzle-orm';

/**
 * Single source of truth for every enumerated state value in the schema.
 *
 * These lists mirror `docs/data-model.md` exactly. They exist so a state value can never be
 * spelled differently in the schema than it is in the design, and so the tests can assert the
 * database accepts precisely the documented set.
 *
 * Changing a list here changes a CHECK constraint, which is a migration - not a code change.
 */

/** `order.status` - fulfilment position only (data-model 7.1). */
export const ORDER_STATUS = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'returned',
] as const;

/** `order.payment_state` - prepaid money position (data-model 7.1). */
export const PAYMENT_STATE = [
  'awaiting_payment',
  'awaiting_verification',
  'verified',
  'rejected',
  'falsely_claimed',
  'expired',
  'not_applicable',
] as const;

/**
 * `order.cod_state` - COD lifecycle (data-model 7.1, 11.6).
 * The four approved D9 names are used verbatim; `cod_reconciled` is the single addition D9
 * requires because cash reconciliation is a separate state from collection.
 */
export const COD_STATE = [
  'not_applicable',
  'cod_pending_approval',
  'cod_approved',
  'cod_collected',
  'cod_failed',
  'cod_reconciled',
] as const;

export const PAYMENT_METHOD = ['bkash', 'nagad', 'cod'] as const;

/** `payment_claim.state` (data-model 8.2, 11.3). */
export const CLAIM_STATE = ['submitted', 'verified', 'rejected', 'falsely_claimed', 'withdrawn'] as const;

/** `stock_reservation.state` (data-model 6.3, 11.4). Deliberately only three values. */
export const RESERVATION_STATE = ['held', 'consumed', 'released'] as const;

export const RELEASE_REASON = [
  'expired_unpaid',
  'cancelled_by_support',
  'preempted_by_claim',
  'confirmed_false_claim',
  'order_abandoned',
] as const;

export const MOVEMENT_REASON = [
  'stock_received',
  'stock_adjustment',
  'order_reserved',
  'reservation_released',
  'order_consumed',
  'return_restocked',
  'return_written_off',
] as const;

/** `refund.state` (data-model 8.3, 11.5). Exactly the four approved states. */
export const REFUND_STATE = ['requested', 'processing', 'completed', 'failed'] as const;

export const REFUND_METHOD = ['bkash', 'nagad', 'cash', 'other'] as const;

export const CUSTOMER_STATUS = ['active', 'suspended', 'deleted'] as const;
export const STAFF_STATUS = ['active', 'disabled'] as const;
export const CREDENTIAL_KIND = ['password', 'passkey', 'oauth'] as const;
export const RECOVERY_PURPOSE = ['password_reset', 'email_verify'] as const;
export const SESSION_REVOKED_REASON = ['logout', 'password_change', 'admin_revoke', 'reuse_detected'] as const;
export const THROTTLE_SCOPE = ['login', 'register', 'recovery', 'claim_submit'] as const;

export const CANCELLATION_STATE = ['open', 'approved', 'rejected', 'withdrawn', 'converted_to_return'] as const;

export const RETURN_STATE = [
  'requested',
  'approved',
  'in_transit',
  'received',
  'inspected_accepted',
  'inspected_rejected',
  'closed',
] as const;

export const RETURN_REASON = [
  'refused_on_delivery',
  'failed_delivery',
  'customer_return',
  'damaged_in_transit',
  'wrong_item',
] as const;

export const IMAGE_RIGHTS_STATUS = ['unknown', 'pending_confirmation', 'cleared', 'restricted'] as const;
export const IMAGE_FORMAT = ['webp', 'jpeg'] as const;
export const IMPORT_ENTITY_TYPE = ['product', 'brand', 'category', 'product_image'] as const;
export const NOTIFICATION_CHANNEL = ['in_app', 'email', 'sms'] as const;
export const NOTIFICATION_STATE = ['pending', 'sent', 'failed', 'not_attempted'] as const;

export const EXCEPTION_TYPE = [
  'verification_overdue',
  'payment_mismatch',
  'duplicate_reference',
  'reservation_conflict',
  'unreconciled_collection',
  'storage_orphan',
  'expired_unpaid',
  'refund_stalled',
] as const;

export const EXCEPTION_SEVERITY = ['info', 'warning', 'critical'] as const;
export const EXCEPTION_STATE = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;

export const ORDER_EVENT_TYPE = [
  'order_placed',
  'claim_submitted',
  'claim_withdrawn',
  'payment_verified',
  'payment_rejected',
  'payment_falsely_claimed',
  'order_confirmed',
  'order_processing',
  'order_shipped',
  'order_delivered',
  'order_completed',
  'order_cancelled',
  'order_expired',
  'reservation_held',
  'reservation_released',
  'reservation_consumed',
  'cod_approved',
  'cod_collected',
  'cod_failed',
  'cod_reconciled',
  'cancellation_requested',
  'cancellation_decided',
  'return_requested',
  'return_received',
  'return_inspected',
  'refund_requested',
  'refund_processing',
  'refund_completed',
  'refund_failed',
] as const;

export const ORDER_EVENT_ACTOR = ['customer', 'staff', 'system'] as const;
export const AUDIT_ACTOR = ['staff', 'system'] as const;
export const FLAG_TYPE = ['review'] as const;
export const FLAG_STATE = ['raised', 'cleared'] as const;
export const IDEMPOTENCY_SCOPE = ['order_create', 'claim_submit', 'refund_request', 'cod_approve'] as const;
export const IDEMPOTENCY_PRINCIPAL = ['customer', 'staff'] as const;
export const SETTING_VALUE_TYPE = ['money_minor', 'integer', 'text', 'boolean'] as const;

/**
 * Builds `"col" in ('a', 'b')` for a CHECK constraint.
 *
 * The column name and the values are both compile-time constants defined in this file, never
 * request data, so there is no injection surface. `sql.raw` is used because a CHECK constraint
 * must contain literals, not bind parameters.
 */
export function colIn(column: string, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  return sql.raw(`"${column}" in (${list})`);
}

/** `char_length("col") between <min> and <max>`. */
export function lenBetween(column: string, min: number, max: number): SQL {
  return sql.raw(`char_length("${column}") between ${min} and ${max}`);
}

/** `char_length("col") <= <max>`. */
export function lenAtMost(column: string, max: number): SQL {
  return sql.raw(`char_length("${column}") <= ${max}`);
}
