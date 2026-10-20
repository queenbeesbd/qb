import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { adminOrderAudit, adminOrderDetail } from '@/server/orders/admin-order';
import { AdminOrderDetailView, type AdminOrderNotice } from './OrderDetailView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

const NOTICES: readonly AdminOrderNotice[] = [
  'approved',
  'rejected',
  'dispatched',
  'delivered',
  'failed',
  'returned',
  'paid',
  'completed',
  'cancelled',
  'inspected',
  'denied',
  'conflict',
  'invalid',
];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): AdminOrderNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as AdminOrderNotice) : null;
}

/**
 * One order, for the owner.
 *
 * Requires `order.read`. A reference that names no order is a 404 rather than a forbidden answer, so
 * the page cannot be used to probe which order numbers exist. The customer link is only rendered for a
 * principal that also holds `customer.read`, and the audit trail only for `audit.read`, because those
 * are different permissions from reading an order.
 *
 * `from` carries the caller's list context (`queue` or `orders`, with its query string) so the back
 * link returns the owner to the list they came from instead of a default one.
 */
export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.orderRead);
  const { orderNumber } = await params;
  const query = await searchParams;
  // The reference is a bounded opaque token; anything longer cannot be one this application issued.
  const reference = orderNumber.slice(0, 64);

  const data = await withTransaction(async (tx) => {
    const detail = await adminOrderDetail(tx, reference);
    if (detail === null) return null;
    const canReadAudit = hasPermission(principal, PERMISSIONS.auditRead);
    const audit = canReadAudit ? await adminOrderAudit(tx, detail.orderId) : null;
    return { detail, audit };
  });
  if (data === null) notFound();

  const detail = data.detail;
  const canReadCustomers = hasPermission(principal, PERMISSIONS.customerRead);
  const returnTo =
    single(query.from) === 'queue'
      ? { href: '/admin/orders-cod', labelKey: 'admin.order.backToQueue' as const }
      : { href: '/admin/orders', labelKey: 'admin.order.back' as const };

  return (
    <AdminOrderDetailView
      order={{
        orderId: detail.orderId,
        orderNumber: detail.orderNumber,
        placedAt: detail.placedAt.toISOString(),
        ageHours: detail.ageHours,
        status: detail.status,
        paymentMethod: detail.paymentMethod,
        paymentState: detail.paymentState,
        codState: detail.codState,
        itemsSubtotalMinor: detail.itemsSubtotalMinor,
        shippingMinor: detail.shippingMinor,
        totalMinor: detail.totalMinor,
        confirmedAt: detail.confirmedAt === null ? null : detail.confirmedAt.toISOString(),
        shippedAt: detail.shippedAt === null ? null : detail.shippedAt.toISOString(),
        deliveredAt: detail.deliveredAt === null ? null : detail.deliveredAt.toISOString(),
        completedAt: detail.completedAt === null ? null : detail.completedAt.toISOString(),
        cancelledAt: detail.cancelledAt === null ? null : detail.cancelledAt.toISOString(),
        cancelledReason: detail.cancelledReason,
        customer: {
          id: detail.customerId,
          /*
            The email is *not* sent to the browser at all unless the principal holds `customer.read`.
            Gating it in the view alone would not be enough: a client component receives its props
            serialized inside the response, so "not rendered" would still mean "delivered".
          */
          email: canReadCustomers ? detail.customerEmail : null,
          displayName: detail.customerDisplayName,
          status: detail.customerStatus,
        },
        contact: detail.contact,
        items: detail.items.map((item) => ({
          id: item.id,
          nameBn: item.nameBn,
          nameEn: item.nameEn,
          variantLabel: item.variantLabel,
          sku: item.sku,
          unitPriceMinor: item.unitPriceMinor,
          quantity: item.quantity,
          lineTotalMinor: item.lineTotalMinor,
        })),
        returns: detail.returns.map((entry) => ({
          id: entry.id,
          orderItemId: entry.orderItemId,
          sku: entry.sku,
          nameBn: entry.nameBn,
          nameEn: entry.nameEn,
          quantity: entry.quantity,
          reason: entry.reason,
          state: entry.state,
          requestedAt: entry.requestedAt.toISOString(),
          receivedAt: entry.receivedAt === null ? null : entry.receivedAt.toISOString(),
          inspectedAt: entry.inspectedAt === null ? null : entry.inspectedAt.toISOString(),
          inspectionNote: entry.inspectionNote,
        })),
        events: detail.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          fromValue: event.fromValue,
          toValue: event.toValue,
          actorType: event.actorType,
          actorStaffId: event.actorStaffId,
          reason: event.reason,
          occurredAt: event.occurredAt.toISOString(),
        })),
        audit:
          data.audit === null
            ? null
            : data.audit.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actorType: entry.actorType,
                actorStaffId: entry.actorStaffId,
                actorRoleCodes: entry.actorRoleCodes,
                reason: entry.reason,
                occurredAt: entry.occurredAt.toISOString(),
              })),
      }}
      notice={readNotice(query.notice)}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
      canFulfil={hasPermission(principal, PERMISSIONS.orderDispatch)}
      canCollect={hasPermission(principal, PERMISSIONS.codConfirmCollection)}
      canInspect={hasPermission(principal, PERMISSIONS.returnInspect)}
      canReadCustomers={canReadCustomers}
      canReadAudit={hasPermission(principal, PERMISSIONS.auditRead)}
      returnTo={returnTo}
    />
  );
}
