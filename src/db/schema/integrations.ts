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
import { bigint, boolean, check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { staffUser } from './identity';

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
    /** Paused instead of deleted: the id can be restored without re-typing it. */
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
