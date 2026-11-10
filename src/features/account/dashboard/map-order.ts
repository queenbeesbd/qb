import type { CustomerOrderSummary } from '@/server/orders/read';

import type { DashboardOrder } from './types';

/**
 * One step between the database projection and what a client view may receive.
 *
 * The `Date` becomes an ISO string here, at the server boundary, so the views hold only serialisable
 * values and every date is formatted in one place (`OrderRow`). Nothing is added, derived or dropped:
 * a field the customer does not read is simply not selected by the query.
 */
export function toDashboardOrder(order: CustomerOrderSummary): DashboardOrder {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentState: order.paymentState,
    codState: order.codState,
    paymentMethod: order.paymentMethod,
    districtCode: order.districtCode,
    itemsSubtotalMinor: order.itemsSubtotalMinor,
    shippingMinor: order.shippingMinor,
    totalMinor: order.totalMinor,
    placedAt: order.placedAt.toISOString(),
    itemCount: order.itemCount,
  };
}
