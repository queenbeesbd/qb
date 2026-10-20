import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { customers } from '@/server/orders/admin-read';
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

/** A page number, parsed defensively: anything not a positive integer is page 1. */
function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Customers, for the owner's moderation work.
 *
 * Viewing requires `customer.read`; suspending requires `customer.suspend` and is re-checked server
 * side, calls the existing `suspendCustomer` primitive (which revokes every live session and writes
 * the audited reason), and is only ever an owner decision made on a confirmed finding - never a
 * consequence of a COD decision. Search is a literal match on email or display name.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.customerRead);
  const params = await searchParams;
  const search = single(params.q).slice(0, 80);

  const data = await withTransaction(async (tx) => {
    const first = await customers(tx, { search, limit: CUSTOMER_PAGE_SIZE, offset: 0 });
    const pageCount = Math.max(1, Math.ceil(first.total / CUSTOMER_PAGE_SIZE));
    const page = Math.min(pageNumber(single(params.page)), pageCount);
    const result =
      page === 1
        ? first
        : await customers(tx, { search, limit: CUSTOMER_PAGE_SIZE, offset: (page - 1) * CUSTOMER_PAGE_SIZE });
    return { ...result, page, pageCount };
  });

  return (
    <CustomersView
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      rows={data.rows.map((row) => ({
        customerId: row.customerId,
        email: row.email,
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
    />
  );
}
