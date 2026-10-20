import { withTransaction } from '@/db/client';
import { requestNowIso } from '@/lib/clock';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  codDecidedToday,
  codQueue,
  DECIDED_PAGE_SIZE,
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

/** A page number, parsed defensively: anything not a positive integer is page 1. */
function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
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
    if (filter === 'decided') {
      // Resolve the page against the real total first, so a hand-typed page beyond the end shows the
      // last page rather than an empty list with no explanation.
      const first = await codDecidedToday(tx, { search, limit: DECIDED_PAGE_SIZE, offset: 0 });
      const pageCount = Math.max(1, Math.ceil(first.total / DECIDED_PAGE_SIZE));
      const page = Math.min(pageNumber(single(params.page)), pageCount);
      const decided =
        page === 1
          ? first
          : await codDecidedToday(tx, { search, limit: DECIDED_PAGE_SIZE, offset: (page - 1) * DECIDED_PAGE_SIZE });
      return { waitingCount, rows: decided.rows, total: decided.total, page, pageCount };
    }
    const waiting = await codQueue(tx, { search });
    return { waitingCount, rows: waiting, total: waiting.length, page: 1, pageCount: 1 };
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
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
    />
  );
}

function isDecided(row: CodQueueItem | CodDecidedItem): row is CodDecidedItem {
  return 'decision' in row;
}
