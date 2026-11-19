import { withTransaction } from '@/db/client';
import {
  buildQueryHref,
  dateRangeBounds,
  readDateInput,
  readPageNumber,
  readPageSize,
} from '@/lib/qbpanel-query';
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
import { listOrdersForAdmin, ORDER_PAGE_SIZE, ORDER_STATUS_FILTERS } from '@/server/orders/qbpanel-order';
import { AdminOrdersView, type OrdersFilter, type OrdersNotice, type OrdersView } from './OrdersView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly OrdersNotice[] = [
  'approved',
  'approvedBooked',
  'approvedBookingFailed',
  'rejected',
  'denied',
  'conflict',
  'invalid',
];

function single(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? '';
}

function readFilter(value: string): OrdersFilter {
  return (ORDER_STATUS_FILTERS as readonly string[]).includes(value) ? (value as OrdersFilter) : 'all';
}

/** The view discriminator. An unrecognised or absent value is the full history, never a worklist. */
function readView(value: string): OrdersView {
  return value === 'waiting' || value === 'decided' ? value : 'all';
}

function readNotice(value: string | string[] | undefined): OrdersNotice | null {
  const candidate = single(value);
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as OrdersNotice) : null;
}

function isDecided(row: CodQueueItem | CodDecidedItem): row is CodDecidedItem {
  return 'decision' in row;
}

/**
 * The owner's order history and the COD worklist, on one screen.
 *
 * Requires `order.read`; approving requires `cod.approve` and rejecting (`order.cancel`) is re-checked
 * server-side per request. The screen has three views carried in the URL:
 *
 * - `view=all` (default) - the record of everything taken, read through `listOrdersForAdmin`, with the
 *   lifecycle status filter and the date range. This was `/qbpanel/orders`.
 * - `view=waiting` - the COD confirmation worklist: orders with `cod_state = pending_approval` and
 *   `status = pending`, read through `codQueue` and decided inline with the same guarded route. The tab
 *   badge counts the whole worklist, not the page on screen.
 * - `view=decided` - what was approved or rejected today, read through `codDecidedToday`.
 *
 * The worklist used to live at `/qbpanel/orders-cod`. It is the same guarded readers and the same
 * decision endpoint underneath; the two surfaces were merged so the owner does not maintain two lists
 * that can disagree, and the retired route now 404s rather than rendering an alias.
 *
 * Search, the status filter, the date range and pagination are all applied in SQL (never in the
 * browser) and all carried in the URL, so a filtered page is linkable and the back button works. The
 * list is paginated with an exact total, so it can never silently truncate. In the worklist views the
 * status filter and date range do not apply - a waiting order is waiting - but their values are carried
 * on the view links so returning to `All` keeps the history the owner was reading.
 *
 * Invalid parameters are clamped rather than refused: a hand-typed `?page=9999` shows the last page,
 * an unknown status falls back to "all", an impossible date (`2026-02-31`) is ignored, and an unknown
 * `view` shows the history. A bad URL must never produce an error screen on a list an owner reaches by
 * editing the address bar.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;
  const search = single(params.q).slice(0, 80);
  const view = readView(single(params.view));
  const filter = readFilter(single(params.filter));
  const from = readDateInput(single(params.from));
  const to = readDateInput(single(params.to));
  const dateRange = dateRangeBounds(from, to);
  const defaultSize = view === 'all' ? ORDER_PAGE_SIZE : DECIDED_PAGE_SIZE;
  const size = readPageSize(single(params.size), defaultSize);
  const requestedPage = readPageNumber(single(params.page));

  const data = await withTransaction(async (tx) => {
    // The badge counts the whole waiting worklist, never just the page on screen.
    const waitingCount = await countCodApprovalQueue(tx);

    if (view === 'decided') {
      // Resolve the page against the real total first, so a hand-typed page beyond the end shows the
      // last page rather than an empty list with no explanation.
      const first = await codDecidedToday(tx, { search, limit: size, offset: 0 });
      const pageCount = Math.max(1, Math.ceil(first.total / size));
      const page = Math.min(requestedPage, pageCount);
      const decided =
        page === 1 ? first : await codDecidedToday(tx, { search, limit: size, offset: (page - 1) * size });
      return {
        waitingCount,
        history: [],
        cod: decided.rows,
        total: decided.total,
        page,
        pageCount,
      };
    }

    if (view === 'waiting') {
      const matching = await countCodApprovalQueue(tx, search);
      const pageCount = Math.max(1, Math.ceil(matching / size));
      const page = Math.min(requestedPage, pageCount);
      const waiting = await codQueue(tx, { search, limit: size, offset: (page - 1) * size });
      return { waitingCount, history: [], cod: waiting, total: matching, page, pageCount };
    }

    const first = await listOrdersForAdmin(tx, {
      search,
      status: filter,
      dateRange,
      limit: size,
      offset: 0,
    });
    const pageCount = Math.max(1, Math.ceil(first.total / size));
    const page = Math.min(requestedPage, pageCount);
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
    return { waitingCount, history: result.rows, cod: [], total: result.total, page, pageCount };
  });

  // The filter state without the page number: every link that changes what is shown starts at page 1.
  const baseQuery = {
    view: view === 'all' ? '' : view,
    q: search,
    filter: filter === 'all' ? '' : filter,
    from,
    to,
    size: size === defaultSize ? '' : String(size),
  };

  return (
    <AdminOrdersView
      view={view}
      historyRows={data.history.map((row) => ({
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
        firstItemImageKey: row.firstItemImageKey,
        firstItemName: row.firstItemName,
      }))}
      codRows={data.cod.map((row) => ({
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
          imageKey: item.imageKey,
        })),
        ...(isDecided(row) ? { decision: row.decision, decidedAt: row.decidedAt.toISOString() } : {}),
      }))}
      waitingCount={data.waitingCount}
      search={search}
      filter={filter}
      from={from}
      to={to}
      notice={readNotice(params.notice)}
      baseQuery={baseQuery}
      clearHref={buildQueryHref('/qbpanel/orders', {
        view: view === 'all' ? '' : view,
        size: size === defaultSize ? '' : size,
      })}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      shown={view === 'all' ? data.history.length : data.cod.length}
      size={size}
      defaultSize={defaultSize}
      nowIso={requestNowIso()}
      csrfToken={principal.csrfToken}
      canApprove={hasPermission(principal, PERMISSIONS.codApprove)}
      canCancel={hasPermission(principal, PERMISSIONS.orderCancel)}
    />
  );
}
