import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { productVariant } from './catalog';
import { customer, staffUser } from './identity';
import { inventoryMovement } from './inventory';
import {
  CANCELLATION_STATE,
  COD_STATE,
  ORDER_EVENT_ACTOR,
  ORDER_EVENT_TYPE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATE,
  RETURN_REASON,
  RETURN_STATE,
  colIn,
} from './values';

/**
 * Orders - data-model section 7.
 *
 * Three separate state columns, not one: fulfilment, prepaid money and COD are different
 * processes with different actors, and collapsing them is the error D9 forbids.
 */

export const order = pgTable(
  'order',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderNumber: text('order_number').notNull(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('BDT'),
    paymentMethod: text('payment_method').notNull(),
    status: text('status').notNull().default('pending'),
    paymentState: text('payment_state').notNull(),
    codState: text('cod_state').notNull().default('not_applicable'),
    itemsSubtotalMinor: integer('items_subtotal_minor').notNull(),
    shippingMinor: integer('shipping_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    shippedAt: timestamp('shipped_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelledReason: text('cancelled_reason'),
    expiredAt: timestamp('expired_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_number_unique').on(t.orderNumber),
    index('order_customer_idx').on(t.customerId, t.placedAt.desc()),
    index('order_verification_queue_idx')
      .on(t.paymentState, t.placedAt)
      .where(sql`${t.paymentState} = 'awaiting_verification'`),
    index('order_cod_queue_idx')
      .on(t.codState, t.placedAt)
      .where(sql`${t.codState} = 'cod_pending_approval'`),
    index('order_status_idx').on(t.status, t.placedAt.desc()),
    index('order_expiry_sweep_idx').on(t.expiresAt).where(sql`${t.expiresAt} is not null`),
    check('order_currency_bdt', sql`${t.currency} = 'BDT'`),
    check('order_payment_method_valid', colIn('payment_method', PAYMENT_METHOD)),
    check('order_status_valid', colIn('status', ORDER_STATUS)),
    check('order_payment_state_valid', colIn('payment_state', PAYMENT_STATE)),
    check('order_cod_state_valid', colIn('cod_state', COD_STATE)),
    check('order_amounts_non_negative', sql`${t.itemsSubtotalMinor} >= 0 and ${t.shippingMinor} >= 0`),
    check('order_total_is_sum', sql`${t.totalMinor} = ${t.itemsSubtotalMinor} + ${t.shippingMinor}`),
    // A COD order has no MFS payment state, and a prepaid order always does.
    check(
      'order_cod_payment_state_consistent',
      sql`(${t.paymentMethod} = 'cod') = (${t.paymentState} = 'not_applicable')`,
    ),
    // COD state exists only for COD.
    check(
      'order_cod_state_only_for_cod',
      sql`(${t.paymentMethod} = 'cod') = (${t.codState} <> 'not_applicable')`,
    ),
    check('order_cancelled_has_reason', sql`${t.cancelledAt} is null or ${t.cancelledReason} is not null`),
    // The approved 24-hour expiry duration, encoded so policy drift cannot happen silently.
    check(
      'order_expiry_is_24_hours',
      sql`${t.expiresAt} is null or ${t.expiresAt} = ${t.placedAt} + interval '24 hours'`,
    ),
    check('order_expired_has_timestamp', sql`${t.paymentState} <> 'expired' or ${t.expiredAt} is not null`),
  ],
);

export const orderContact = pgTable(
  'order_contact',
  {
    orderId: bigint('order_id', { mode: 'number' })
      .primaryKey()
      .references(() => order.id, { onDelete: 'cascade' }),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    addressLine: text('address_line').notNull(),
    /** Stable delivery-area code from `src/lib/delivery-areas.ts`; NULL on orders that predate Phase 19. */
    districtCode: text('district_code'),
    area: text('area').notNull(),
    city: text('city').notNull(),
    postcode: text('postcode'),
    deliveryNote: text('delivery_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('order_contact_name_len', sql`char_length(${t.recipientName}) between 2 and 120`),
    check('order_contact_phone_format', sql`${t.recipientPhone} ~ '^01[3-9][0-9]{8}$'`),
    check('order_contact_address_len', sql`char_length(${t.addressLine}) between 5 and 300`),
    check(
      'order_contact_district_format',
      sql`${t.districtCode} is null or ${t.districtCode} ~ '^[a-z][a-z0-9-]{1,40}$'`,
    ),
    check('order_contact_area_len', sql`char_length(${t.area}) <= 80`),
    check('order_contact_city_len', sql`char_length(${t.city}) <= 80`),
    check('order_contact_note_len', sql`${t.deliveryNote} is null or char_length(${t.deliveryNote}) <= 300`),
  ],
);

export const orderItem = pgTable(
  'order_item',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    variantId: bigint('variant_id', { mode: 'number' })
      .notNull()
      .references(() => productVariant.id, { onDelete: 'restrict' }),
    productNameBn: text('product_name_bn').notNull(),
    productNameEn: text('product_name_en').notNull(),
    variantLabel: text('variant_label'),
    sku: text('sku').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    compareAtPriceMinor: integer('compare_at_price_minor'),
    quantity: integer('quantity').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
    imageKeySnapshot: text('image_key_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('order_item_order_idx').on(t.orderId),
    index('order_item_variant_idx').on(t.variantId),
    check('order_item_unit_price_non_negative', sql`${t.unitPriceMinor} >= 0`),
    check('order_item_quantity_positive', sql`${t.quantity} > 0`),
    check('order_item_line_total_matches', sql`${t.lineTotalMinor} = ${t.unitPriceMinor} * ${t.quantity}`),
    check(
      'order_item_compare_at_strictly_greater',
      sql`${t.compareAtPriceMinor} is null or ${t.compareAtPriceMinor} > ${t.unitPriceMinor}`,
    ),
  ],
);

export const orderEvent = pgTable(
  'order_event',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    eventKey: text('event_key'),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    actorType: text('actor_type').notNull(),
    actorCustomerId: bigint('actor_customer_id', { mode: 'number' }).references(() => customer.id, {
      onDelete: 'restrict',
    }),
    actorStaffId: bigint('actor_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    reason: text('reason'),
    payload: jsonb('payload'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_event_key_unique')
      .on(t.eventKey)
      .where(sql`${t.eventKey} is not null`),
    index('order_event_order_idx').on(t.orderId, t.occurredAt),
    index('order_event_type_idx').on(t.eventType, t.occurredAt.desc()),
    check('order_event_type_valid', colIn('event_type', ORDER_EVENT_TYPE)),
    check('order_event_actor_valid', colIn('actor_type', ORDER_EVENT_ACTOR)),
    check(
      'order_event_customer_actor_consistent',
      sql`(${t.actorType} = 'customer') = (${t.actorCustomerId} is not null)`,
    ),
    check(
      'order_event_staff_actor_consistent',
      sql`(${t.actorType} = 'staff') = (${t.actorStaffId} is not null)`,
    ),
    check(
      'order_event_system_actor_has_no_actor',
      sql`${t.actorType} <> 'system' or (${t.actorCustomerId} is null and ${t.actorStaffId} is null)`,
    ),
  ],
);

export const cancellationRequest = pgTable(
  'cancellation_request',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    requestedByCustomerId: bigint('requested_by_customer_id', { mode: 'number' }).references(
      () => customer.id,
      { onDelete: 'restrict' },
    ),
    recordedByStaffId: bigint('recorded_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    reason: text('reason').notNull(),
    state: text('state').notNull().default('open'),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decidedByStaffId: bigint('decided_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    decisionReason: text('decision_reason'),
    convertedReturnId: bigint('converted_return_id', { mode: 'number' }).references(
      (): AnyPgColumn => customerReturn.id,
      { onDelete: 'restrict' },
    ),
  },
  (t) => [
    uniqueIndex('cancellation_request_open_unique')
      .on(t.orderId)
      .where(sql`${t.state} = 'open'`),
    index('cancellation_request_order_idx').on(t.orderId),
    check('cancellation_request_state_valid', colIn('state', CANCELLATION_STATE)),
    check('cancellation_request_reason_len', sql`char_length(${t.reason}) between 3 and 300`),
    check(
      'cancellation_request_has_origin',
      sql`${t.requestedByCustomerId} is not null or ${t.recordedByStaffId} is not null`,
    ),
    check(
      'cancellation_request_decided_consistent',
      sql`${t.state} in ('open', 'withdrawn') or (${t.decidedAt} is not null and ${t.decidedByStaffId} is not null)`,
    ),
    check(
      'cancellation_request_rejection_has_reason',
      sql`${t.state} <> 'rejected' or ${t.decisionReason} is not null`,
    ),
    check(
      'cancellation_request_conversion_links_return',
      sql`${t.state} <> 'converted_to_return' or ${t.convertedReturnId} is not null`,
    ),
  ],
);

export const customerReturn = pgTable(
  'customer_return',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    orderItemId: bigint('order_item_id', { mode: 'number' })
      .notNull()
      .references(() => orderItem.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    reason: text('reason').notNull(),
    state: text('state').notNull().default('requested'),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }),
    inspectedAt: timestamp('inspected_at', { withTimezone: true, mode: 'date' }),
    inspectedByStaffId: bigint('inspected_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    inspectionNote: text('inspection_note'),
    restockMovementId: bigint('restock_movement_id', { mode: 'number' }).references(
      (): AnyPgColumn => inventoryMovement.id,
      { onDelete: 'restrict' },
    ),
  },
  (t) => [
    uniqueIndex('customer_return_live_unique')
      .on(t.orderItemId)
      .where(sql`${t.state} not in ('closed', 'inspected_rejected')`),
    index('customer_return_order_idx').on(t.orderId),
    check('customer_return_state_valid', colIn('state', RETURN_STATE)),
    check('customer_return_reason_valid', colIn('reason', RETURN_REASON)),
    check('customer_return_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'customer_return_inspection_has_actor',
      sql`${t.state} not in ('inspected_accepted', 'inspected_rejected', 'closed') or (${t.inspectedAt} is not null and ${t.inspectedByStaffId} is not null)`,
    ),
    check(
      'customer_return_rejection_has_note',
      sql`${t.state} <> 'inspected_rejected' or ${t.inspectionNote} is not null`,
    ),
    // Stock cannot be restored by a return that has not been accepted after inspection.
    check(
      'customer_return_restock_requires_acceptance',
      sql`${t.restockMovementId} is null or ${t.state} = 'inspected_accepted'`,
    ),
  ],
);
