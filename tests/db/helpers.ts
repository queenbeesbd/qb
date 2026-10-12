/**
 * Database test harness.
 *
 * Every database test runs against a disposable local cluster created for that file and destroyed
 * afterwards. Nothing here can reach a deployed database: the harness only ever creates its own
 * cluster, and the connection string it produces points at 127.0.0.1.
 *
 * If the PostgreSQL server binaries are unavailable the tests skip with an explicit message rather
 * than silently passing.
 */

import { Pool } from 'pg';

import { clusterToolingAvailable, startLocalCluster, type LocalCluster } from '../../scripts/local-pg';
import { closeDb, getDb, type Database } from '../../src/db/client';
import { applyMigrations } from '../../src/db/migrate';
import { assertDisposableDatabase, resetServerEnvCache } from '../../src/server/env';

export const toolingAvailable = clusterToolingAvailable();

export const SKIP_REASON =
  'PostgreSQL server binaries (initdb/pg_ctl/createdb) are not available; database tests skipped.';

export type DbFixture = {
  cluster: LocalCluster;
  pool: Pool;
  /** The application's own Drizzle handle, pointed at the disposable cluster. */
  db: Database;
  close(): Promise<void>;
};

/** Starts a cluster, applies every migration, and hands back a pool and a Drizzle handle. */
export async function startMigratedDatabase(): Promise<DbFixture> {
  const cluster = await startLocalCluster();
  await applyMigrations(cluster.url);
  const pool = new Pool({ connectionString: cluster.url, max: 8 });

  // The application's connection layer reads `DATABASE_URL` and validates it, which is exactly what
  // production does. Pointing it at the disposable cluster here - rather than adding a setter to the
  // production module - means the code under test is the code that runs, and `assertDisposableDatabase`
  // proves the target is loopback.
  process.env.DATABASE_URL = cluster.url;
  process.env.QUEENBEES_ENV = 'test';
  process.env.DATABASE_DRIVER = 'pg';
  resetServerEnvCache();
  assertDisposableDatabase();

  return {
    cluster,
    pool,
    db: getDb(),
    async close() {
      await closeDb();
      await pool.end();
      await cluster.stop();
    },
  };
}

export type Seeded = {
  customerId: number;
  staffId: number;
  variantId: number;
  orderId: number;
  orderItemId: number;
  reservationId: number;
  recipientId: number;
  orderNumber: string;
};

export type SeedOptions = {
  onHand?: number;
  /** Order-line quantity. Must be >= 1: `order_item.quantity > 0` is a schema constraint. */
  quantity?: number;
  /** Reserved units. Defaults to `quantity`. */
  reservationQuantity?: number;
  paymentMethod?: 'bkash' | 'cod';
  withReservation?: boolean;
  /** Backdates `placed_at`, so expiry behaviour can be tested without mutating a frozen column. */
  placedHoursAgo?: number;
};

/**
 * Seeds the minimum graph an order needs: a customer, a staff actor, a catalog path down to a
 * variant, an inventory balance, a recipient account, an order with one line, and a reservation.
 */
export async function seedOrder(pool: Pool, options: SeedOptions = {}): Promise<Seeded> {
  const onHand = options.onHand ?? 1;
  const quantity = options.quantity ?? 1;
  const reservationQuantity = options.reservationQuantity ?? quantity;
  const paymentMethod = options.paymentMethod ?? 'bkash';
  const withReservation = options.withReservation ?? true;
  // `placed_at` is immutable after insert (guard trigger), so an overdue order must be seeded
  // already backdated rather than updated into the past.
  const placedAt = new Date(Date.now() - (options.placedHoursAgo ?? 0) * 3_600_000);
  // Computed here rather than as `$n + interval '24 hours'`: reusing one parameter in both a
  // timestamptz position and an interval expression makes PostgreSQL refuse to deduce its type
  // (SQLSTATE 42P08). Two explicit timestamps keep the 24-hour CHECK exact and unambiguous.
  const expiresAt = new Date(placedAt.getTime() + 24 * 3_600_000);

  if (quantity < 1) throw new Error('seedOrder: quantity must be >= 1 (order_item.quantity > 0)');
  if (reservationQuantity < 0) throw new Error('seedOrder: reservationQuantity must be >= 0');
  const orderNumber = `QB${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

  const customer = await pool.query<{ id: string }>(
    `insert into customer (email, display_name) values ($1, 'Test Customer') returning id`,
    [`customer-${orderNumber.toLowerCase()}@example.test`],
  );
  const customerId = Number(customer.rows[0]?.id);

  const staff = await pool.query<{ id: string }>(
    `insert into staff_user (email, display_name) values ($1, 'Test Staff') returning id`,
    [`staff-${orderNumber.toLowerCase()}@example.test`],
  );
  const staffId = Number(staff.rows[0]?.id);

  const brandRow = await pool.query<{ id: string }>(
    `insert into brand (slug, name_bn, name_en) values ($1, 'ব্র্যান্ড', 'Brand') returning id`,
    [`brand-${orderNumber.toLowerCase()}`],
  );
  const brandId = Number(brandRow.rows[0]?.id);

  const categoryRow = await pool.query<{ id: string }>(
    `insert into category (slug, name_bn, name_en) values ($1, 'শ্রেণি', 'Category') returning id`,
    [`category-${orderNumber.toLowerCase()}`],
  );
  const categoryId = Number(categoryRow.rows[0]?.id);

  const productRow = await pool.query<{ id: string }>(
    `insert into product (slug, brand_id, category_id, name_bn, name_en, is_published, published_at)
     values ($1, $2, $3, 'পণ্য', 'Product', true, now()) returning id`,
    [`product-${orderNumber.toLowerCase()}`, brandId, categoryId],
  );
  const productId = Number(productRow.rows[0]?.id);

  const variantRow = await pool.query<{ id: string }>(
    `insert into product_variant (product_id, sku, is_default, price_minor)
     values ($1, $2, true, 10000) returning id`,
    [productId, `SKU-${orderNumber}`],
  );
  const variantId = Number(variantRow.rows[0]?.id);

  await pool.query(
    `insert into inventory_balance (variant_id, on_hand, reserved)
     values ($1, $2, $3)`,
    [variantId, onHand, withReservation ? reservationQuantity : 0],
  );

  // Only one active recipient per method is permitted, so reuse any existing one. Reusing rather
  // than re-inserting is itself an acknowledgement that the partial unique index is doing its job.
  const existingRecipient = await pool.query<{ id: string }>(
    `select id from payment_recipient where method = 'bkash' and is_active limit 1`,
  );
  const recipientId =
    existingRecipient.rows[0] !== undefined
      ? Number(existingRecipient.rows[0].id)
      : Number(
          (
            await pool.query<{ id: string }>(
              `insert into payment_recipient (method, account_number, account_label, created_by_staff_id)
               values ('bkash', '01711111111', 'Personal', $1) returning id`,
              [staffId],
            )
          ).rows[0]?.id,
        );

  const orderRow = await pool.query<{ id: string }>(
    `insert into "order"
       (order_number, customer_id, payment_method, payment_state, cod_state,
        items_subtotal_minor, shipping_minor, total_minor, placed_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, 0, $6, $7, $8)
     returning id`,
    [
      orderNumber,
      customerId,
      paymentMethod,
      paymentMethod === 'cod' ? 'not_applicable' : 'awaiting_payment',
      paymentMethod === 'cod' ? 'cod_pending_approval' : 'not_applicable',
      10000 * quantity,
      placedAt,
      expiresAt,
    ],
  );
  const orderId = Number(orderRow.rows[0]?.id);

  await pool.query(
    `insert into order_contact (order_id, recipient_name, recipient_phone, address_line, area, city)
     values ($1, 'Recipient', '01722222222', 'House 1, Road 2', 'Dhanmondi', 'Dhaka')`,
    [orderId],
  );

  const itemRow = await pool.query<{ id: string }>(
    `insert into order_item
       (order_id, variant_id, product_name_bn, product_name_en, sku, unit_price_minor, quantity, line_total_minor)
     values ($1, $2, 'পণ্য', 'Product', $3, 10000, $4, 10000 * $4) returning id`,
    [orderId, variantId, `SKU-${orderNumber}`, quantity],
  );
  const orderItemId = Number(itemRow.rows[0]?.id);

  let reservationId = 0;
  if (withReservation) {
    const reservationRow = await pool.query<{ id: string }>(
      `insert into stock_reservation (order_id, order_item_id, variant_id, quantity, expires_at)
       values ($1, $2, $3, $4, now() + interval '24 hours') returning id`,
      [orderId, orderItemId, variantId, reservationQuantity],
    );
    reservationId = Number(reservationRow.rows[0]?.id);
  }

  return {
    customerId,
    staffId,
    variantId,
    orderId,
    orderItemId,
    reservationId,
    recipientId,
    orderNumber,
  };
}

/** Asserts that a statement fails with a specific PostgreSQL SQLSTATE. */
export async function expectSqlState(
  pool: Pool,
  sql: string,
  params: unknown[],
  expectedState: string,
): Promise<string> {
  try {
    await pool.query(sql, params);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== expectedState) {
      throw new Error(
        `expected SQLSTATE ${expectedState} but received ${code ?? 'none'}: ${(error as Error).message}`,
      );
    }
    return (error as Error).message;
  }
  throw new Error(`expected the statement to fail with SQLSTATE ${expectedState}, but it succeeded`);
}

/** 23514 = check_violation, which is what the guard triggers raise. */
export const CHECK_VIOLATION = '23514';
/** 23505 = unique_violation. */
export const UNIQUE_VIOLATION = '23505';
/** 23503 = foreign_key_violation. */
export const FOREIGN_KEY_VIOLATION = '23503';
