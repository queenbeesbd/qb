/**
 * Integrations: outbound notification destinations the owner configures.
 *
 * Eight groups so far - the ninth is deliberately narrow: one table, holding **where** an order
 * notification goes, never **how** it is sent. The bot token is a deployment secret and lives in the
 * process environment (`TELEGRAM_BOT_TOKEN`), never in this table, this repository or the admin UI: a
 * database row is copyable into a backup, an export or a support paste, and a credential is not.
 *
 * A recipient is a Telegram chat id plus a human label. Several owners may each register their own id,
 * and every active row receives the same order notification - that is the whole fan-out rule, expressed
 * as `where is_active`.
 */

import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { staffUser } from './identity';
import { order } from './orders';

export const telegramRecipient = pgTable(
  'telegram_recipient',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** How the owner recognises this destination: "Rahim - manager", "Owner phone". */
    label: text('label').notNull(),
    /**
     * The Telegram chat id: a numeric user id for a person, or a negative id for a group. Stored as
     * text because it is an identifier, not a quantity - no arithmetic is ever performed on it.
     */
    chatId: text('chat_id').notNull(),
    /**
     * Off means paused, and pausing is the first way to stop a notification: the id survives, so the
     * destination can be resumed without re-typing it.
     *
     * A row that should not exist at all (a test id, someone who has left) is **removed** - the roster
     * offers that beside Pause, behind a confirmation and an audit record. The id is on the screen
     * before the dialog opens, so removal stays recoverable by registering it again; what it avoids is
     * a dead destination sitting in the fan-out list forever.
     */
    isActive: boolean('is_active').notNull().default(true),
    createdByStaffId: bigint('created_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedByStaffId: bigint('updated_by_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // One row per destination: registering the same chat twice would send the owner two identical
    // messages for every order.
    uniqueIndex('telegram_recipient_chat_unique').on(t.chatId),
    index('telegram_recipient_active_idx').on(t.isActive),
    // Shape only - Telegram decides whether the id exists. A numeric id may be negative (a group).
    check('telegram_recipient_chat_format', sql`${t.chatId} ~ '^-?[0-9]{5,20}$'`),
    check('telegram_recipient_label_len', sql`char_length(btrim(${t.label})) between 1 and 80`),
  ],
);

/**
 * The SteadFast consignment a confirmed COD order was sent to.
 *
 * **One row per order, and only one.** `order_id` is unique: the courier's `invoice` is our order
 * number, and SteadFast treats an invoice as the idempotency key of a booking. A second send for an
 * order that already carries a consignment returns the stored row instead of creating a second parcel,
 * and the unique index refuses it even if two requests race past the read.
 *
 * The row is a **mirror of what the courier returned**, not an order state: booking a parcel never
 * changes `order.status`, `order.cod_state`, payment or stock. Delivery progress the courier reports
 * is stored in `status` and stamped with `status_checked_at`, and it is read from the courier rather
 * than inferred - a value that was never fetched says nothing about where the parcel is.
 *
 * The owner's credentials are **not** here. They live in `store_setting` (see
 * `src/server/integrations/steadfast.ts`), and neither their values nor the full request body is
 * copied into a row that a backup, an export or a support paste would carry.
 */
export const steadfastConsignment = pgTable(
  'steadfast_consignment',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    /** The `invoice` sent to SteadFast - the order number, kept as the snapshot of what was sent. */
    invoice: text('invoice').notNull(),
    /** SteadFast's numeric consignment id, and the code the courier prints on the parcel. */
    consignmentId: bigint('consignment_id', { mode: 'number' }).notNull(),
    trackingCode: text('tracking_code').notNull(),
    /** The courier's own delivery status, exactly as it was reported. Never a derived order state. */
    status: text('status').notNull().default('in_review'),
    /** The COD amount in poisha, as booked - `order.total_minor` at the moment of the send. */
    codAmountMinor: integer('cod_amount_minor').notNull(),
    bookedByStaffId: bigint('booked_by_staff_id', { mode: 'number' })
      .notNull()
      .references(() => staffUser.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** When `status` was last read from the courier; `null` until a refresh actually happened. */
    statusCheckedAt: timestamp('status_checked_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('steadfast_consignment_order_unique').on(t.orderId),
    uniqueIndex('steadfast_consignment_invoice_unique').on(t.invoice),
    uniqueIndex('steadfast_consignment_cid_unique').on(t.consignmentId),
    check('steadfast_consignment_cid_positive', sql`${t.consignmentId} > 0`),
    check('steadfast_consignment_tracking_len', sql`char_length(${t.trackingCode}) between 1 and 64`),
    check('steadfast_consignment_invoice_len', sql`char_length(${t.invoice}) between 1 and 100`),
    check('steadfast_consignment_status_len', sql`char_length(${t.status}) between 1 and 40`),
    check('steadfast_consignment_cod_non_negative', sql`${t.codAmountMinor} >= 0`),
  ],
);
