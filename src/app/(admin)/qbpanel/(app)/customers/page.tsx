import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/qbpanel-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { customerCounts, customers, type CustomerFilter } from '@/server/orders/qbpanel-read';
import { CUSTOMER_PAGE_SIZE } from '@/server/orders/manage';
import { CustomersView, type CustomerNotice } from './CustomersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CustomerNotice[] = ['suspended', 'denied', 'conflict', 'invalid'];
const FILTERS: readonly CustomerFilter[] = ['all', 'active', 'suspended', 'flagged'];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): CustomerNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CustomerNotice) : null;
}

/** An unknown filter is `all` rather than a refusal: a stale link should still show something. */
function readFilter(value: string | string[] | undefined): CustomerFilter {
  const candidate = single(value);
  return (FILTERS as readonly string[]).includes(candidate) ? (candidate as CustomerFilter) : 'all';
}

/**
 * Customers, for the owner's moderation work.
 *
 * Viewing requires `customer.read`; suspending requires `customer.suspend` and is re-checked server
 * side, calls the existing `suspendCustomer` primitive (which revokes every live session and writes
 * the audited reason), and is only ever an owner decision made on a confirmed finding - never a
 * consequence of a COD decision. Search matches email, phone or display name.
 *
 * **Standing is a route, not a checkbox** (owner direction, 2026-11-21). All / Active / Suspended /
 * Flagged are links carrying `filter`, applied in SQL beside the search, so the pager's total is the
 * filtered total and a chip's count can never disagree with the list it opens. A flag is a review
 * flag, which blocks nothing - it is not a third standing, and the screen says so.
 *
 * Search, filter, page and page size are carried in the URL. A hand-typed page beyond the end resolves
 * to the last page; an unknown page size falls back to the default.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.customerRead);
  const params = await searchParams;
  const search = single(params.q).slice(0, 80);
  const size = readPageSize(single(params.size), CUSTOMER_PAGE_SIZE);
  const filter = readFilter(params.filter);

  const data = await withTransaction(async (tx) => {
    const first = await customers(tx, { search, filter, limit: size, offset: 0 });
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(readPageNumber(single(params.page)), pageCount);
    const result =
      page === 1
        ? first
        : await customers(tx, { search, filter, limit: size, offset: (page - 1) * size });
    const counts = await customerCounts(tx);
    return { ...result, page, pageCount, counts };
  });

  /*
   * One builder for every link on the page, so a filter change keeps the search and the page size, a
   * search keeps the filter, and neither ever carries a page number - narrowing a list always returns
   * to its first page rather than landing on an empty page 4.
   */
  const query = {
    q: search,
    filter: filter === 'all' ? '' : filter,
    size: size === CUSTOMER_PAGE_SIZE ? '' : String(size),
  } as const;

  return (
    <CustomersView
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      shown={data.rows.length}
      size={size}
      defaultSize={CUSTOMER_PAGE_SIZE}
      filter={filter}
      counts={data.counts}
      rows={data.rows.map((row) => ({
        customerId: row.customerId,
        email: row.email,
        phone: row.phone,
        displayName: row.displayName,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        orderCount: row.orderCount,
        lastOrderAt:
          row.lastOrderAt === null
            ? null
            : (row.lastOrderAt instanceof Date ? row.lastOrderAt : new Date(row.lastOrderAt)).toISOString(),
        suspendedReason: row.suspendedReason,
        suspendedAt:
          row.suspendedAt === null
            ? null
            : (row.suspendedAt instanceof Date ? row.suspendedAt : new Date(row.suspendedAt)).toISOString(),
        flagged: row.flagged,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      canSuspend={hasPermission(principal, PERMISSIONS.customerSuspend)}
      search={search}
      query={query}
      clearHref={buildQueryHref('/qbpanel/customers', { size: query.size })}
    />
  );
}