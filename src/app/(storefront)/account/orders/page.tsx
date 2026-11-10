import type { Metadata } from 'next';

import { withTransaction } from '@/db/client';
import { AccountFrame } from '@/features/account/dashboard/AccountFrame';
import { AccountOrders } from '@/features/account/dashboard/AccountOrders';
import { isOrderGroup, type OrderGroup } from '@/features/account/dashboard/groups';
import { toDashboardOrder } from '@/features/account/dashboard/map-order';
import { CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';
import { listCustomerOrders } from '@/server/orders/read';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The customer's own orders. The query is filtered by the session's `customer_id` in SQL, so this page
 * cannot list another customer's orders even if it wanted to.
 *
 * The group is a URL search parameter checked against a closed set, so an unknown value falls back to
 * "all" instead of shaping a query or an empty screen of its own.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireCustomerPage(CUSTOMER_ORDERS_PATH);
  const orders = await withTransaction((tx) => listCustomerOrders(tx, principal.customerId));
  const query = await searchParams;
  const requested = typeof query.state === 'string' ? query.state : undefined;
  const group: OrderGroup = isOrderGroup(requested) ? requested : 'all';

  return (
    <AccountFrame
      customer={{ email: principal.email, displayName: principal.displayName }}
      csrfToken={principal.csrfToken}
      active="orders"
    >
      <AccountOrders orders={orders.map(toDashboardOrder)} group={group} />
    </AccountFrame>
  );
}
