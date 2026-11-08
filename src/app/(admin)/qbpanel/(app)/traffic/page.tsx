import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { parsePeriod } from '@/server/analytics/read';
import { loadVisitAnalytics } from '@/server/analytics/visits';
import { TrafficView } from './TrafficView';

export const dynamic = 'force-dynamic';

/**
 * Traffic - the shop's own readers, on their own screen (owner direction, 2026-11-09).
 *
 * It sits beside Analytics rather than inside it because the two answer different questions and are
 * never added together: Analytics is about money taken (`order` rows), Traffic is about visits to the
 * storefront (`visit_session` rows, ADR 0027). A visit is not an order and a session is not a person,
 * and folding them into one page invites reading a page view as a sale.
 *
 * Permission: `order.read`, the same one Analytics uses. This is another reading of this shop's own
 * activity, and administration is owner-only (D10, ADR 0009) - it is not a new capability.
 *
 * The window comes from the query string and is validated against a fixed set, so a crafted period
 * cannot ask for an unbounded scan.
 */
export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const visits = await withTransaction((tx) => loadVisitAnalytics(tx, period));

  return (
    <TrafficView
      period={period}
      visits={{
        visitsToday: visits.visitsToday,
        pageViewsToday: visits.pageViewsToday,
        liveNow: visits.liveNow,
        cartSessions: visits.cartSessions,
        abandonedCarts: visits.abandonedCarts,
        ordersFromVisits: visits.ordersFromVisits,
        totals: visits.totals,
        series: visits.series,
        funnel: visits.funnel,
        topPaths: visits.topPaths,
        divisions: visits.divisions,
        devices: visits.devices,
      }}
    />
  );
}
