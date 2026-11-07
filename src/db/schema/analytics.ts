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
  uuid,
} from 'drizzle-orm/pg-core';

import { VISIT_DEVICES, VISIT_EVENT_KINDS, colIn } from './values';

/**
 * First-party visit tracking - ADR 0027, owner-approved 2026-11-07.
 *
 * The shop measures its own storefront. There is **no third-party analytics product**, no cross-site
 * identifier, no stored IP address and no fingerprint: a session is a random 128-bit id in a
 * first-party cookie, and the only facts kept are the path, the coarse device class and the step.
 *
 * Two tables, because they answer different questions:
 *
 * - `visit_session` is one browsing session. Its counters answer "how many visits", "how many are
 *   here now" and "how many carried a cart and never ordered" without scanning events.
 * - `visit_event` is the step log. It answers "which pages" and "when", and it is the only place a
 *   funnel can be derived from.
 *
 * A session is never linked to a customer account or an order id. `placed_order` is a boolean on the
 * session, not a foreign key, so the analytics surface cannot become a second customer record.
 */
export const visitSession = pgTable(
  'visit_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    pageViews: integer('page_views').notNull().default(0),
    /** True once the session carried a non-empty cart cookie. */
    hasCart: boolean('has_cart').notNull().default(false),
    /** True once an order was placed from this session. Never a link to the order. */
    placedOrder: boolean('placed_order').notNull().default(false),
    device: text('device').notNull().default('desktop'),
    entryPath: text('entry_path'),
  },
  (t) => [
    index('visit_session_first_seen_idx').on(t.firstSeenAt.desc()),
    index('visit_session_last_seen_idx').on(t.lastSeenAt.desc()),
    check('visit_session_device_valid', colIn('device', VISIT_DEVICES)),
    check('visit_session_page_views_non_negative', sql`${t.pageViews} >= 0`),
    check(
      'visit_session_entry_path_len',
      sql`${t.entryPath} is null or char_length(${t.entryPath}) <= 200`,
    ),
  ],
);

export const visitEvent = pgTable(
  'visit_event',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => visitSession.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    path: text('path'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('visit_event_occurred_idx').on(t.occurredAt.desc()),
    index('visit_event_session_idx').on(t.sessionId, t.occurredAt.desc()),
    check('visit_event_kind_valid', colIn('kind', VISIT_EVENT_KINDS)),
    check('visit_event_path_len', sql`${t.path} is null or char_length(${t.path}) <= 200`),
  ],
);
