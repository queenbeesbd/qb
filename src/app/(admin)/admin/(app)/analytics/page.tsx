import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadAnalytics, parsePeriod } from '@/server/analytics/read';
import { AnalyticsView } from './AnalyticsView';

export const dynamic = 'force-dynamic';

/**
 * Analytics - the derived figures screen.
 *
 * Requires `order.read`, the same permission that already allows reading every order: this page is a
 * different view of those rows, not a new capability. The window comes from the query string and is
 * validated against a fixed set, so a crafted period cannot ask for an unbounded scan.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const period = parsePeriod(params.period);

  const data = await withTransaction((tx) => loadAnalytics(tx, period));

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
    />
  );
}
