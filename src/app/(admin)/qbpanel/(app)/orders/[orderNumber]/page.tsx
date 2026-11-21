import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { brand, product } from '@/db/schema';
import { orderReceiptPath } from '@/lib/order-paths';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadSteadfastSettings, publicStatus } from '@/server/integrations/steadfast';
import { loadConsignment } from '@/server/integrations/steadfast-booking';
import { adminOrderAudit, adminOrderDetail, adminOrderNeighbours } from '@/server/orders/qbpanel-order';
import type { ReviewProductOption } from '../../../_ui/ReviewProductPicker';
import { AdminOrderDetailView, type AdminOrderNotice } from './OrderDetailView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };

const NOTICES: readonly AdminOrderNotice[] = [
  'approved',
  'steadfastBooked',
  'steadfastExists',
  'steadfastFailed',
  'steadfastNotConfigured',
  'steadfastInProgress',
  'steadfastRefreshed',
  'steadfastMissing',
  'rejected',
  'dispatched',
  'delivered',
  'failed',
  'returned',
  'paid',
  'completed',
  'cancelled',
  'inspected',
  'costRecorded',
  'costVoided',
  'costInvalid',
  'proofReviewed',
  'proofInvalid',
  'lineAdded',
  'lineInvalid',
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
    // The courier record is read beside the order, and the account's shape beside that: the page may
    // offer "Send to SteadFast" only when the order is bookable and the account can actually be used.
    const consignment = await loadConsignment(tx, detail.orderId);
    const steadfast = publicStatus(await loadSteadfastSettings(tx));
    const neighbours = await adminOrderNeighbours(tx, detail.orderId);
    return { detail, audit, consignment, steadfast, neighbours };
  });
  if (data === null) notFound();

  const detail = data.detail;
  const canReadCustomers = hasPermission(principal, PERMISSIONS.customerRead);
  const canAddLine =
    hasPermission(principal, PERMISSIONS.orderAmend) &&
    detail.paymentMethod === 'cod' &&
    ['pending', 'confirmed', 'processing'].includes(detail.status) &&
    (detail.codState === 'cod_pending_approval' || detail.codState === 'cod_approved');

  /*
    ADR 0046: the picker carries the photograph as well as the name and brand, because the owner is
    recognising a product from a phone call. It is the same primary-or-first projection the reviews
    composer uses, and only live, published products are offered.
  */
  const pickableProducts: readonly ReviewProductOption[] = canAddLine
    ? await withTransaction((tx) =>
        tx
          .select({
            id: product.id,
            nameEn: product.nameEn,
            slug: product.slug,
            brandNameEn: brand.nameEn,
            primaryImageKey: sql<string | null>`(
              select "base_key" from "product_image"
              where "product_image"."product_id" = "product"."id"
                and "product_image"."deleted_at" is null
              order by "product_image"."is_primary" desc, "product_image"."sort_order" asc, "product_image"."id" asc
              limit 1
            )`,
          })
          .from(product)
          .innerJoin(brand, eq(brand.id, product.brandId))
          .where(
            sql`${product.deletedAt} is null and ${product.isPublished} and ${product.availability} = 'in_stock'`,
          )
          .orderBy(product.nameEn)
          .limit(500),
      )
    : [];
  /*
   * The return link always goes to the one Orders screen (owner-approved merge, 2026-11-19). `from`
   * is still read so a link written before the merge, or by a hand-edited URL, lands on the history
   * rather than failing - but no destination in the app points at the retired COD route any more, so
   * there is only one label: back to orders.
   */
  const returnTo = { href: '/qbpanel/orders', labelKey: 'admin.order.back' as const };

  /*
    The receipt address the order card shows and copies. Built from the request's own host so the
    owner reads the address a customer would open, never a hardcoded domain; behind the proxy the
    forwarded host/protocol are what Traefik saw.
  */
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const proto = headerList.get('x-forwarded-proto') ?? 'https';
  const receiptPath = orderReceiptPath(detail.orderNumber);
  const receiptUrl = host === '' ? receiptPath : `${proto}://${host}${receiptPath}`;

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
          /* The account's own dates are customer profile facts: withheld like the email. */
          createdAt:
            canReadCustomers && detail.customerCreatedAt !== null
              ? detail.customerCreatedAt.toISOString()
              : null,
          orderCount: detail.customerOrderCount,
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
          imageKey: item.imageKey,
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
        costs: detail.costs.map((cost) => ({
          id: cost.id,
          amountMinor: cost.amountMinor,
          description: cost.description,
          recordedAt: cost.recordedAt.toISOString(),
          voidedAt: cost.voidedAt === null ? null : cost.voidedAt.toISOString(),
          voidReason: cost.voidReason,
        })),
        money: {
          customerPaymentMinor: detail.money.customerPaymentMinor,
          standardDeliveryFeeMinor: detail.money.standardDeliveryFeeMinor,
          additionalCostsMinor: detail.money.additionalCostsMinor,
          activeCostCount: detail.money.activeCostCount,
          estimatedNetProceedsMinor: detail.money.estimatedNetProceedsMinor,
        },
        paymentProof:
          detail.paymentProof === null
            ? null
            : {
                uploadedAt: detail.paymentProof.uploadedAt.toISOString(),
                uploadedBy: detail.paymentProof.uploadedBy,
                reviewState: detail.paymentProof.reviewState,
                reviewedAt:
                  detail.paymentProof.reviewedAt === null
                    ? null
                    : detail.paymentProof.reviewedAt.toISOString(),
                reviewNote: detail.paymentProof.reviewNote,
                width: detail.paymentProof.width,
                height: detail.paymentProof.height,
              },
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
        consignment:
          data.consignment === null
            ? null
            : {
                invoice: data.consignment.invoice,
                consignmentId: data.consignment.consignmentId,
                trackingCode: data.consignment.trackingCode,
                status: data.consignment.status,
                codAmountMinor: data.consignment.codAmountMinor,
                createdAt: data.consignment.createdAt.toISOString(),
                statusCheckedAt:
                  data.consignment.statusCheckedAt === null
                    ? null
                    : data.consignment.statusCheckedAt.toISOString(),
              },
        steadfast: { configured: data.steadfast.configured, enabled: data.steadfast.enabled },
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
      neighbours={{
        position: data.neighbours.position,
        total: data.neighbours.total,
        newer: data.neighbours.newer,
        older: data.neighbours.older,
      }}
      receiptUrl={receiptUrl}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
      canFulfil={hasPermission(principal, PERMISSIONS.orderDispatch)}
      canCollect={hasPermission(principal, PERMISSIONS.codConfirmCollection)}
      canInspect={hasPermission(principal, PERMISSIONS.returnInspect)}
      canRecordCosts={hasPermission(principal, PERMISSIONS.orderCostRecord)}
      canReviewProof={hasPermission(principal, PERMISSIONS.paymentProofReview)}
      canAddLine={canAddLine}
      pickableProducts={pickableProducts}
      addLineKey={randomUUID()}
      canReadCustomers={canReadCustomers}
      canReadAudit={hasPermission(principal, PERMISSIONS.auditRead)}
      returnTo={returnTo}
    />
  );
}
