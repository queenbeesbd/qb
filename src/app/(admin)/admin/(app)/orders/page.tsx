import { withTransaction } from '@/db/client';
import {
  buildQueryHref,
  dateRangeBounds,
  readDateInput,
  readPageNumber,
  readPageSize,
} from '@/lib/admin-query';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listOrdersForAdmin, ORDER_PAGE_SIZE, ORDER_STATUS_FILTERS } from '@/server/orders/admin-order';
import { AdminOrdersView, type OrdersFilter } from './OrdersView';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readFilter(value: string): OrdersFilter {
  return (ORDER_STATUS_FILTERS as readonly string[]).includes(value) ? (value as OrdersFilter) : 'all';
}

/**
 * The owner's order history.
 *
 * Requires `order.read`. Search, the status filter, the date range and pagination are all applied in
 * SQL (never in the browser) and all carried in the URL, so a filtered page is linkable and the back
 * button works. The list is paginated with an exact total, so it can never silently truncate.
 *
 * Invalid parameters are clamped rather than refused: a hand-typed `?page=9999` shows the last page,
 * an unknown status falls back to "all", and an impossible date (`2026-02-31`) is ignored. A bad URL
 * must never produce an error screen on a list an owner reaches by editing the address bar.
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
  const from = readDateInput(single(params.from));
  const to = readDateInput(single(params.to));
  const dateRange = dateRangeBounds(from, to);
  const size = readPageSize(single(params.size), ORDER_PAGE_SIZE);

  // The page number is resolved against the real total before the page is read, so a hand-typed
  // `?page=9999` shows the last page of results rather than an empty screen with no explanation.
  const data = await withTransaction(async (tx) => {
    const first = await listOrdersForAdmin(tx, {
      search,
      status: filter,
      dateRange,
      limit: size,
      offset: 0,
    });
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const requested = readPageNumber(single(params.page));
    const page = Math.min(requested, pageCount);
    const result =
      page === 1
        ? first
        : await listOrdersForAdmin(tx, {
            search,
            status: filter,
            dateRange,
            limit: size,
            offset: (page - 1) * size,
          });
    return { ...result, page, pageCount };
  });

  // The filter state without the page number: every link that changes what is shown starts at page 1.
  const baseQuery = { q: search, filter: filter === 'all' ? '' : filter, from, to, size };

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
        shippingMinor: row.shippingMinor,
        itemCount: row.itemCount,
      }))}
      search={search}
      filter={filter}
      from={from}
      to={to}
      baseQuery={baseQuery}
      clearHref={buildQueryHref('/admin/orders', { size: size === ORDER_PAGE_SIZE ? null : size })}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      shown={data.rows.length}
      size={size}
      defaultSize={ORDER_PAGE_SIZE}
    />
  );
}
