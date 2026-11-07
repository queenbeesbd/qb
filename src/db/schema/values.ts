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

/** The two frames an offer popup accepts: a square or a 16:9 banner. */
export const OFFER_POPUP_ASPECTS = ['square', 'wide'] as const;

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

/**
 * `staff_recovery_token.purpose`.
 *
 * Staff credential setup is **owner-issued**, never self-service: no mail provider is authorized, so
 * a reset link cannot be delivered, and the alternative - the owner choosing a colleague's password -
 * would make every staff password known to the owner. `initial_credential` is a new staff member's
 * first credential; `password_reset` is a replacement.
 */
export const STAFF_RECOVERY_PURPOSE = ['initial_credential', 'password_reset'] as const;
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

/**
 * `product.availability` - the owner-controlled In Stock / Out of Stock state (D19, ADR 0009 and
 * ADR 0010).
 *
 * Deliberately only two values. It is **not** a quantity, a countdown or a restock signal: it is the
 * owner's statement about whether the product can be ordered, and it is the gate the authoritative
 * server-side orderability check reads. `unknown` existed only in the Phase 1 demo fixture and is not
 * a state the owner can set, because "unknown" cannot be stored as an owner decision.
 */
export const PRODUCT_AVAILABILITY = ['in_stock', 'out_of_stock'] as const;

export const IMAGE_RIGHTS_STATUS = ['unknown', 'pending_confirmation', 'cleared', 'restricted'] as const;

/**
 * The brand slug that stands in for "no brand published".
 *
 * `product.brand_id` is `NOT NULL` by design (`docs/data-model.md` 5.1), but the Phase 1 catalog
 * publishes two products with no brand. Those two are attached to this single documented placeholder
 * row so the seeded catalog reproduces the fixture exactly.
 *
 * It is a **storage** convention, not a brand: the catalog projection maps it back to `null`, so no
 * customer is shown an invented brand name and the brand filter list stays the twelve brands the
 * catalog actually has.
 *
 * Open finding: whether a product may genuinely have no brand - and so whether `brand_id` should be
 * nullable - is a decision about the data model, not an implementation detail of the storefront
 * cutover. Until that decision is taken, this placeholder is the representation and this constant is
 * the single definition of it.
 */
export const UNBRANDED_BRAND_SLUG = 'unbranded';
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

export const ORDER_EVENT_ACTOR = ['customer', 'guest', 'staff', 'system'] as const;
export const AUDIT_ACTOR = ['staff', 'system'] as const;
export const FLAG_TYPE = ['review'] as const;
export const FLAG_STATE = ['raised', 'cleared'] as const;
export const IDEMPOTENCY_SCOPE = ['order_create', 'claim_submit', 'refund_request', 'cod_approve'] as const;
export const IDEMPOTENCY_PRINCIPAL = ['customer', 'staff', 'guest'] as const;
export const SETTING_VALUE_TYPE = ['money_minor', 'integer', 'text', 'boolean'] as const;

/**
 * First-party visit tracking (ADR 0027, owner-approved 2026-11-07).
 *
 * The shop measures its own storefront: one row per browsing session and one row per step. There is
 * no third-party analytics product, no cross-site identifier and no stored IP address.
 */
export const VISIT_EVENT_KINDS = ['page_view', 'cart_add', 'checkout_start', 'order_placed'] as const;
export const VISIT_DEVICES = ['phone', 'tablet', 'desktop'] as const;

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
