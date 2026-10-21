import type { Metadata } from 'next';
import { withTransaction } from '@/db/client';
import { OrdersView, type OrderListItem } from '@/features/account/OrdersView';
import { CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';
import { listCustomerOrders } from '@/server/orders/read';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The customer's own orders. The query is filtered by the session's `customer_id` in SQL, so this page
 * cannot list another customer's orders even if it wanted to.
 */
export default async function OrdersPage() {
  const principal = await requireCustomerPage(CUSTOMER_ORDERS_PATH);
  const orders = await withTransaction((tx) => listCustomerOrders(tx, principal.customerId));

  const items: OrderListItem[] = orders.map((order) => ({
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
  }));

  return <OrdersView orders={items} />;
}
