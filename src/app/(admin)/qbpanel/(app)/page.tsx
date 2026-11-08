import { withTransaction } from '@/db/client';
import { requestNowIso } from '@/lib/clock';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadAnalytics, loadToday } from '@/server/analytics/read';
import { countCatalog } from '@/server/catalog/read';
import {
  codQueue,
  countCustomers,
  countRecentDenials,
  flaggedCustomers,
  outOfStockProducts,
  recentOrders,
  revenueSummary,
  type CodQueueItem,
  type FlaggedCustomer,
} from '@/server/orders/qbpanel-read';
import { countCodApprovalQueue } from '@/server/orders/manage';
import { listPromoCodes } from '@/server/promotions/service';
import { OverviewView } from './OverviewView';

/** The overview is a session-scoped page; nothing here is cached. */
export const dynamic = 'force-dynamic';

/** How many orders the overview shows before sending the owner to the full queue. */
const OVERVIEW_LIMIT = 3;
/** How many recent orders the dashboard lists. Five fits without scrolling on a laptop. */
const RECENT_LIMIT = 5;

/**
 * The overview: the shop's last thirty days, then the one queue that waits on a person.
 *
 * Every figure is derived on read from immutable order rows, so nothing can be counted twice: revenue
 * only exists once payment was recorded received, and an order that was merely dispatched contributes
 * nothing. The analytics window is the same loader the analytics screen uses, so the two screens cannot
 * disagree about the same thirty days.
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
  const canReadPromo = hasPermission(principal, PERMISSIONS.settingsWrite);

  const data = await withTransaction(async (tx) => {
    const pending = canReadOrders ? await codQueue(tx) : [];
    /*
     * The queue is read twice on purpose: the rows are capped for the screen, the count is not.
     * "Waiting on a call 25" beside a queue page that says 138 was the screen lying about the
     * backlog, and the backlog is the number the owner opens the app to see.
     */
    const pendingCount = canReadOrders ? await countCodApprovalQueue(tx) : 0;
    const flagged = canReadCustomers ? await flaggedCustomers(tx) : [];
    const denials = canReadAudit ? await countRecentDenials(tx) : null;
    const catalog = canReadCatalog ? await countCatalog(tx) : null;
    // Revenue is an order money fact, so it is gated by the permission that reads orders.
    const revenue = canReadOrders ? await revenueSummary(tx) : null;
    const analytics = canReadOrders ? await loadAnalytics(tx, 30) : null;
    const today = canReadOrders ? await loadToday(tx) : null;
    const recent = canReadOrders ? await recentOrders(tx, RECENT_LIMIT) : [];
    const customerTotal = canReadCustomers ? await countCustomers(tx) : null;
    const outOfStock = canReadCatalog ? await outOfStockProducts(tx, 5) : null;

    let promo: { active: number; redemptions: number; givenMinor: number } | null = null;
    if (canReadPromo) {
      const codes = await listPromoCodes(tx);
      const analyticsPromos = canReadOrders ? analytics?.promos : undefined;
      promo = {
        active: codes.filter((code) => code.isActive).length,
        redemptions: analyticsPromos?.redemptions ?? 0,
        givenMinor: analyticsPromos?.discountGivenMinor ?? 0,
      };
    }

    return {
      pending,
      pendingCount,
      flagged,
      denials,
      catalog,
      revenue,
      analytics,
      today,
      recent,
      customerTotal,
      outOfStock,
      promo,
    };
  });

  const pending = data.pending;
  const oldest = pending[0] ?? null;

  return (
    <OverviewView
      displayName={principal.displayName}
      nowIso={requestNowIso()}
      pending={pending.slice(0, OVERVIEW_LIMIT).map(serializeOrder)}
      pendingCount={data.pendingCount}
      oldestPlacedAt={oldest === null ? null : oldest.placedAt.toISOString()}
      moreCount={Math.max(0, data.pendingCount - OVERVIEW_LIMIT)}
      flagged={data.flagged.map(serializeFlag)}
      denials={data.denials}
      catalog={data.catalog}
      revenue={canReadOrders ? (data.revenue ?? null) : null}
      analytics={
        data.analytics === null
          ? null
          : {
              summary: {
                revenueMinor: data.analytics.summary.revenueMinor,
                completedOrders: data.analytics.summary.completedOrders,
                ordersPlaced: data.analytics.summary.ordersPlaced,
                itemsSold: data.analytics.summary.itemsSold,
                customersServed: data.analytics.summary.customersServed,
              },
              series: data.analytics.series.map((point) => ({
                date: point.date,
                revenueMinor: point.revenueMinor,
              })),
              statuses: data.analytics.statuses.map((slice) => ({
                status: slice.status,
                count: slice.count,
              })),
              topProducts: data.analytics.topProducts.map((row) => ({
                name: row.name,
                units: row.units,
                revenueMinor: row.revenueMinor,
              })),
            }
      }
      today={data.today}
      customerTotal={data.customerTotal}
      outOfStock={
        data.outOfStock === null
          ? null
          : data.outOfStock.map((row) => ({
              id: row.id,
              nameEn: row.nameEn,
              slug: row.slug,
            }))
      }
      recent={data.recent.map((row) => ({
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        placedAt: row.placedAt.toISOString(),
        totalMinor: row.totalMinor,
        status: row.status,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
      }))}
      promo={data.promo}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
      canReadOrders={canReadOrders}
      canReadCustomers={canReadCustomers}
      canReadAudit={canReadAudit}
      canReadCatalog={canReadCatalog}
      canReadPromo={canReadPromo}
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
