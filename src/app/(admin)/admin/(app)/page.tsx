import { withTransaction } from '@/db/client';
import { requestNowIso } from '@/lib/clock';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { countCatalog } from '@/server/catalog/read';
import {
  codQueue,
  countRecentDenials,
  flaggedCustomers,
  type CodQueueItem,
  type FlaggedCustomer,
} from '@/server/orders/admin-read';
import { OverviewView } from './OverviewView';

/** The overview is a session-scoped page; nothing here is cached. */
export const dynamic = 'force-dynamic';

/** How many orders the overview shows before sending the owner to the full queue. */
const OVERVIEW_LIMIT = 5;

/**
 * The overview answers one question: what needs the owner right now?
 *
 * The old facts grid counted rows whether or not anything was waiting, so it answered "how much is
 * there". This page leads with the COD worklist - the only queue that waits on a person - then
 * everything that is blocked or refused, then reference counts. Every figure is a count of rows
 * that exist; there is no revenue, conversion or growth metric because the application cannot
 * substantiate one.
 *
 * Requires `staff.read`, which every owner-level account holds. The sections inside are gated by the
 * permission their destination requires, so the page never links to a refusal.
 */
export default async function AdminOverviewPage() {
  const principal = await requireAdminPage(PERMISSIONS.staffRead);
  const canReadOrders = hasPermission(principal, PERMISSIONS.orderRead);
  const canReadCustomers = hasPermission(principal, PERMISSIONS.customerRead);
  const canReadAudit = hasPermission(principal, PERMISSIONS.auditRead);
  const canReadCatalog = hasPermission(principal, PERMISSIONS.catalogWrite);

  const data = await withTransaction(async (tx) => {
    const pending = canReadOrders ? await codQueue(tx) : [];
    const flagged = canReadCustomers ? await flaggedCustomers(tx) : [];
    const denials = canReadAudit ? await countRecentDenials(tx) : null;
    const catalog = canReadCatalog ? await countCatalog(tx) : null;
    return { pending, flagged, denials, catalog };
  });

  const pending = data.pending;
  const oldest = pending[0] ?? null;

  return (
    <OverviewView
      nowIso={requestNowIso()}
      pending={pending.slice(0, OVERVIEW_LIMIT).map(serializeOrder)}
      pendingCount={pending.length}
      oldestPlacedAt={oldest === null ? null : oldest.placedAt.toISOString()}
      moreCount={Math.max(0, pending.length - OVERVIEW_LIMIT)}
      flagged={data.flagged.map(serializeFlag)}
      denials={data.denials}
      catalog={data.catalog}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
      canReadOrders={canReadOrders}
      canReadCustomers={canReadCustomers}
      canReadAudit={canReadAudit}
      canReadCatalog={canReadCatalog}
    />
  );
}

function serializeOrder(row: CodQueueItem) {
  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt.toISOString(),
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    totalMinor: row.totalMinor,
    recipientName: row.recipientName,
    districtCode: row.districtCode,
    recipientPhone: row.recipientPhone,
    area: row.area,
    city: row.city,
    addressLine: row.addressLine,
    items: row.items.map((item) => ({
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };
}

function serializeFlag(row: FlaggedCustomer) {
  return {
    customerId: row.customerId,
    displayName: row.displayName,
    email: row.email,
    reason: row.reason,
  };
}
