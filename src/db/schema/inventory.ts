import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { productVariant } from './catalog';
import { staffUser } from './identity';
import { customerReturn, order, orderItem } from './orders';
import { colIn, MOVEMENT_REASON, RELEASE_REASON, RESERVATION_STATE } from './values';

/**
 * Inventory: balance, ledger and reservations - data-model section 6.
 *
 * `inventory_balance` holds the two physical facts and derives `available` at query time. The
 * `reserved <= on_hand` CHECK is the database-level expression of the D11 invariants: even if
 * application logic is wrong, a transaction cannot reserve more than the merchant holds.
 *
 * Definition order matters here. `stock_reservation` is declared before `inventory_movement`
 * because the ledger references the reservation it was posted against, and a forward reference in a
 * const initialiser makes TypeScript infer the table as `any`.
 */

export const stockReservation = pgTable(
  'stock_reservation',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),
    orderItemId: bigint('order_item_id', { mode: 'number' })
      .notNull()
      .references(() => orderItem.id, { onDelete: 'restrict' }),
    variantId: bigint('variant_id', { mode: 'number' })
      .notNull()
      .references(() => productVariant.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    state: text('state').notNull().default('held'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    releaseReason: text('release_reason'),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    // At most one live hold per order line.
    uniqueIndex('stock_reservation_live_unique')
      .on(t.orderItemId)
      .where(sql`${t.state} = 'held'`),
    index('stock_reservation_held_variant_idx')
      .on(t.variantId)
      .where(sql`${t.state} = 'held'`),
    index('stock_reservation_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.state} = 'held' and ${t.expiresAt} is not null`),
    index('stock_reservation_order_idx').on(t.orderId),
    check('stock_reservation_state_valid', colIn('state', RESERVATION_STATE)),
    check('stock_reservation_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'stock_reservation_resolved_matches_state',
      sql`(${t.state} = 'held') = (${t.resolvedAt} is null)`,
    ),
    check(
      'stock_reservation_released_has_reason',
      sql`${t.state} <> 'released' or ${t.releaseReason} is not null`,
    ),
    check(
      'stock_reservation_consumed_has_timestamp',
      sql`${t.state} <> 'consumed' or ${t.consumedAt} is not null`,
    ),
    check(
      'stock_reservation_held_only_live_expiry',
      sql`${t.state} = 'held' or ${t.expiresAt} is null`,
    ),
    check(
      'stock_reservation_release_reason_valid',
      sql`${t.releaseReason} is null or ${t.releaseReason} in (${sql.raw(RELEASE_REASON.map((v) => `'${v}'`).join(', '))})`,
    ),
  ],
);

export const inventoryBalance = pgTable(
  'inventory_balance',
  {
    variantId: bigint('variant_id', { mode: 'number' })
      .primaryKey()
      .references(() => productVariant.id, { onDelete: 'restrict' }),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('inventory_balance_on_hand_non_negative', sql`${t.onHand} >= 0`),
    check('inventory_balance_reserved_non_negative', sql`${t.reserved} >= 0`),
    // The oversell backstop. D11 invariants 1, 2 and 5.
    check('inventory_balance_reserved_within_on_hand', sql`${t.reserved} <= ${t.onHand}`),
  ],
);

export const inventoryMovement = pgTable(
  'inventory_movement',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    movementKey: text('movement_key').notNull(),
    variantId: bigint('variant_id', { mode: 'number' })
      .notNull()
      .references(() => productVariant.id, { onDelete: 'restrict' }),
    deltaOnHand: integer('delta_on_hand').notNull().default(0),
    deltaReserved: integer('delta_reserved').notNull().default(0),
    reason: text('reason').notNull(),
    orderId: bigint('order_id', { mode: 'number' }).references(() => order.id, { onDelete: 'restrict' }),
    orderItemId: bigint('order_item_id', { mode: 'number' }).references(() => orderItem.id, {
      onDelete: 'restrict',
    }),
    reservationId: bigint('reservation_id', { mode: 'number' }).references(() => stockReservation.id, {
      onDelete: 'restrict',
    }),
    // Cross-file cycle with `customer_return.restock_movement_id`: annotated so TypeScript does not
    // try to infer the table through its own initialiser.
    customerReturnId: bigint('customer_return_id', { mode: 'number' }).references(
      (): AnyPgColumn => customerReturn.id,
      { onDelete: 'restrict' },
    ),
    actorStaffId: bigint('actor_staff_id', { mode: 'number' }).references(() => staffUser.id, {
      onDelete: 'restrict',
    }),
    note: text('note'),
    onHandAfter: integer('on_hand_after').notNull(),
    reservedAfter: integer('reserved_after').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    // This is what makes double release impossible under retries, concurrency and replays.
    uniqueIndex('inventory_movement_key_unique').on(t.movementKey),
    index('inventory_movement_variant_idx').on(t.variantId, t.occurredAt.desc()),
    index('inventory_movement_order_idx').on(t.orderId),
    index('inventory_movement_reservation_idx').on(t.reservationId),
    check('inventory_movement_reason_valid', colIn('reason', MOVEMENT_REASON)),
    check(
      'inventory_movement_changes_something',
      sql`${t.deltaOnHand} <> 0 or ${t.deltaReserved} <> 0`,
    ),
    // A manual adjustment always has a person and a reason (data-model 6.2).
    check(
      'inventory_movement_adjustment_needs_actor_and_note',
      sql`${t.reason} <> 'stock_adjustment' or (${t.actorStaffId} is not null and ${t.note} is not null)`,
    ),
    check('inventory_movement_on_hand_after_non_negative', sql`${t.onHandAfter} >= 0`),
    check('inventory_movement_reserved_after_non_negative', sql`${t.reservedAfter} >= 0`),
  ],
);
