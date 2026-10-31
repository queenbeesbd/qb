#!/usr/bin/env tsx
/**
 * Removes the **imported** order history, and nothing else.
 *
 * The owner's previous store was imported in Phase 43 (docs/migrations/zatiq-easy-import.md):
 * 1,477 products, 245 brands, 15 categories, 528 customers and 559 orders. The products and the
 * customer list are wanted; the 559 orders are not. This command deletes exactly those orders and
 * their line items, contacts, events and redemptions, and leaves the catalog, the customers, the
 * promotions, the delivery settings, the owner accounts and the audit trail untouched.
 *
 * Why this is a script and not a migration: a migration is schema history and must stay replayable.
 * This is a one-off operator action against one database's data, and it prints what it removed.
 *
 * Safety properties, deliberately:
 *   1. It refuses to run without --confirm.
 *   2. It refuses outside development/test, so it can never be pointed at a deployed database by
 *      accident.
 *   3. It refuses unless **every** order is provably an import (its order_placed event carries
 *      source = zatiq-easy). A database with one real customer order is left alone.
 *   4. It refuses if any record of real owner work exists - a recorded courier cost, a payment claim,
 *      a refund, a cancellation request, a return, an exception, a promo redemption or a customer
 *      flag. Those are not import artifacts and are never destroyed by a catalog cleanup.
 *   5. It uses TRUNCATE, not DELETE. order_event and order_item carry BEFORE UPDATE OR DELETE
 *      triggers that forbid row deletes by design; TRUNCATE is a table-level operation and fires no
 *      row trigger. scripts/import-zatiq.ts --reset already does the same, for the same reason.
 *
 * Run it with a backup taken first:
 *   pg_dump "$DATABASE_URL" > before-order-purge.sql
 *   npm run db:purge:imported-orders -- --confirm
 */

import { count, sql } from 'drizzle-orm';

import { closeDb, withTransaction } from '../src/db/client';
import {
  cancellationRequest,
  customer,
  customerFlag,
  customerReturn,
  idempotencyKey,
  operationalException,
  order,
  orderAdditionalCost,
  orderContact,
  orderEvent,
  orderItem,
  paymentClaim,
  product,
  promoCodeRedemption,
  refund,
} from '../src/db/schema';
import { serverEnv } from '../src/server/env';

const CONFIRMED = process.argv.includes('--confirm');

class PurgeError extends Error {}

/** A table that holds a record of real work the owner did; one row aborts the purge. */
const OWNER_WORK = [
  ['order_additional_cost', orderAdditionalCost],
  ['payment_claim', paymentClaim],
  ['refund', refund],
  ['cancellation_request', cancellationRequest],
  ['customer_return', customerReturn],
  ['operational_exception', operationalException],
  ['promo_code_redemption', promoCodeRedemption],
  ['customer_flag', customerFlag],
] as const;

type Counts = {
  orders: number;
  orderItems: number;
  orderEvents: number;
  orderContacts: number;
  products: number;
  customers: number;
};

function printCounts(label: string, counts: Counts): void {
  console.log(label);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(14)} ${value}`);
  }
}

async function main(): Promise<void> {
  const environment = serverEnv().environment;
  if (environment !== 'development' && environment !== 'test') {
    throw new PurgeError(`refusing to run in "${environment}": this command is local-only`);
  }

  if (!CONFIRMED) {
    console.log('Dry run. Nothing was deleted.');
    console.log('  This command removes the IMPORTED order history, keeping products and customers.');
    console.log('  Re-run with --confirm to apply it. Take a backup first:');
    console.log('    pg_dump "$DATABASE_URL" > before-order-purge.sql');
    return;
  }

  const report = await withTransaction(async (tx) => {
    const [orderRow] = await tx.select({ value: count() }).from(order);
    const [itemRow] = await tx.select({ value: count() }).from(orderItem);
    const [eventRow] = await tx.select({ value: count() }).from(orderEvent);
    const [contactRow] = await tx.select({ value: count() }).from(orderContact);
    const [productRow] = await tx.select({ value: count() }).from(product);
    const [customerRow] = await tx.select({ value: count() }).from(customer);
    const before: Counts = {
      orders: orderRow?.value ?? 0,
      orderItems: itemRow?.value ?? 0,
      orderEvents: eventRow?.value ?? 0,
      orderContacts: contactRow?.value ?? 0,
      products: productRow?.value ?? 0,
      customers: customerRow?.value ?? 0,
    };

    if (before.orders === 0) {
      console.log('No orders exist. Nothing to do.');
      return null;
    }

    const [foreignRow] = await tx
      .select({ value: count() })
      .from(order)
      .where(sql`not exists (
        select 1 from ${orderEvent}
        where ${orderEvent.orderId} = ${order.id}
          and ${orderEvent.eventType} = 'order_placed'
          and ${orderEvent.payload}->>'source' = 'zatiq-easy'
      )`);
    const foreign = foreignRow?.value ?? 0;
    if (foreign > 0) {
      throw new PurgeError(
        `refusing: ${foreign} order(s) were not created by the vendor import. ` +
          'This command only removes imported history.',
      );
    }

    for (const [name, table] of OWNER_WORK) {
      const [rows] = await tx.select({ value: count() }).from(table);
      const value = rows?.value ?? 0;
      if (value > 0) {
        throw new PurgeError(
          `refusing: ${name} holds ${value} row(s) of real owner work. ` +
            'A catalog cleanup must never destroy those.',
        );
      }
    }

    console.log('');
    printCounts('Before:', before);

    /*
     * TRUNCATE, not DELETE: order_event and order_item are append-only by trigger. TRUNCATE is
     * table-level and fires no row trigger. CASCADE reaches every table whose foreign key points at
     * order, so no orphan row can survive the purge.
     */
    await tx.execute(sql.raw('TRUNCATE TABLE "order" CASCADE'));

    /*
     * Checkout idempotency keys are not keyed by order, so they survive a truncate. A stale key whose
     * order no longer exists would make a replay point at a missing order, so the order-scoped keys
     * go too. The schema's CHECK lists exactly these four scopes.
     */
    await tx.execute(
      sql`delete from ${idempotencyKey} where ${idempotencyKey.scope} in ('order_create', 'claim_submit', 'refund_request', 'cod_approve')`,
    );

    const [aOrder] = await tx.select({ value: count() }).from(order);
    const [aItem] = await tx.select({ value: count() }).from(orderItem);
    const [aEvent] = await tx.select({ value: count() }).from(orderEvent);
    const [aContact] = await tx.select({ value: count() }).from(orderContact);
    const [aProduct] = await tx.select({ value: count() }).from(product);
    const [aCustomer] = await tx.select({ value: count() }).from(customer);
    const after: Counts = {
      orders: aOrder?.value ?? 0,
      orderItems: aItem?.value ?? 0,
      orderEvents: aEvent?.value ?? 0,
      orderContacts: aContact?.value ?? 0,
      products: aProduct?.value ?? 0,
      customers: aCustomer?.value ?? 0,
    };

    if (after.orders !== 0 || after.orderItems !== 0 || after.orderEvents !== 0 || after.orderContacts !== 0) {
      throw new PurgeError('purge incomplete: order rows still exist; the transaction was rolled back');
    }
    if (after.products !== before.products || after.customers !== before.customers) {
      throw new PurgeError('refusing to commit: the product or customer count changed');
    }

    return { before, after };
  });

  if (report === null) return;
  console.log('');
  printCounts('After:', report.after);
  console.log('');
  console.log(
    `Removed ${report.before.orders} imported order(s), ${report.before.orderItems} line item(s), ` +
      `${report.before.orderEvents} event(s) and ${report.before.orderContacts} contact record(s).`,
  );
  console.log(`Kept ${report.after.products} product(s) and ${report.after.customers} customer(s).`);
  console.log(
    'The audit trail is append-only and was not touched; a few historical order actions may now name an order that no longer exists.',
  );
}

main()
  .catch((error: unknown) => {
    if (error instanceof PurgeError) {
      console.error(`✗ ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());