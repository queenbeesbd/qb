import { withTransaction } from '@/db/client';
import { requestNowIso } from '@/lib/clock';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  codDecidedToday,
  codQueue,
  type CodDecidedItem,
  type CodQueueItem,
} from '@/server/orders/admin-read';
import { countCodApprovalQueue } from '@/server/orders/manage';
import { CodView, type CodNotice } from './CodView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CodNotice[] = ['approved', 'rejected', 'denied', 'conflict', 'invalid'];

function readNotice(value: string | string[] | undefined): CodNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as CodNotice) : null;
}

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

/**
 * The COD owner-confirmation queue.
 *
 * Viewing requires `order.read`; approving requires `cod.approve` and rejecting (`order.cancel`) is
 * re-checked server-side per request. A rejected COD order is a cancelled order the owner spoke
 * about - it never touches the customer's account.
 *
 * Two filters, both applied in SQL over the same guarded predicate the decision holds: the waiting
 * worklist (`cod_state = pending_approval` and `status = pending`) and what was decided today. A
 * decided order leaves the waiting list, so it is never shown with disabled actions.
 */
export default async function AdminCodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const search = single(params.q).slice(0, 80);
  const filter = single(params.filter) === 'decided' ? 'decided' : 'waiting';

  const data = await withTransaction(async (tx) => {
    const waitingCount = await countCodApprovalQueue(tx);
    const rows = filter === 'decided' ? await codDecidedToday(tx, { search }) : await codQueue(tx, { search });
    return { waitingCount, rows };
  });

  const rows = data.rows.map((row) => ({
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt.toISOString(),
    itemsSubtotalMinor: row.itemsSubtotalMinor,
    shippingMinor: row.shippingMinor,
    totalMinor: row.totalMinor,
    recipientName: row.recipientName,
    districtCode: row.districtCode,
    recipientPhone: row.recipientPhone,
    area: row.area,
    city: row.city,
    addressLine: row.addressLine,
    items: row.items.map((item) => ({
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
    ...(isDecided(row) ? { decision: row.decision, decidedAt: row.decidedAt.toISOString() } : {}),
  }));

  return (
    <CodView
      nowIso={requestNowIso()}
      rows={rows}
      waitingCount={data.waitingCount}
      filter={filter}
      search={search}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
    />
  );
}

function isDecided(row: CodQueueItem | CodDecidedItem): row is CodDecidedItem {
  return 'decision' in row;
}
