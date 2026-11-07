import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadAnalytics, parsePeriod } from '@/server/analytics/read';
import { loadVisitAnalytics } from '@/server/analytics/visits';
import { AnalyticsView } from './AnalyticsView';

export const dynamic = 'force-dynamic';

/**
 * Analytics - the derived figures screen.
 *
 * Requires `order.read`, the same permission that already allows reading every order: this page is a
 * different view of those rows, not a new capability. The window comes from the query string and is
 * validated against a fixed set, so a crafted period cannot ask for an unbounded scan.
 *
 * The traffic figures are the shop's own first-party visit log (ADR 0027), read on the same window and
 * the same Dhaka calendar as the sales figures. They are a separate read because they are a separate
 * fact: a visit is not an order, and the two are never added together.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const [data, visits] = await withTransaction(async (tx) => {
    const sales = await loadAnalytics(tx, period);
    const traffic = await loadVisitAnalytics(tx, period);
    return [sales, traffic] as const;
  });

  return (
    <AnalyticsView
      data={{
        period: data.period,
        summary: data.summary,
        series: data.series,
        statuses: data.statuses,
        topProducts: data.topProducts,
        promos: data.promos,
      }}
      visits={visits}
    />
  );
}
