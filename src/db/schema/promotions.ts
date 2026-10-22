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
import { colIn } from './values';

/**
 * Promotion codes - a code the owner publishes that takes money off a cart total.
 *
 * **Why this is two tables and not a counter on the code.** A redemption is an order that used the
 * code, so it is written once, in the same transaction that creates the order, and never updated. The
 * number of times a code has been used is therefore `count(*)` over these rows - a derived fact, not a
 * stored one. Two owners running the same save handler, or a retried submission, cannot make the count
 * disagree with the orders that actually carry the code.
 *
 * **The discount itself is a snapshot on the order.** `order.discount_minor` is frozen with the rest of
 * the charged amount, exactly like `shipping_minor`: an owner editing a code later must never rewrite
 * what a customer was charged. `promo_code_redemption.discount_minor` repeats the amount for the
 * redemption ledger, so the promotion's own history survives even if an order row were ever archived.
 *
 * **What is deliberately not here.** No automatic campaign, no banner, no stack with a product
 * discount, no per-customer limit, and no expiry sweep: `ends_at` is evaluated when a code is used, and
 * nothing runs on a timer.
 */

/** How a code reduces a total. A closed set; adding a third kind is a product decision. */
export const PROMO_KIND = ['percent', 'fixed'] as const;
export const PROMO_KIND_LABEL: Record<(typeof PROMO_KIND)[number], string> = {
  percent: 'Percentage off',
  fixed: 'Fixed amount off',
};

export const promoCode = pgTable(
  'promo_code',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** Stored uppercase; the parser uppercases input so `flat10` and `FLAT10` are one code. */
    code: text('code').notNull(),
    /** The owner's own note about what the code is for. Never shown to a customer. */
    description: text('description'),
    kind: text('kind').notNull(),
    /** 1-100, only when `kind = 'percent'`. */
    percentOff: integer('percent_off'),
    /** Integer poisha, only when `kind = 'fixed'`. */
    amountOffMinor: integer('amount_off_minor'),
    /** The cart subtotal must reach this before the code applies. Zero means no minimum. */
    minOrderMinor: integer('min_order_minor').notNull().default(0),
    /** A ceiling on a percentage code, in poisha. Null means the percentage is uncapped. */
    maxDiscountMinor: integer('max_discount_minor'),
    /** Null means the code is live as soon as it is active. */
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    /** Null means it never expires on its own. Evaluated at use; no job ever rewrites a code. */
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    /** Null means unlimited. Compared against the redemption count inside the order transaction. */
    maxRedemptions: integer('max_redemptions'),
    isActive: boolean('is_active').notNull().default(true),
    createdByStaffId: bigint('created_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    updatedByStaffId: bigint('updated_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promo_code_code_unique').on(t.code),
    index('promo_code_active_idx').on(t.isActive, t.endsAt),
    check('promo_code_kind_valid', colIn('kind', PROMO_KIND)),
    // A code is one shape or the other - never both numbers set, never neither.
    check(
      'promo_code_shape_matches_kind',
      sql`(${t.kind} = 'percent') = (${t.percentOff} is not null)
        and (${t.kind} = 'fixed') = (${t.amountOffMinor} is not null)`,
    ),
    check('promo_code_percent_range', sql`${t.percentOff} is null or ${t.percentOff} between 1 and 100`),
    check(
      'promo_code_amount_range',
      sql`${t.amountOffMinor} is null or (${t.amountOffMinor} > 0 and ${t.amountOffMinor} <= 100000000)`,
    ),
    check(
      'promo_code_min_order_range',
      sql`${t.minOrderMinor} >= 0 and ${t.minOrderMinor} <= 100000000`,
    ),
    // A cap only means something on a percentage code, and a zero cap would refuse every cart.
    check(
      'promo_code_max_discount_applies_to_percent',
      sql`(${t.maxDiscountMinor} is null or (${t.kind} = 'percent' and ${t.maxDiscountMinor} > 0))
        and (${t.maxDiscountMinor} is null or ${t.maxDiscountMinor} <= 100000000)`,
    ),
    check(
      'promo_code_max_redemptions_positive',
      sql`${t.maxRedemptions} is null or ${t.maxRedemptions} > 0`,
    ),
    check(
      'promo_code_window_ordered',
      sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

/**
 * One order that used one code.
 *
 * Written inside the order transaction and never updated. `order_id` is unique, so an order can carry
 * at most one code: stacking is not offered, and the database says so rather than the form.
 */
export const promoCodeRedemption = pgTable(
  'promo_code_redemption',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    promoCodeId: bigint('promo_code_id', { mode: 'number' })
      .notNull()
      .references(() => promoCode.id, { onDelete: 'restrict' }),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    /** The account that used it, or `null` on a guest order (Phase 42): the order is the fact. */
    customerId: bigint('customer_id', { mode: 'number' }).references(() => customer.id, {
      onDelete: 'restrict',
    }),
    /** What the customer actually got off, in poisha. Mirrors the order's own snapshot. */
    discountMinor: integer('discount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promo_code_redemption_order_unique').on(t.orderId),
    index('promo_code_redemption_code_idx').on(t.promoCodeId, t.createdAt),
    check('promo_code_redemption_discount_positive', sql`${t.discountMinor} > 0`),
  ],
);
