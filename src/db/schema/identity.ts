import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { colIn, lenAtMost, CREDENTIAL_KIND, CUSTOMER_STATUS, RECOVERY_PURPOSE, SESSION_REVOKED_REASON, STAFF_RECOVERY_PURPOSE, STAFF_STATUS, THROTTLE_SCOPE } from './values';

/**
 * Identity, sessions and authorization - data-model section 4.
 *
 * Customer and staff sessions deliberately live in separate tables so that no single query can
 * return both kinds of principal: a missing WHERE clause then cannot escalate privilege
 * (data-model 4.7).
 */

export const customer = pgTable(
  'customer',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    email: text('email').notNull(),
    phone: text('phone'),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('customer_email_lower_unique').on(sql`lower(${t.email})`),
    /**
     * A phone number is a second sign-in identifier (2026-11-11), so it must name exactly one account.
     * Partial, because an email-only account legitimately has none and a plain unique index would still
     * allow only one such row.
     */
    uniqueIndex('customer_phone_unique')
      .on(t.phone)
      .where(sql`${t.phone} is not null`),
    index('customer_status_created_idx').on(t.status, t.createdAt.desc()),
    index('customer_not_deleted_idx').on(t.id).where(sql`${t.deletedAt} is null`),
    check('customer_email_len', lenAtMost('email', 254)),
    check('customer_display_name_len', sql`${t.displayName} is null or char_length(${t.displayName}) <= 80`),
    check('customer_phone_format', sql`${t.phone} is null or ${t.phone} ~ '^01[3-9][0-9]{8}$'`),
    check('customer_status_valid', colIn('status', CUSTOMER_STATUS)),
    check('customer_deleted_implies_status', sql`${t.deletedAt} is null or ${t.status} = 'deleted'`),
  ],
);

export const customerCredential = pgTable(
  'customer_credential',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    secretHash: text('secret_hash').notNull(),
    hashAlgorithm: text('hash_algorithm').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('customer_credential_active_unique')
      .on(t.customerId, t.kind)
      .where(sql`${t.revokedAt} is null`),
    check('customer_credential_kind_valid', colIn('kind', CREDENTIAL_KIND)),
  ],
);

export const customerSession = pgTable(
  'customer_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: text('revoked_reason'),
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    uniqueIndex('customer_session_token_unique').on(t.tokenHash),
    index('customer_session_customer_idx').on(t.customerId, t.absoluteExpiresAt.desc()),
    index('customer_session_live_idx').on(t.idleExpiresAt).where(sql`${t.revokedAt} is null`),
    check('customer_session_absolute_after_created', sql`${t.absoluteExpiresAt} > ${t.createdAt}`),
    check('customer_session_idle_within_absolute', sql`${t.idleExpiresAt} <= ${t.absoluteExpiresAt}`),
    check('customer_session_revoked_reason_valid', sql`${t.revokedReason} is null or ${t.revokedReason} in (${sql.raw(SESSION_REVOKED_REASON.map((v) => `'${v}'`).join(', '))})`),
  ],
);

export const accountRecoveryToken = pgTable(
  'account_recovery_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    requestedIpHash: text('requested_ip_hash'),
  },
  (t) => [
    uniqueIndex('account_recovery_token_hash_unique').on(t.tokenHash),
    uniqueIndex('account_recovery_token_live_unique')
      .on(t.customerId, t.purpose)
      .where(sql`${t.usedAt} is null`),
    check('account_recovery_token_purpose_valid', colIn('purpose', RECOVERY_PURPOSE)),
  ],
);

export const authThrottle = pgTable(
  'auth_throttle',
  {
    scope: text('scope').notNull(),
    subjectHash: text('subject_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
    attempts: integer('attempts').notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.subjectHash, t.windowStart] }),
    check('auth_throttle_scope_valid', colIn('scope', THROTTLE_SCOPE)),
    check('auth_throttle_attempts_non_negative', sql`${t.attempts} >= 0`),
  ],
);

export const staffUser = pgTable(
  'staff_user',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('staff_user_email_lower_unique').on(sql`lower(${t.email})`),
    check('staff_user_status_valid', colIn('status', STAFF_STATUS)),
    check('staff_user_disabled_consistent', sql`${t.disabledAt} is null or ${t.status} = 'disabled'`),
  ],
);

export const staffCredential = pgTable(
  'staff_credential',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    staffUserId: bigint('staff_user_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    secretHash: text('secret_hash').notNull(),
    hashAlgorithm: text('hash_algorithm').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('staff_credential_active_unique')
      .on(t.staffUserId, t.kind)
      .where(sql`${t.revokedAt} is null`),
    check('staff_credential_kind_valid', colIn('kind', CREDENTIAL_KIND)),
  ],
);

export const staffSession = pgTable(
  'staff_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffUserId: bigint('staff_user_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: text('revoked_reason'),
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
  },
  (t) => [
    uniqueIndex('staff_session_token_unique').on(t.tokenHash),
    index('staff_session_staff_idx').on(t.staffUserId, t.absoluteExpiresAt.desc()),
    check('staff_session_absolute_after_created', sql`${t.absoluteExpiresAt} > ${t.createdAt}`),
    check('staff_session_idle_within_absolute', sql`${t.idleExpiresAt} <= ${t.absoluteExpiresAt}`),
  ],
);

/**
 * `staff_recovery_token` - the staff half of `account_recovery_token` (data-model 4.4).
 *
 * A separate table for the same reason the session tables are separate: a customer-scoped query must
 * not be able to reach a staff credential path, and a missing `WHERE` must not become a privilege
 * escalation. Unlike the customer flow, issuance is always by an identified owner-level actor -
 * `issued_by_staff_id` is `NOT NULL`, so an anonymous issuance is impossible by construction.
 */
export const staffRecoveryToken = pgTable(
  'staff_recovery_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffUserId: bigint('staff_user_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    /** SHA-256 of a 256-bit random token. The raw value is never stored. */
    tokenHash: text('token_hash').notNull(),
    issuedByStaffId: bigint('issued_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('staff_recovery_token_hash_unique').on(t.tokenHash),
    // Only one live token per purpose, so a re-issue cannot leave a second usable secret behind.
    uniqueIndex('staff_recovery_token_live_unique')
      .on(t.staffUserId, t.purpose)
      .where(sql`${t.usedAt} is null`),
    index('staff_recovery_token_staff_idx').on(t.staffUserId, t.createdAt.desc()),
    check('staff_recovery_token_purpose_valid', colIn('purpose', STAFF_RECOVERY_PURPOSE)),
    check('staff_recovery_token_expires_after_created', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const role = pgTable(
  'role',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isOwnerLevel: boolean('is_owner_level').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('role_code_unique').on(t.code),
    check('role_code_format', sql`${t.code} ~ '^[a-z][a-z0-9_.]*$'`),
  ],
);

export const permission = pgTable(
  'permission',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull(),
    description: text('description'),
    isPrivileged: boolean('is_privileged').notNull().default(false),
  },
  (t) => [
    uniqueIndex('permission_code_unique').on(t.code),
    check('permission_code_format', sql`${t.code} ~ '^[a-z][a-z0-9_.]*$'`),
  ],
);

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    permissionId: bigint('permission_id', { mode: 'number' })
      .notNull()
      .references(() => permission.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const staffRole = pgTable(
  'staff_role',
  {
    staffUserId: bigint('staff_user_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    grantedBy: bigint('granted_by', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.staffUserId, t.roleId] })],
);

/**
 * A pending change of a customer's registered email address (ADR 0030).
 *
 * **The address on `customer.email` does not move when the customer types a new one.** This row holds
 * the address *requested*, the digest of the confirmation token mailed to it, and the instant it stops
 * being accepted; the update happens only when that link is used. So a typo cannot lock somebody out of
 * their own account, and a stolen session alone cannot move the login identifier to an address the
 * attacker controls - the confirmation is delivered to the new address, which the requester must own.
 *
 * One live row per customer (partial unique on `customer_id` where `used_at is null`), so requesting a
 * second change supersedes the first rather than leaving two links that both work.
 */
export const customerEmailChange = pgTable(
  'customer_email_change',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: bigint('customer_id', { mode: 'number' })
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    /** The requested address, normalised. It is not the account's address until the link is used. */
    newEmail: text('new_email').notNull(),
    /** SHA-256 of the token mailed to `new_email`. The raw token exists only in that message. */
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    /** Digest of the requesting address, for correlation only. The address itself is never stored. */
    requestedIpHash: text('requested_ip_hash'),
  },
  (t) => [
    uniqueIndex('customer_email_change_token_unique').on(t.tokenHash),
    uniqueIndex('customer_email_change_live_unique')
      .on(t.customerId)
      .where(sql`${t.usedAt} is null`),
    index('customer_email_change_customer_idx').on(t.customerId, t.createdAt.desc()),
    check('customer_email_change_email_len', sql`char_length(${t.newEmail}) between 3 and 254`),
    check('customer_email_change_expiry_after_created', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);
