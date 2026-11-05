import type { Metadata } from 'next';
import { withTransaction } from '@/db/client';
import { AccountView } from '@/features/account/AccountView';
import type { OrderListItem } from '@/features/account/OrdersView';
import { currentCustomerPrincipal } from '@/server/customer-auth/guard';
import { listCustomerOrders } from '@/server/orders/read';

export const metadata: Metadata = { title: 'My account' };
export const dynamic = 'force-dynamic';

/**
 * The account landing page.
 *
 * It resolves the session on the server and passes only the two facts the view needs, so the client
 * component never sees a token, an expiry or an identifier it does not display.
 */
export default async function AccountPage() {
  const principal = await currentCustomerPrincipal();

  /*
   * The hub answers "where are my orders?", so it reads the same customer-scoped list the orders page
   * reads and shows the three newest. The query is filtered by the session's customer id in SQL, and
   * the projection carries only the columns this screen states.
   */
  const orders =
    principal === null
      ? []
      : await withTransaction((tx) => listCustomerOrders(tx, principal.customerId));

  const recentOrders: OrderListItem[] = orders.slice(0, 3).map((order) => ({
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

  return (
    <AccountView
      customer={
        principal === null ? null : { email: principal.email, displayName: principal.displayName }
      }
      csrfToken={principal?.csrfToken ?? null}
      recentOrders={recentOrders}
      orderCount={orders.length}
    />
  );
}
