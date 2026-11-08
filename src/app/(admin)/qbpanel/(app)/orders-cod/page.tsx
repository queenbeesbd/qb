import { withTransaction } from '@/db/client';
import { readPageNumber, readPageSize } from '@/lib/qbpanel-query';
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
} from '@/server/orders/qbpanel-read';
import { countCodApprovalQueue } from '@/server/orders/manage';
import { CodView, type CodNotice } from './CodView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly CodNotice[] = [
  'approved',
  'approvedBooked',
  'approvedBookingFailed',
  'rejected',
  'denied',
  'conflict',
  'invalid',
];

/** Rows per page for the waiting queue. Both tabs page at the same size. */
const WAITING_PAGE_SIZE = DECIDED_PAGE_SIZE;

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
 *
 * **Both tabs page.** The waiting queue used to render every waiting order at once, which was honest
 * while the shop was small and unbounded once it was not; the tab badge still counts the whole
 * worklist, so the owner sees how much is waiting even while looking at one page of it.
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
  const size = readPageSize(single(params.size), filter === 'decided' ? DECIDED_PAGE_SIZE : WAITING_PAGE_SIZE);
  const requestedPage = readPageNumber(single(params.page));

  const data = await withTransaction(async (tx) => {
    // The badge counts the whole waiting worklist, never just the page on screen.
    const waitingCount = await countCodApprovalQueue(tx);
    if (filter === 'decided') {
      // Resolve the page against the real total first, so a hand-typed page beyond the end shows the
      // last page rather than an empty list with no explanation.
      const first = await codDecidedToday(tx, { search, limit: size, offset: 0 });
      const pageCount = Math.max(1, Math.ceil(first.total / size));
      const page = Math.min(requestedPage, pageCount);
      const decided =
        page === 1
          ? first
          : await codDecidedToday(tx, { search, limit: size, offset: (page - 1) * size });
      return { waitingCount, rows: decided.rows, total: decided.total, page, pageCount };
    }

    const matching = await countCodApprovalQueue(tx, search);
    const pageCount = Math.max(1, Math.ceil(matching / size));
    const page = Math.min(requestedPage, pageCount);
    const waiting = await codQueue(tx, { search, limit: size, offset: (page - 1) * size });
    return { waitingCount, rows: waiting, total: matching, page, pageCount };
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
      size={size}
      defaultSize={filter === 'decided' ? DECIDED_PAGE_SIZE : WAITING_PAGE_SIZE}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
    />
  );
}

function isDecided(row: CodQueueItem | CodDecidedItem): row is CodDecidedItem {
  return 'decision' in row;
}
