import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { readIssuedTokenFlash } from '@/server/auth/flash';
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
const NOTICES = ['tokenIssued', 'unavailable', 'invalid', 'denied', 'restored'] as const;
type CustomerNotice = (typeof NOTICES)[number];

function readNotice(value: string | string[] | undefined): CustomerNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CustomerNotice) : null;
}

export default async function AdminCustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.customerRead);
  const { id } = await params;
  const query = await searchParams;
  const customerId = parseId(id);
  if (customerId === null) notFound();

  const customer = await withTransaction((tx) => customerDetail(tx, customerId));
  if (customer === null) notFound();

  const canReadOrders = hasPermission(principal, PERMISSIONS.orderRead);

  // Read only. This page cannot clear the cookie - a page render may not mutate cookies in this
  // version of Next.js - so it reads the value once and the route clears it before rendering this page
  // again, which is what makes a reload show nothing. Only the digest is stored and the token is
  // single-use regardless.
  const flash = await readIssuedTokenFlash();
  const issuedToken =
    flash !== null && flash.subject === String(customerId)
      ? { token: flash.token, expiresAt: flash.expiresAt }
      : null;

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
        orderTotal: customer.orderTotal,
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
      canResetCredential={hasPermission(principal, PERMISSIONS.customerCredentialReset)}
      canReadOrders={canReadOrders}
      notice={readNotice(query.notice)}
      issuedToken={issuedToken}
      csrfToken={principal.csrfToken}
    />
  );
}
