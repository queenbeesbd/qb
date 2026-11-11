import { withTransaction } from '@/db/client';
import { buildQueryHref, readPageNumber, readPageSize } from '@/lib/qbpanel-query';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { customers } from '@/server/orders/qbpanel-read';
import { CUSTOMER_PAGE_SIZE } from '@/server/orders/manage';
import { CustomersView, type CustomerNotice } from './CustomersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CustomerNotice[] = ['suspended', 'denied', 'conflict', 'invalid'];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readNotice(value: string | string[] | undefined): CustomerNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CustomerNotice) : null;
}

/**
 * Customers, for the owner's moderation work.
 *
 * Viewing requires `customer.read`; suspending requires `customer.suspend` and is re-checked server
 * side, calls the existing `suspendCustomer` primitive (which revokes every live session and writes
 * the audited reason), and is only ever an owner decision made on a confirmed finding - never a
 * consequence of a COD decision. Search is a literal match on email or display name.
 *
 * Search, page and page size are applied in SQL and carried in the URL. A hand-typed page beyond the
 * end resolves to the last page; an unknown page size falls back to the default.
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

  const data = await withTransaction(async (tx) => {
    const first = await customers(tx, { search, limit: size, offset: 0 });
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(readPageNumber(single(params.page)), pageCount);
    const result =
      page === 1 ? first : await customers(tx, { search, limit: size, offset: (page - 1) * size });
    return { ...result, page, pageCount };
  });

  return (
    <CustomersView
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      shown={data.rows.length}
      size={size}
      defaultSize={CUSTOMER_PAGE_SIZE}
      rows={data.rows.map((row) => ({
        customerId: row.customerId,
        email: row.email,
        phone: row.phone,
        displayName: row.displayName,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        orderCount: row.orderCount,
        flagged: row.flagged,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      canSuspend={hasPermission(principal, PERMISSIONS.customerSuspend)}
      search={search}
      clearHref={buildQueryHref('/qbpanel/customers', { size: size === CUSTOMER_PAGE_SIZE ? null : size })}
    />
  );
}
