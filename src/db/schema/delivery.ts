/**
 * Delivery charges - the owner-configured default and per-district overrides (Phase 19).
 *
 * Two settings rows plus a per-order snapshot on `order_contact.district_code` (which now stores a
 * delivery-area code: `dhaka`, `chattogram` or `others`) and
 * `order.shipping_minor`. The snapshot is what makes a historical order immutable: changing a default
 * or an override here never rewrites what a customer was charged.
 *
 * **The area list itself is not a table.** `src/lib/delivery-areas.ts` is the one canonical list, used
 * by checkout and by the admin panel, so there is no second copy to drift. A stored area code is
 * validated against that list before it is written, and the database rejects a malformed value.
 *
 * The singleton row is required for a configured default: no row means **unconfigured**, which blocks
 * checkout rather than silently charging zero (ADR 0016).
 */

import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { staffUser } from './identity';

/** One row, id = 1. An absent row or a NULL default means "not configured yet". */
export const deliverySetting = pgTable(
  'delivery_setting',
  {
    id: integer('id').primaryKey().default(1),
    defaultMinor: integer('default_minor'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedByStaffId: bigint('updated_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check('delivery_setting_singleton', sql`${t.id} = 1`),
    check(
      'delivery_setting_default_range',
      sql`${t.defaultMinor} is null or (${t.defaultMinor} >= 0 and ${t.defaultMinor} <= 100000000)`,
    ),
  ],
);

/**
 * A district override. `is_active = false` keeps the row (and its history) while returning the
 * district to the default charge; a re-save reactivates the same row rather than creating a duplicate.
 */
export const deliveryDistrictCharge = pgTable(
  'delivery_district_charge',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    districtCode: text('district_code').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedByStaffId: bigint('updated_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('delivery_district_charge_district_unique').on(t.districtCode),
    index('delivery_district_charge_active_idx').on(t.isActive),
    check('delivery_district_charge_code_format', sql`${t.districtCode} ~ '^[a-z][a-z0-9-]{1,40}$'`),
    check(
      'delivery_district_charge_amount_range',
      sql`${t.amountMinor} >= 0 and ${t.amountMinor} <= 100000000`,
    ),
  ],
);
