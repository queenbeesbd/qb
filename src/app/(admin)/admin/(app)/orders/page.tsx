import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listOrdersForAdmin, ORDER_PAGE_SIZE, ORDER_STATUS_FILTERS } from '@/server/orders/admin-order';
import { AdminOrdersView, type OrdersFilter } from './OrdersView';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/** A page number, parsed defensively: anything not a positive integer is page 1. */
function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function readFilter(value: string): OrdersFilter {
  return (ORDER_STATUS_FILTERS as readonly string[]).includes(value) ? (value as OrdersFilter) : 'all';
}

/**
 * The owner's order history.
 *
 * Requires `order.read`. Search and filter are applied in SQL (never in the browser) and both are
 * carried in the URL, so a filtered page is linkable and the back button works. The list is paginated
 * with an exact total, so it can never silently truncate.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const search = single(params.q).slice(0, 80);
  const filter = readFilter(single(params.filter));

  // The page number is resolved against the real total before the page is read, so a hand-typed
  // `?page=9999` shows the last page of results rather than an empty screen with no explanation.
  const data = await withTransaction(async (tx) => {
    const first = await listOrdersForAdmin(tx, { search, status: filter, limit: ORDER_PAGE_SIZE, offset: 0 });
    const pageCount = Math.max(1, Math.ceil(first.total / ORDER_PAGE_SIZE));
    const requested = pageNumber(single(params.page));
    const page = Math.min(requested, pageCount);
    const result =
      page === 1
        ? first
        : await listOrdersForAdmin(tx, {
            search,
            status: filter,
            limit: ORDER_PAGE_SIZE,
            offset: (page - 1) * ORDER_PAGE_SIZE,
          });
    return { ...result, page, pageCount };
  });

  return (
    <AdminOrdersView
      rows={data.rows.map((row) => ({
        orderNumber: row.orderNumber,
        placedAt: row.placedAt.toISOString(),
        status: row.status,
        codState: row.codState,
        paymentMethod: row.paymentMethod,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        districtCode: row.districtCode,
        totalMinor: row.totalMinor,
      }))}
      search={search}
      filter={filter}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      shown={data.rows.length}
    />
  );
}
