/**
 * Owner-side order reads: one order in full, and a paginated order history.
 *
 * These are read-only projections for the owner's own store. Each caller has already checked the page
 * permission (`order.read`); nothing here adds policy, and nothing here mutates.
 *
 * Two deliberate limits:
 *
 * 1. **Every list is bounded and reports its total.** An unbounded `select *` on `order` would eventually
 *    render the whole table into one page, and a silently truncated list would be worse than either -
 *    so the page is told the real count and can say "showing 25 of 340".
 * 2. **History is displayed, never inferred.** The event rows are what the order wrote; the audit rows
 *    are what the trail recorded. Nothing is derived, summarised into a metric or backfilled.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { auditEvent, customer, customerReturn, order, orderContact, orderEvent, orderItem } from '@/db/schema';
import { likeTerm } from '@/lib/search';
import { listAdditionalCosts, orderMoney, type AdditionalCost, type OrderMoney } from './costs';

export type AdminOrderItem = {
  readonly id: number;
  readonly nameBn: string | null;
  readonly nameEn: string;
  readonly variantLabel: string | null;
  readonly sku: string;
  readonly unitPriceMinor: number;
  readonly quantity: number;
  readonly lineTotalMinor: number;
  readonly imageKey: string | null;
};

export type AdminOrderEvent = {
  readonly id: number;
  readonly eventType: string;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly actorType: string;
  readonly actorStaffId: number | null;
  readonly reason: string | null;
  readonly occurredAt: Date;
};

export type AdminOrderReturn = {
  readonly id: number;
  readonly orderItemId: number;
  readonly sku: string;
  readonly nameBn: string | null;
  readonly nameEn: string;
  readonly quantity: number;
  readonly reason: string;
  readonly state: string;
  readonly requestedAt: Date;
  readonly receivedAt: Date | null;
  readonly inspectedAt: Date | null;
  readonly inspectionNote: string | null;
};

export type AdminOrderAudit = {
  readonly id: number;
  readonly action: string;
  readonly actorType: string;
  readonly actorStaffId: number | null;
  readonly actorRoleCodes: readonly string[];
  readonly reason: string | null;
  readonly occurredAt: Date;
};

export type AdminOrderDetail = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly status: string;
  readonly paymentMethod: string;
  readonly paymentState: string;
  readonly codState: string;
  readonly itemsSubtotalMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly confirmedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledReason: string | null;
  /** `null` on a guest order: the checkout switch allows a buyer with no account (D12/ADR 0024). */
  readonly customerId: number | null;
  readonly customerEmail: string | null;
  readonly customerDisplayName: string | null;
  readonly customerStatus: string | null;
  readonly contact: {
    readonly recipientName: string;
    readonly recipientPhone: string;
    readonly addressLine: string;
    readonly districtCode: string | null;
    readonly area: string;
    readonly city: string;
    readonly postcode: string | null;
    readonly deliveryNote: string | null;
  };
  readonly items: readonly AdminOrderItem[];
  /** Returned lines, once a parcel is coming back. Empty on an order that never failed delivery. */
  readonly returns: readonly AdminOrderReturn[];
  /** Every additional courier cost recorded on this order, voided ones included, newest first. */
  readonly costs: readonly AdditionalCost[];
  /**
   * The four money facts, kept separate: the customer's gross payment, the standard delivery fee
   * already inside it, the additional costs the shop incurred, and the estimated net proceeds.
   */
  readonly money: OrderMoney;
  readonly events: readonly AdminOrderEvent[];
  readonly shippedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly completedAt: Date | null;
  /**
   * Whole hours since placement, read here rather than in the view.
   *
   * The store has no 'how long has this been waiting' column and should not get one - age is derived
   * from `placed_at` and the current time. It is computed in this read so the page stays a pure
   * function of its data (a clock read during render is not).
   */
  readonly ageHours: number;
};

/**
 * One order, by its public reference.
 *
 * The order number is an opaque random token rather than a sequence, but that is not the control: the
 * only caller is a page that already required `order.read`. A reference that names no order returns
 * `null` so the page can answer 404 without distinguishing "never existed" from "deleted".
 */
export async function adminOrderDetail(
  tx: Transaction,
  orderNumber: string,
): Promise<AdminOrderDetail | null> {
  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentState: order.paymentState,
      codState: order.codState,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
      confirmedAt: order.confirmedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      cancelledReason: order.cancelledReason,
      customerId: customer.id,
      customerEmail: customer.email,
      customerDisplayName: customer.displayName,
      customerStatus: customer.status,
      recipientName: orderContact.recipientName,
      recipientPhone: orderContact.recipientPhone,
      addressLine: orderContact.addressLine,
      districtCode: orderContact.districtCode,
      area: orderContact.area,
      city: orderContact.city,
      postcode: orderContact.postcode,
      deliveryNote: orderContact.deliveryNote,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    /*
     * **A left join, deliberately.** An owner may allow guest checkout, and a guest order has
     * `customer_id = null`; the inner join this replaced dropped exactly those rows, so the order
     * appeared in the queue and then 404'd when the owner opened it.
     */
    .leftJoin(customer, sql`${customer.id} = ${order.customerId}`)
    .where(sql`${order.orderNumber} = ${orderNumber}`)
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const items = await tx
    .select({
      id: orderItem.id,
      nameBn: orderItem.productNameBn,
      nameEn: orderItem.productNameEn,
      variantLabel: orderItem.variantLabel,
      sku: orderItem.sku,
      unitPriceMinor: orderItem.unitPriceMinor,
      quantity: orderItem.quantity,
      lineTotalMinor: orderItem.lineTotalMinor,
      imageKey: orderItem.imageKeySnapshot,
    })
    .from(orderItem)
    .where(sql`${orderItem.orderId} = ${row.orderId}`)
    .orderBy(orderItem.id);

  /**
   * The returned lines. Read even when empty, because the order detail shows whether a return exists
   * (and offers the receipt and inspection actions) only from the stored rows.
   */
  const returns = await tx
    .select({
      id: customerReturn.id,
      orderItemId: customerReturn.orderItemId,
      sku: orderItem.sku,
      nameBn: orderItem.productNameBn,
      nameEn: orderItem.productNameEn,
      quantity: customerReturn.quantity,
      reason: customerReturn.reason,
      state: customerReturn.state,
      requestedAt: customerReturn.requestedAt,
      receivedAt: customerReturn.receivedAt,
      inspectedAt: customerReturn.inspectedAt,
      inspectionNote: customerReturn.inspectionNote,
    })
    .from(customerReturn)
    .innerJoin(orderItem, sql`${orderItem.id} = ${customerReturn.orderItemId}`)
    .where(sql`${customerReturn.orderId} = ${row.orderId}`)
    .orderBy(customerReturn.id);

  const costs = await listAdditionalCosts(tx, row.orderId);

  /**
   * The standard delivery fee can only be separated out when the order carries the delivery-area
   * snapshot Phase 19 introduced. Orders placed before it stored `0` delivery with no area, so whether
   * their shipping was ever the standard fee is unknown - the net figure is then reported unavailable
   * rather than netting a fee that was never charged.
   */
  const money = orderMoney({
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    additionalCostsMinor: costs
      .filter((cost) => cost.voidedAt === null)
      .reduce((total, cost) => total + cost.amountMinor, 0),
    activeCostCount: costs.filter((cost) => cost.voidedAt === null).length,
    deliveryFeeSubstantiated: row.districtCode !== null,
  });

  const events = await tx
    .select({
      id: orderEvent.id,
      eventType: orderEvent.eventType,
      fromValue: orderEvent.fromValue,
      toValue: orderEvent.toValue,
      actorType: orderEvent.actorType,
      actorStaffId: orderEvent.actorStaffId,
      reason: orderEvent.reason,
      occurredAt: orderEvent.occurredAt,
    })
    .from(orderEvent)
    .where(sql`${orderEvent.orderId} = ${row.orderId}`)
    .orderBy(orderEvent.id);

  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentState: row.paymentState,
    codState: row.codState,
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    totalMinor: row.totalMinor,
    confirmedAt: row.confirmedAt,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    completedAt: row.completedAt,
    ageHours: Math.max(0, Math.floor((Date.now() - row.placedAt.getTime()) / 3_600_000)),
    cancelledAt: row.cancelledAt,
    cancelledReason: row.cancelledReason,
    customerId: row.customerId,
    customerEmail: row.customerEmail,
    customerDisplayName: row.customerDisplayName,
    customerStatus: row.customerStatus,
    contact: {
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      addressLine: row.addressLine,
      districtCode: row.districtCode,
      area: row.area,
      city: row.city,
      postcode: row.postcode,
      deliveryNote: row.deliveryNote,
    },
    items,
    returns,
    costs,
    money,
    events,
  };
}

/**
 * The audit records written against one order.
 *
 * Filtered on `entity_type = 'order'` and the order's own id, which is exactly what `recordAudit` was
 * called with. Kept separate from `adminOrderDetail` because it requires a different permission
 * (`audit.read`) from reading an order.
 */
export async function adminOrderAudit(
  tx: Transaction,
  orderId: number,
  limit = 50,
): Promise<AdminOrderAudit[]> {
  return tx
    .select({
      id: auditEvent.id,
      action: auditEvent.action,
      actorType: auditEvent.actorType,
      actorStaffId: auditEvent.actorStaffId,
      actorRoleCodes: auditEvent.actorRoleCodes,
      reason: auditEvent.reason,
      occurredAt: auditEvent.occurredAt,
    })
    .from(auditEvent)
    .where(sql`${auditEvent.entityType} = 'order' and ${auditEvent.entityId} = ${orderId}`)
    .orderBy(sql`${auditEvent.occurredAt} desc, ${auditEvent.id} desc`)
    .limit(limit);
}

/** Statuses the order list can filter on. Anything else is treated as "all". */
export const ORDER_STATUS_FILTERS = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'returned',
] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export type AdminOrderRow = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly status: string;
  readonly codState: string;
  readonly paymentMethod: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly districtCode: string | null;
  readonly totalMinor: number;
  /**
   * The delivery charge snapshotted on the order, shown as the row's secondary money line. It is
   * read from the immutable snapshot and never recomputed (ADR 0016).
   */
  readonly shippingMinor: number;
  readonly itemCount: number;
};

export type AdminOrderPage = {
  readonly rows: readonly AdminOrderRow[];
  /** Total matching the current filters, so the page can state how much it is not showing. */
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
};

/** Rows per page for the order history. Deliberately small enough to render in one screen. */
export const ORDER_PAGE_SIZE = 25;

function orderSearchClause(search: string) {
  if (search === '') return sql`true`;
  const term = likeTerm(search);
  return sql`(${order.orderNumber} ilike ${term}
      or ${orderContact.recipientName} ilike ${term}
      or ${orderContact.recipientPhone} ilike ${term})`;
}

/**
 * The date window for a list, as a half-open `[start, end)` interval over `placed_at`.
 *
 * `end` is exclusive by construction (`dateRangeBounds` returns the start of the day *after* the
 * chosen last day), so a range covers both named days without a `23:59:59.999` edge that would drop
 * the last millisecond. Either bound may be null: one date alone is a genuine half-open range.
 */
export type ListDateRange = { readonly start: Date | null; readonly end: Date | null };

function dateClause(column: typeof order.placedAt, range: ListDateRange | undefined) {
  if (range === undefined || (range.start === null && range.end === null)) return sql`true`;
  const start = range.start === null ? sql`true` : sql`${column} >= ${range.start}`;
  const end = range.end === null ? sql`true` : sql`${column} < ${range.end}`;
  return sql`(${start} and ${end})`;
}

/**
 * One page of orders, newest first, with an exact total for the same filters.
 *
 * The count runs over the same predicate as the page, so "showing 25 of 340" cannot disagree with the
 * list it describes. `offset` is derived from a validated page number by the caller.
 */
export async function listOrdersForAdmin(
  tx: Transaction,
  options: {
    readonly search?: string;
    readonly status?: OrderStatusFilter | 'all';
    readonly dateRange?: ListDateRange;
    readonly limit?: number;
    readonly offset?: number;
  } = {},
): Promise<AdminOrderPage> {
  const search = options.search?.trim() ?? '';
  const status = options.status ?? 'all';
  const limit = Math.min(Math.max(options.limit ?? ORDER_PAGE_SIZE, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const statusClause = status === 'all' ? sql`true` : sql`${order.status} = ${status}`;
  const where = sql`${statusClause} and ${orderSearchClause(search)} and ${dateClause(order.placedAt, options.dateRange)}`;

  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      status: order.status,
      codState: order.codState,
      paymentMethod: order.paymentMethod,
      recipientName: orderContact.recipientName,
      recipientPhone: orderContact.recipientPhone,
      districtCode: orderContact.districtCode,
      totalMinor: order.totalMinor,
      shippingMinor: order.shippingMinor,
      // The count of recorded line items, read in the same query. `order_item` is frozen by trigger,
      // so this cannot drift from what the order says it contains.
      itemCount: sql<number>`(
        select count(*)::int from "order_item" where "order_item"."order_id" = "order"."id"
      )`,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(where)
    .orderBy(sql`${order.placedAt} desc, ${order.id} desc`)
    .limit(limit)
    .offset(offset);

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(where);

  return { rows, total: counted[0]?.total ?? 0, limit, offset };
}
