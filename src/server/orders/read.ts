/**
 * Customer-scoped order reads.
 *
 * Every function takes the **session's** `customerId` and filters on it in SQL. There is no variant
 * that takes an order number alone, so "another customer's order" is not a case the code has to
 * remember to refuse - it is a row the query cannot return. The caller maps `null` to a not-found
 * response, never to a 403 that would confirm the order exists (\`docs/security.md\` 13.1).
 *
 * These are projections for the customer's own account pages. They carry no internal identifier the
 * customer does not need, and no other customer's data.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderContact, orderItem } from '@/db/schema';

export type CustomerOrderSummary = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly status: string;
  readonly paymentState: string;
  readonly codState: string;
  readonly paymentMethod: string;
  readonly districtCode: string | null;
  readonly itemsSubtotalMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  readonly placedAt: Date;
  readonly itemCount: number;
};

export type CustomerOrderDetail = CustomerOrderSummary & {
  readonly expiresAt: Date | null;
  readonly contact: {
    readonly recipientName: string;
    readonly districtCode: string | null;
    readonly recipientPhone: string;
    readonly addressLine: string;
    readonly area: string;
    readonly city: string;
    readonly postcode: string | null;
    readonly deliveryNote: string | null;
  };
  readonly items: readonly {
    readonly productNameBn: string;
    readonly productNameEn: string;
    readonly variantLabel: string | null;
    readonly sku: string;
    readonly unitPriceMinor: number;
    readonly quantity: number;
    readonly lineTotalMinor: number;
    readonly imageKey: string | null;
  }[];
};

/** The customer's own orders, newest first. */
export async function listCustomerOrders(
  tx: Transaction,
  customerId: number,
): Promise<CustomerOrderSummary[]> {
  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentState: order.paymentState,
      codState: order.codState,
      paymentMethod: order.paymentMethod,
      districtCode: orderContact.districtCode,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
      placedAt: order.placedAt,
      itemCount: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
    })
    .from(order)
    .leftJoin(orderItem, sql`${orderItem.orderId} = ${order.id}`)
    .leftJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(sql`${order.customerId} = ${customerId}`)
    .groupBy(
      order.id,
      order.orderNumber,
      order.status,
      order.paymentState,
      order.codState,
      order.paymentMethod,
      orderContact.districtCode,
      order.itemsSubtotalMinor,
      order.shippingMinor,
      order.totalMinor,
      order.placedAt,
    )
    .orderBy(sql`${order.placedAt} desc, ${order.id} desc`);

  return rows;
}

/**
 * One of the customer's own orders, or `null`.
 *
 * Two queries rather than a join: the item list is a list, and folding it into a join would duplicate
 * the order row and invite a "pick the first" bug.
 */
export async function getCustomerOrderDetail(
  tx: Transaction,
  customerId: number,
  orderNumber: string,
): Promise<CustomerOrderDetail | null> {
  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentState: order.paymentState,
      codState: order.codState,
      paymentMethod: order.paymentMethod,
      totalMinor: order.totalMinor,
      itemsSubtotalMinor: order.itemsSubtotalMinor,
      shippingMinor: order.shippingMinor,
      placedAt: order.placedAt,
      expiresAt: order.expiresAt,
      recipientName: orderContact.recipientName,
      districtCode: orderContact.districtCode,
      recipientPhone: orderContact.recipientPhone,
      addressLine: orderContact.addressLine,
      area: orderContact.area,
      city: orderContact.city,
      postcode: orderContact.postcode,
      deliveryNote: orderContact.deliveryNote,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    .where(sql`${order.customerId} = ${customerId} and ${order.orderNumber} = ${orderNumber}`);

  const row = rows[0];
  if (row === undefined) return null;

  const items = await tx
    .select({
      productNameBn: orderItem.productNameBn,
      productNameEn: orderItem.productNameEn,
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

  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    status: row.status,
    paymentState: row.paymentState,
    codState: row.codState,
    paymentMethod: row.paymentMethod,
    districtCode: row.districtCode,
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    totalMinor: row.totalMinor,
    placedAt: row.placedAt,
    expiresAt: row.expiresAt,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    contact: {
      recipientName: row.recipientName,
      districtCode: row.districtCode,
      recipientPhone: row.recipientPhone,
      addressLine: row.addressLine,
      area: row.area,
      city: row.city,
      postcode: row.postcode,
      deliveryNote: row.deliveryNote,
    },
    items,
  };
}
