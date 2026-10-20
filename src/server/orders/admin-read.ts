/**
 * Admin reads for the owner's worklists.
 *
 * Read-only projections, each carrying the minimum the screen needs: delivery contact without
 * payment evidence, customer standing without a full profile, order lines as they were recorded at
 * placement. Every caller has already checked the page permission; these functions add no policy.
 */

import { inArray, sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { auditEvent, customer, customerFlag, order, orderContact, orderItem } from '@/db/schema';
import { likeTerm } from '@/lib/search';
import {
  listCodApprovalQueue,
  listCustomers,
  type CodQueueRow,
  type CustomerQueueRow,
} from './manage';

export type CodOrderItem = {
  readonly nameBn: string;
  readonly nameEn: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly lineTotalMinor: number;
};

export type CodQueueItem = CodQueueRow & { readonly items: readonly CodOrderItem[] };

/**
 * Order lines for a set of orders, grouped by order.
 *
 * One query for every order on the screen rather than one per row: the dashboard and the queue both
 * render lines, and a per-row query would be an N+1 on the owner's most-used page.
 */
async function itemsByOrder(
  tx: Transaction,
  orderIds: readonly number[],
): Promise<Map<number, CodOrderItem[]>> {
  const grouped = new Map<number, CodOrderItem[]>();
  if (orderIds.length === 0) return grouped;
  const rows = await tx
    .select({
      orderId: orderItem.orderId,
      nameBn: orderItem.productNameBn,
      nameEn: orderItem.productNameEn,
      quantity: orderItem.quantity,
      unitPriceMinor: orderItem.unitPriceMinor,
      lineTotalMinor: orderItem.lineTotalMinor,
    })
    .from(orderItem)
    .where(inArray(orderItem.orderId, [...orderIds]))
    .orderBy(orderItem.orderId, orderItem.id);
  for (const row of rows) {
    const list = grouped.get(row.orderId) ?? [];
    list.push({
      nameBn: row.nameBn,
      nameEn: row.nameEn,
      quantity: row.quantity,
      unitPriceMinor: row.unitPriceMinor,
      lineTotalMinor: row.lineTotalMinor,
    });
    grouped.set(row.orderId, list);
  }
  return grouped;
}

/** The COD approval worklist, oldest first, with the recorded order lines. */
export async function codQueue(
  tx: Transaction,
  options: { readonly search?: string } = {},
): Promise<CodQueueItem[]> {
  const rows = await listCodApprovalQueue(tx, options);
  const items = await itemsByOrder(
    tx,
    rows.map((row) => row.orderId),
  );
  return rows.map((row) => ({ ...row, items: items.get(row.orderId) ?? [] }));
}

export type CodDecidedItem = CodQueueRow & {
  readonly items: readonly CodOrderItem[];
  readonly decision: 'approved' | 'rejected';
  readonly decidedAt: Date;
};

/** Rows per page for the decided list. A day's decisions are readable in one or two screens. */
export const DECIDED_PAGE_SIZE = 25;

/**
 * COD orders decided today, newest first.
 *
 * "Today" is the server's local day boundary, and the decision time is the timestamp the decision
 * wrote (`confirmed_at` or `cancelled_at`), never `updated_at` - an unrelated edit must not make an
 * old decision look recent.
 *
 * The list is **paginated and reports its total**, so a busy day cannot silently truncate: the page says
 * "showing 25 of 63" and offers the next page rather than pretending the rest does not exist.
 */
export async function codDecidedToday(
  tx: Transaction,
  options: { readonly search?: string; readonly limit?: number; readonly offset?: number } = {},
): Promise<{ readonly rows: CodDecidedItem[]; readonly total: number }> {
  const limit = Math.min(Math.max(options.limit ?? DECIDED_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const search = options.search?.trim() ?? '';
  const searchClause =
    search === ''
      ? sql`true`
      : sql`(${order.orderNumber} ilike ${likeTerm(search)}
          or ${orderContact.recipientName} ilike ${likeTerm(search)}
          or ${orderContact.recipientPhone} ilike ${likeTerm(search)})`;

  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
      recipientName: orderContact.recipientName,
      districtCode: orderContact.districtCode,
      recipientPhone: orderContact.recipientPhone,
      area: orderContact.area,
      city: orderContact.city,
      addressLine: orderContact.addressLine,
      status: order.status,
      confirmedAt: order.confirmedAt,
      cancelledAt: order.cancelledAt,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(
      sql`${order.paymentMethod} = 'cod'
          and coalesce(${order.confirmedAt}, ${order.cancelledAt}) >= ${start}
          and ${searchClause}`,
    )
    .orderBy(sql`coalesce(${order.confirmedAt}, ${order.cancelledAt}) desc`)
    .limit(limit)
    .offset(offset);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(
      sql`${order.paymentMethod} = 'cod'
          and coalesce(${order.confirmedAt}, ${order.cancelledAt}) >= ${start}
          and ${searchClause}`,
    );

  const items = await itemsByOrder(
    tx,
    rows.map((row) => row.orderId),
  );

  const mapped = rows.map((row) => ({
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt,
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    totalMinor: row.totalMinor,
    recipientName: row.recipientName,
    districtCode: row.districtCode,
    recipientPhone: row.recipientPhone,
    area: row.area,
    city: row.city,
    addressLine: row.addressLine,
    items: items.get(row.orderId) ?? [],
    decision: row.status === 'cancelled' ? ('rejected' as const) : ('approved' as const),
    decidedAt: row.cancelledAt ?? row.confirmedAt ?? row.placedAt,
  }));

  return { rows: mapped, total: counted[0]?.total ?? 0 };
}

/** Customers with their standing, for the moderation screen. Nothing beyond what it needs. */
export async function customers(
  tx: Transaction,
  options: { readonly search?: string; readonly limit?: number; readonly offset?: number } = {},
): Promise<{ readonly rows: CustomersQueueItem[]; readonly total: number }> {
  return listCustomers(tx, options);
}

export type CustomersQueueItem = CustomerQueueRow;

export type FlaggedCustomer = {
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly reason: string;
  readonly raisedAt: Date;
};

/** Raised review flags, newest first. A flag blocks nothing - the screen never presents it as a ban. */
export async function flaggedCustomers(tx: Transaction, limit = 5): Promise<FlaggedCustomer[]> {
  return tx
    .select({
      customerId: customer.id,
      email: customer.email,
      displayName: customer.displayName,
      reason: customerFlag.reason,
      raisedAt: customerFlag.raisedAt,
    })
    .from(customerFlag)
    .innerJoin(customer, sql`${customer.id} = ${customerFlag.customerId}`)
    .where(sql`${customerFlag.state} = 'raised' and ${customer.deletedAt} is null`)
    .orderBy(sql`${customerFlag.raisedAt} desc`)
    .limit(limit);
}

export type DenialSummary = { readonly total: number };

/**
 * Refused actions in the last N hours, read from the append-only audit trail.
 *
 * The window is evaluated by the database (`now()`), not by a clock read in a React component: the
 * figure is a fact about stored rows, so it is computed where the rows are.
 */
export async function countRecentDenials(tx: Transaction, hours = 24): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(auditEvent)
    .where(
      sql`${auditEvent.action} = 'admin.action_denied'
          and ${auditEvent.occurredAt} >= now() - make_interval(hours => ${hours}::int)`,
    );
  return rows[0]?.total ?? 0;
}

export type CustomerOrderRow = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly status: string;
  readonly paymentMethod: string;
  readonly codState: string;
  readonly totalMinor: number;
};

export type CustomerDetail = {
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly flagged: boolean;
  readonly flagReason: string | null;
  readonly orders: readonly CustomerOrderRow[];
  /** Every order the customer has, so a truncated list can say so instead of implying that is all. */
  readonly orderTotal: number;
};

/**
 * One customer, their standing and their recorded orders.
 *
 * Returns `null` for a customer that does not exist or has been deleted, so the page can answer
 * 404 rather than disclose that an id was once valid. Orders are a bounded projection of what the
 * order table already stores - no spend total, no inferred segment.
 */
export async function customerDetail(tx: Transaction, customerId: number): Promise<CustomerDetail | null> {
  const rows = await tx
    .select({
      customerId: customer.id,
      email: customer.email,
      displayName: customer.displayName,
      status: customer.status,
      createdAt: customer.createdAt,
    })
    .from(customer)
    .where(sql`${customer.id} = ${customerId} and ${customer.deletedAt} is null`)
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;

  const flagRows = await tx
    .select({ reason: customerFlag.reason })
    .from(customerFlag)
    .where(sql`${customerFlag.customerId} = ${customerId} and ${customerFlag.state} = 'raised'`)
    .limit(1);

  const orders = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      codState: order.codState,
      totalMinor: order.totalMinor,
    })
    .from(order)
    .where(sql`${order.customerId} = ${customerId}`)
    .orderBy(sql`${order.placedAt} desc`)
    .limit(50);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.customerId} = ${customerId}`);

  return {
    ...row,
    flagged: flagRows.length > 0,
    flagReason: flagRows[0]?.reason ?? null,
    orders,
    orderTotal: counted[0]?.total ?? 0,
  };
}
