import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { customers } from '@/server/orders/admin-read';
import { CustomersView, type CustomerNotice } from './CustomersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CustomerNotice[] = ['suspended', 'denied', 'conflict', 'invalid'];

function readNotice(value: string | string[] | undefined): CustomerNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CustomerNotice) : null;
}

/**
 * Customers, for the owner's moderation work.
 *
 * Viewing requires `customer.read`; suspending requires `customer.suspend` and is re-checked server
 * side, calls the existing `suspendCustomer` primitive (which revokes every live session and writes
 * the audited reason), and is only ever an owner decision made on a confirmed finding - never a
 * consequence of a rejected claim or an amount mismatch.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.customerRead);
  const params = await searchParams;

  const rows = await withTransaction((tx) => customers(tx));

  return (
    <CustomersView
      rows={rows.map((row) => ({
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
    />
  );
}