import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { customer, staffUser } from './identity';
import { order } from './orders';
import { paymentClaim } from './payments';
import {
  AUDIT_ACTOR,
  EXCEPTION_SEVERITY,
  EXCEPTION_STATE,
  EXCEPTION_TYPE,
  FLAG_STATE,
  FLAG_TYPE,
  IDEMPOTENCY_PRINCIPAL,
  IDEMPOTENCY_SCOPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATE,
  SETTING_VALUE_TYPE,
  colIn,
} from './values';

/**
 * Operations: notifications, exceptions, audit, idempotency, settings - data-model section 9.
 *
 * `audit_event` has no customer actor type: there is no code path by which a customer can write
 * an audit row, and the absence of the value is what makes that structural rather than a rule.
 */

export const customerNotification = pgTable(
  'customer_notification',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    orderId: bigint('order_id', { mode: 'number' }).references(() => order.id, { onDelete: 'cascade' }),
    eventKey: text('event_key').notNull(),
    titleKey: text('title_key').notNull(),
    params: jsonb('params'),
    channel: text('channel').notNull().default('in_app'),
    state: text('state').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    // A retried transition cannot notify twice.
    uniqueIndex('customer_notification_event_unique').on(t.customerId, t.eventKey, t.orderId),
    index('customer_notification_unread_idx')
      .on(t.customerId, t.createdAt.desc())
      .where(sql`${t.readAt} is null`),
    check('customer_notification_channel_valid', colIn('channel', NOTIFICATION_CHANNEL)),
    check('customer_notification_state_valid', colIn('state', NOTIFICATION_STATE)),
  ],
);

export const operationalException = pgTable(
  'operational_exception',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    type: text('type').notNull(),
    orderId: bigint('order_id', { mode: 'number' }).references(() => order.id, { onDelete: 'restrict' }),
    subjectKey: text('subject_key').notNull(),
    severity: text('severity').notNull(),
    state: text('state').notNull().default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    acknowledgedByStaffId: bigint('acknowledged_by_staff_id', { mode: 'number' }).references(
      () => staffUser.id,
      { onDelete: 'restrict' },
    ),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, mode: 'date' }),
    resolvedByStaffId: bigint('resolved_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    note: text('note'),
  },
  (t) => [
    // The same problem cannot be queued twice.
    uniqueIndex('operational_exception_live_unique')
      .on(t.type, t.subjectKey)
      .where(sql`${t.state} in ('open', 'acknowledged')`),
    index('operational_exception_queue_idx').on(t.state, t.severity, t.openedAt),
    check('operational_exception_type_valid', colIn('type', EXCEPTION_TYPE)),
    check('operational_exception_severity_valid', colIn('severity', EXCEPTION_SEVERITY)),
    check('operational_exception_state_valid', colIn('state', EXCEPTION_STATE)),
    // An exception is closed by a person, with a note - never auto-resolved.
    check(
      'operational_exception_closed_needs_actor_and_note',
      sql`${t.state} not in ('resolved', 'dismissed') or (${t.resolvedAt} is not null and ${t.note} is not null)`,
    ),
  ],
);

export const auditEvent = pgTable(
  'audit_event',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    actorStaffId: bigint('actor_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    actorRoleCodes: text('actor_role_codes').array().notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: bigint('entity_id', { mode: 'number' }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    index('audit_event_entity_idx').on(t.entityType, t.entityId, t.occurredAt.desc()),
    index('audit_event_actor_idx').on(t.actorStaffId, t.occurredAt.desc()),
    index('audit_event_action_idx').on(t.action, t.occurredAt.desc()),
    index('audit_event_occurred_idx').on(t.occurredAt),
    check('audit_event_actor_type_valid', colIn('actor_type', AUDIT_ACTOR)),
    check(
      'audit_event_staff_actor_consistent',
      sql`(${t.actorType} = 'staff') = (${t.actorStaffId} is not null)`,
    ),
    check('audit_event_action_not_empty', sql`${t.action} <> ''`),
  ],
);

export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    principalKind: text('principal_kind').notNull(),
    principalId: bigint('principal_id', { mode: 'number' }).notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    resultRef: text('result_ref'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    index('idempotency_key_expiry_idx').on(t.expiresAt),
    check('idempotency_key_scope_valid', colIn('scope', IDEMPOTENCY_SCOPE)),
    check('idempotency_key_principal_valid', colIn('principal_kind', IDEMPOTENCY_PRINCIPAL)),
    check('idempotency_key_key_len', sql`char_length(${t.key}) between 16 and 128`),
    check('idempotency_key_expires_after_created', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const storeSetting = pgTable(
  'store_setting',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    valueType: text('value_type').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedByStaffId: bigint('updated_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check('store_setting_key_format', sql`${t.key} ~ '^[a-z][a-z0-9_.]*$'`),
    check('store_setting_value_type_valid', colIn('value_type', SETTING_VALUE_TYPE)),
  ],
);

export const customerFlag = pgTable(
  'customer_flag',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'restrict' }),
    orderId: bigint('order_id', { mode: 'number' }).references(() => order.id, { onDelete: 'restrict' }),
    paymentClaimId: bigint('payment_claim_id', { mode: 'number' }).references(() => paymentClaim.id, {
      onDelete: 'restrict',
    }),
    type: text('type').notNull().default('review'),
    state: text('state').notNull().default('raised'),
    reason: text('reason').notNull(),
    raisedByStaffId: bigint('raised_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    raisedAt: timestamp('raised_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    clearedByStaffId: bigint('cleared_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    clearedAt: timestamp('cleared_at', { withTimezone: true, mode: 'date' }),
    clearReason: text('clear_reason'),
  },
  (t) => [
    // At most one live flag per customer: flags cannot accumulate silently.
    uniqueIndex('customer_flag_live_unique')
      .on(t.customerId)
      .where(sql`${t.state} = 'raised'`),
    index('customer_flag_customer_idx').on(t.customerId, t.raisedAt.desc()),
    check('customer_flag_type_valid', colIn('type', FLAG_TYPE)),
    check('customer_flag_state_valid', colIn('state', FLAG_STATE)),
    // Raising a flag always names a person. There is no system actor, so no timer, expiry,
    // rejection or duplicate-reference detection can create one (data-model 11.8).
    check('customer_flag_reason_len', sql`char_length(${t.reason}) >= 10`),
    check(
      'customer_flag_cleared_consistent',
      sql`${t.state} <> 'cleared' or (${t.clearedByStaffId} is not null and ${t.clearedAt} is not null and ${t.clearReason} is not null)`,
    ),
  ],
);
