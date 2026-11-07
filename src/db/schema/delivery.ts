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

/**
 * One row, id = 1. An absent row or a NULL default means "not configured yet".
 *
 * The same row carries the three optional pricing rules the owner can switch on (ADR 0029):
 *
 * - **conditional** - a lower delivery charge for a signed-in customer whose subtotal reaches a
 *   minimum, priced per area;
 * - **repeat delivery** - a signed-in customer with a completed order pays the repeat rate;
 * - **repeat discount** - a percentage off the goods for that same customer, above a minimum.
 *
 * Every value is nullable and every rule has its own switch defaulting to **off**, so an upgrade
 * behaves exactly as the configuration did before: the default charge, no conditional rate, no
 * repeat benefit. A rule that is switched on but missing a value for an area falls through to the
 * next rule rather than charging a guessed number - see `src/lib/delivery.ts`.
 */
export const deliverySetting = pgTable(
  'delivery_setting',
  {
    id: integer('id').primaryKey().default(1),
    defaultMinor: integer('default_minor'),

    conditionalEnabled: boolean('conditional_enabled').notNull().default(false),
    /** The goods subtotal at which the conditional rates apply. Null means the rule cannot apply. */
    conditionalMinSubtotalMinor: integer('conditional_min_subtotal_minor'),
    conditionalDhakaMinor: integer('conditional_dhaka_minor'),
    conditionalChattogramMinor: integer('conditional_chattogram_minor'),
    conditionalOthersMinor: integer('conditional_others_minor'),

    repeatDeliveryEnabled: boolean('repeat_delivery_enabled').notNull().default(false),
    repeatChattogramMinor: integer('repeat_chattogram_minor'),
    /** Dhaka and every other district: the repeat benefit offers two rates, not three. */
    repeatOthersMinor: integer('repeat_others_minor'),

    repeatDiscountEnabled: boolean('repeat_discount_enabled').notNull().default(false),
    /** Whole percent, 1-100. Kept an integer so the discount is exact integer arithmetic. */
    repeatDiscountPercent: integer('repeat_discount_percent'),
    repeatDiscountMinSubtotalMinor: integer('repeat_discount_min_subtotal_minor'),

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
    // Every optional amount shares the same bound; a negative or absurd charge is refused by the
    // database as well as the service, so no code path can write one.
    check(
      'delivery_setting_conditional_amounts_range',
      sql`(${t.conditionalMinSubtotalMinor} is null or (${t.conditionalMinSubtotalMinor} >= 0 and ${t.conditionalMinSubtotalMinor} <= 100000000))
        and (${t.conditionalDhakaMinor} is null or (${t.conditionalDhakaMinor} >= 0 and ${t.conditionalDhakaMinor} <= 100000000))
        and (${t.conditionalChattogramMinor} is null or (${t.conditionalChattogramMinor} >= 0 and ${t.conditionalChattogramMinor} <= 100000000))
        and (${t.conditionalOthersMinor} is null or (${t.conditionalOthersMinor} >= 0 and ${t.conditionalOthersMinor} <= 100000000))`,
    ),
    check(
      'delivery_setting_repeat_amounts_range',
      sql`(${t.repeatChattogramMinor} is null or (${t.repeatChattogramMinor} >= 0 and ${t.repeatChattogramMinor} <= 100000000))
        and (${t.repeatOthersMinor} is null or (${t.repeatOthersMinor} >= 0 and ${t.repeatOthersMinor} <= 100000000))`,
    ),
    check(
      'delivery_setting_repeat_discount_range',
      sql`(${t.repeatDiscountPercent} is null or (${t.repeatDiscountPercent} >= 1 and ${t.repeatDiscountPercent} <= 100))
        and (${t.repeatDiscountMinSubtotalMinor} is null or (${t.repeatDiscountMinSubtotalMinor} >= 0 and ${t.repeatDiscountMinSubtotalMinor} <= 100000000))`,
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
