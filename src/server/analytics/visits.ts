/**
 * First-party visit tracking - ADR 0027, owner-approved 2026-11-07.
 *
 * The shop measures its own storefront. There is **no third-party analytics product**, no cross-site
 * identifier, no stored IP address and no fingerprint: a session is a random 128-bit id in a
 * first-party cookie, and the only facts kept are the path, the coarse device class and the step.
 *
 * What the numbers mean, stated once and repeated on the screen:
 *
 * - A **visit** is a browsing session, not a person. One person on two devices is two visits.
 * - **Live now** means a session that made a request in the last five minutes. It is not a socket.
 * - **Cart abandonment** is a session that carried a non-empty cart and never placed an order. It is
 *   not a lost sale: the owner has no way to know why someone left.
 * - Obvious bots are not recorded at all, so the figures are the shop's own readers.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { visitEvent, visitSession } from '@/db/schema';
import type { VISIT_DEVICES, VISIT_EVENT_KINDS } from '@/db/schema';

export type VisitEventKind = (typeof VISIT_EVENT_KINDS)[number];
export type VisitDevice = (typeof VISIT_DEVICES)[number];

/** The first-party cookie that carries the session id. HttpOnly: no script needs to read it. */
export const VISIT_COOKIE = 'qb_visit';
/** A session id is kept for a year; the row itself is pruned by the owner's own retention choice. */
export const VISIT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
/** "Live now" is a five-minute window, stated on the screen rather than implied. */
export const LIVE_WINDOW_MINUTES = 5;
/**
 * How long a visit row is kept.
 *
 * The analytics screen offers 7, 30 and 90 days, so 90 days is the longest window any figure can read.
 * A session is deleted once its last request is older than this, and its events cascade with it, so the
 * counter and the log are always the same age. The owner chose the window on 2026-11-07 (ADR 0027 D7).
 */
export const VISIT_RETENTION_DAYS = 90;

const STORE_TIME_ZONE = 'Asia/Dhaka';

const BOT_PATTERN =
  /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests/i;

/** True when the request is a crawler or a link preview, which is never a reader. */
export function isBotUserAgent(userAgent: string | null): boolean {
  return userAgent !== null && BOT_PATTERN.test(userAgent);
}

/** A coarse device class from the user agent. No model, no OS version, no fingerprint. */
export function deviceFromUserAgent(userAgent: string | null): VisitDevice {
  if (userAgent === null) return 'desktop';
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return 'phone';
  return 'desktop';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cookie value is only a session id if it has the shape one is generated with. */
export function isVisitSessionId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** A path is stored without its query string, so a search term is never written to the database. */
export function normalisePath(raw: string): string {
  const withoutQuery = raw.split('?')[0] ?? '/';
  const trimmed = withoutQuery.length > 200 ? withoutQuery.slice(0, 200) : withoutQuery;
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
}

export type RecordVisitInput = {
  /** The id from the cookie, or null when this is a new session. */
  readonly sessionId: string | null;
  readonly path: string;
  readonly kind: VisitEventKind;
  readonly device: VisitDevice;
  /** True when the request carried a non-empty cart cookie. */
  readonly hasCart: boolean;
};

/**
 * Records one step. Returns the session id to put in the cookie.
 *
 * The session row is the counter and the event row is the log, written in the caller's transaction so
 * a step is either fully recorded or not at all. A repeated page view is not deduplicated: the owner
 * asked for page views, and a reload is a page view.
 */
export async function recordVisit(tx: Transaction, input: RecordVisitInput): Promise<string> {
  const isPageView = input.kind === 'page_view';
  const isOrder = input.kind === 'order_placed';

  const rows = await tx
    .insert(visitSession)
    .values({
      ...(input.sessionId === null ? {} : { id: input.sessionId }),
      device: input.device,
      entryPath: input.path,
      pageViews: isPageView ? 1 : 0,
      hasCart: input.hasCart,
      placedOrder: isOrder,
    })
    .onConflictDoUpdate({
      target: visitSession.id,
      set: {
        lastSeenAt: sql`now()`,
        pageViews: sql`${visitSession.pageViews} + ${isPageView ? 1 : 0}`,
        hasCart: sql`${visitSession.hasCart} or ${input.hasCart}`,
        placedOrder: sql`${visitSession.placedOrder} or ${isOrder}`,
      },
    })
    .returning({ id: visitSession.id });

  const sessionId = rows[0]?.id;
  if (sessionId === undefined) throw new Error('visit session was not written');

  await tx.insert(visitEvent).values({
    sessionId,
    kind: input.kind,
    path: input.path,
  });

  return sessionId;
}

/** Marks the session that placed an order. Called inside the order transaction. */
export async function markOrderPlaced(tx: Transaction, sessionId: string | null): Promise<void> {
  if (sessionId === null) return;
  await tx
    .update(visitSession)
    .set({ placedOrder: true, lastSeenAt: sql`now()` })
    .where(sql`${visitSession.id} = ${sessionId}`);
  await tx.insert(visitEvent).values({ sessionId, kind: 'order_placed', path: '/checkout' });
}

/**
 * Deletes sessions whose last request is older than the retention window.
 *
 * Returns the number of sessions removed. Events cascade from the foreign key, so one statement bounds
 * both tables and a session's counter can never outlive its log. Called after the response from the
 * tracking route (best effort, at most once an hour per instance) and by `npm run visits:prune`.
 */
export async function pruneVisitLog(
  tx: Transaction,
  days: number = VISIT_RETENTION_DAYS,
): Promise<number> {
  const removed = await tx
    .delete(visitSession)
    .where(sql`${visitSession.lastSeenAt} < now() - make_interval(days => ${days})`)
    .returning({ id: visitSession.id });
  return removed.length;
}

export type VisitDayPoint = {
  readonly date: string;
  readonly visits: number;
  readonly pageViews: number;
};

export type VisitFunnelStep = {
  readonly key: 'visits' | 'product' | 'cart' | 'checkout' | 'order';
  readonly sessions: number;
};

export type VisitAnalytics = {
  /** Sessions that started today, on the shop's own calendar. */
  readonly visitsToday: number;
  readonly pageViewsToday: number;
  /** Sessions active in the last five minutes. */
  readonly liveNow: number;
  /** Sessions in the window that carried a cart. */
  readonly cartSessions: number;
  /** Of those, the ones that never placed an order. */
  readonly abandonedCarts: number;
  readonly ordersFromVisits: number;
  readonly series: readonly VisitDayPoint[];
  readonly funnel: readonly VisitFunnelStep[];
  readonly topPaths: readonly { readonly path: string; readonly views: number }[];
};

/**
 * Everything the traffic panel states, in one read.
 *
 * Day buckets are cut in `Asia/Dhaka` in SQL, the same clock the money figures use, because "today"
 * for this shop means Dhaka's today.
 */
export async function loadVisitAnalytics(tx: Transaction, days: number): Promise<VisitAnalytics> {
  const today = (await tx.execute(sql`
    select
      (select count(*)::int from visit_session
        where (first_seen_at at time zone ${STORE_TIME_ZONE})::date
            = (now() at time zone ${STORE_TIME_ZONE})::date) as visits,
      (select count(*)::int from visit_event
        where kind = 'page_view'
          and (occurred_at at time zone ${STORE_TIME_ZONE})::date
            = (now() at time zone ${STORE_TIME_ZONE})::date) as views,
      (select count(*)::int from visit_session
        where last_seen_at > now() - make_interval(mins => ${LIVE_WINDOW_MINUTES})) as live
  `)) as unknown as { rows: { visits: number; views: number; live: number }[] };

  const window = (await tx.execute(sql`
    select
      count(*) filter (where has_cart)::int as cart_sessions,
      count(*) filter (where has_cart and not placed_order)::int as abandoned,
      count(*) filter (where placed_order)::int as ordered
    from visit_session
    where first_seen_at >= now() - make_interval(days => ${days})
  `)) as unknown as { rows: { cart_sessions: number; abandoned: number; ordered: number }[] };

  const series = (await tx.execute(sql`
    with days as (
      select generate_series(
        (date_trunc('day', now() at time zone ${STORE_TIME_ZONE}) - make_interval(days => ${days - 1})),
        date_trunc('day', now() at time zone ${STORE_TIME_ZONE}),
        interval '1 day'
      )::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
           (select count(*)::int from visit_session s
              where (s.first_seen_at at time zone ${STORE_TIME_ZONE})::date = d.day) as visits,
           (select count(*)::int from visit_event e
              where e.kind = 'page_view'
                and (e.occurred_at at time zone ${STORE_TIME_ZONE})::date = d.day) as views
    from days d
    order by d.day
  `)) as unknown as { rows: { day: string; visits: number; views: number }[] };

  const funnel = (await tx.execute(sql`
    select
      count(*)::int as visits,
      count(*) filter (where exists (
        select 1 from visit_event e
        where e.session_id = s.id and e.kind = 'page_view' and e.path like '/products/%'
      ))::int as product,
      count(*) filter (where s.has_cart)::int as cart,
      count(*) filter (where exists (
        select 1 from visit_event e
        where e.session_id = s.id and e.kind = 'checkout_start'
      ))::int as checkout,
      count(*) filter (where s.placed_order)::int as ordered
    from visit_session s
    where s.first_seen_at >= now() - make_interval(days => ${days})
  `)) as unknown as {
    rows: { visits: number; product: number; cart: number; checkout: number; ordered: number }[];
  };

  const paths = (await tx.execute(sql`
    select path, count(*)::int as views
    from visit_event
    where kind = 'page_view' and path is not null
      and occurred_at >= now() - make_interval(days => ${days})
    group by path
    order by views desc, path asc
    limit 6
  `)) as unknown as { rows: { path: string; views: number }[] };

  const todayRow = today.rows[0] ?? { visits: 0, views: 0, live: 0 };
  const windowRow = window.rows[0] ?? { cart_sessions: 0, abandoned: 0, ordered: 0 };
  const funnelRow = funnel.rows[0] ?? { visits: 0, product: 0, cart: 0, checkout: 0, ordered: 0 };

  return {
    visitsToday: Number(todayRow.visits ?? 0),
    pageViewsToday: Number(todayRow.views ?? 0),
    liveNow: Number(todayRow.live ?? 0),
    cartSessions: Number(windowRow.cart_sessions ?? 0),
    abandonedCarts: Number(windowRow.abandoned ?? 0),
    ordersFromVisits: Number(windowRow.ordered ?? 0),
    series: series.rows.map((row) => ({
      date: row.day,
      visits: Number(row.visits ?? 0),
      pageViews: Number(row.views ?? 0),
    })),
    funnel: [
      { key: 'visits', sessions: Number(funnelRow.visits ?? 0) },
      { key: 'product', sessions: Number(funnelRow.product ?? 0) },
      { key: 'cart', sessions: Number(funnelRow.cart ?? 0) },
      { key: 'checkout', sessions: Number(funnelRow.checkout ?? 0) },
      { key: 'order', sessions: Number(funnelRow.ordered ?? 0) },
    ],
    topPaths: paths.rows.map((row) => ({ path: row.path, views: Number(row.views ?? 0) })),
  };
}
