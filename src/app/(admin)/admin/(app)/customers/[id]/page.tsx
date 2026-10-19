import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { parseId } from '@/server/catalog/validation';
import { customerDetail } from '@/server/orders/admin-read';
import { CustomerDetailView } from './CustomerDetailView';

export const dynamic = 'force-dynamic';

/**
 * One customer's standing and recorded orders.
 *
 * Requires `customer.read`. The order list is shown only to a principal that also holds `order.read`,
 * because order history is order data, not customer-profile data. An id that names no live customer is
 * answered with 404 - never 403 - so the page cannot be used to test whether an account exists.
 */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.customerRead);
  const { id } = await params;
  const customerId = parseId(id);
  if (customerId === null) notFound();

  const customer = await withTransaction((tx) => customerDetail(tx, customerId));
  if (customer === null) notFound();

  const canReadOrders = hasPermission(principal, PERMISSIONS.orderRead);

  return (
    <CustomerDetailView
      customer={{
        customerId: customer.customerId,
        email: customer.email,
        displayName: customer.displayName,
        status: customer.status,
        createdAt: customer.createdAt.toISOString(),
        flagged: customer.flagged,
        flagReason: customer.flagReason,
        orders: canReadOrders
          ? customer.orders.map((order) => ({
              orderId: order.orderId,
              orderNumber: order.orderNumber,
              placedAt: order.placedAt.toISOString(),
              status: order.status,
              paymentMethod: order.paymentMethod,
              codState: order.codState,
              totalMinor: order.totalMinor,
            }))
          : null,
      }}
      canSuspend={hasPermission(principal, PERMISSIONS.customerSuspend)}
      canReadOrders={canReadOrders}
      csrfToken={principal.csrfToken}
    />
  );
}
