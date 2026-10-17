import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { codQueue } from '@/server/orders/admin-read';
import { CodView, type CodNotice } from './CodView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CodNotice[] = ['approved', 'rejected', 'denied', 'conflict', 'invalid'];

function readNotice(value: string | string[] | undefined): CodNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CodNotice) : null;
}

/**
 * The COD owner-confirmation queue.
 *
 * Viewing requires `order.read`; approving requires `cod.approve` and rejecting (`order.cancel`)
 * is re-checked server-side per request. A rejected COD order is a cancelled order the owner spoke
 * about - it never touches the customer's account.
 */
export default async function AdminCodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;

  const rows = await withTransaction((tx) => codQueue(tx));

  return (
    <CodView
      rows={rows.map((row) => ({
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        placedAt: row.placedAt.toISOString(),
        totalMinor: row.totalMinor,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        area: row.area,
        city: row.city,
        addressLine: row.addressLine,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
    />
  );
}