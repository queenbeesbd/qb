/**
 * Analytics - everything the shop can substantiate about what it sold.
 *
 * **Derived, never stored.** Every figure here is an aggregate over order, order_item, redemption and
 * cost rows, computed on each read. There is no counter table to fall out of step with the orders, and a
 * repeated or concurrent submission cannot double a number.
 *
 * **Two clocks, both named.** Money facts (revenue, items, customers, discounts, courier costs) are
 * bucketed by `completed_at` - the moment the owner recorded that payment arrived, which is when the
 * money actually exists. Workload (orders placed, and the status mix) is bucketed by `placed_at`, the
 * moment the customer sent it. The interface labels which is which; they are never added together.
 *
 * **The shop's calendar.** Day buckets are Bangladesh days (`Asia/Dhaka`), because "today" for this
 * shop means Dhaka's today. The grouping happens in SQL so a late-evening order lands on the day the
 * owner would call it.
 *
 * **What is absent on purpose.** There is no visits/traffic figure: the storefront ships no analytics
 * tracker and this product collects nothing about browsing. The screen states that gap rather than
 * filling it with a number nobody measured.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderAdditionalCost, orderItem } from '@/db/schema';
import { promoPeriodTotals } from '@/server/promotions/service';

/** The windows the screen offers. Days, counting today. */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export function parsePeriod(value: string | string[] | undefined): AnalyticsPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return (ANALYTICS_PERIODS as readonly number[]).includes(parsed)
    ? (parsed as AnalyticsPeriod)
    : 30;
}

/** The reporting calendar. Not configurable: it is where the shop physically is. */
const STORE_TIME_ZONE = 'Asia/Dhaka';

const REVENUE_BASIS = sql`${order.status} = 'completed' and ${order.codState} = 'cod_collected'`;

export type DailySalesPoint = {
  /** `YYYY-MM-DD` in the shop's own day. */
  readonly date: string;
  readonly revenueMinor: number;
  readonly orders: number;
};

export type StatusSlice = { readonly status: string; readonly count: number };

export type TopProduct = {
  readonly name: string;
  readonly units: number;
  readonly revenueMinor: number;
};

export type AnalyticsSummary = {
  /** Orders the customer placed in the window, whatever became of them. */
  readonly ordersPlaced: number;
  /** Orders completed and paid in the window - the revenue basis. */
  readonly completedOrders: number;
  readonly revenueMinor: number;
  readonly itemsSold: number;
  readonly customersServed: number;
  /** Floor of revenue / completed orders. Null when nothing completed. */
  readonly averageOrderValueMinor: number | null;
  /** The delivery fee inside the revenue figure. Kept by the courier; shown, never subtracted twice. */
  readonly deliveryMinor: number;
  readonly discountMinor: number;
  readonly additionalCostsMinor: number;
  /** Revenue minus the courier's delivery fee minus recorded extra costs. Null when nothing completed. */
  readonly netEstimateMinor: number | null;
};

export type AnalyticsData = {
  readonly period: AnalyticsPeriod;
  readonly summary: AnalyticsSummary;
  readonly series: readonly DailySalesPoint[];
  readonly statuses: readonly StatusSlice[];
  readonly topProducts: readonly TopProduct[];
  readonly promos: { readonly redemptions: number; readonly discountGivenMinor: number; readonly distinctCodes: number };
};

/**
 * One row per day in the window, including days with no sale.
 *
 * The day list is generated in SQL because only the database knows the shop's current day; filling it
 * here would need the local date, and a chart that silently omits empty days misreads as a trend.
 */
export async function loadSalesSeries(
  tx: Transaction,
  days: AnalyticsPeriod,
): Promise<DailySalesPoint[]> {
  const result = (await tx.execute(sql`
    with days as (
      select generate_series(
        (date_trunc('day', now() at time zone ${STORE_TIME_ZONE}) - make_interval(days => ${days - 1})),
        date_trunc('day', now() at time zone ${STORE_TIME_ZONE}),
        interval '1 day'
      )::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
           coalesce(sum(o.total_minor), 0)::bigint as revenue,
           count(o.id)::int as orders
    from days d
    left join "order" o
      on (o.completed_at at time zone ${STORE_TIME_ZONE})::date = d.day
     and o.status = 'completed'
     and o.cod_state = 'cod_collected'
    group by d.day
    order by d.day
  `)) as unknown as { rows: { day: string; revenue: string | number; orders: number }[] };

  const rows = result.rows;
  return rows.map((row) => ({
    date: row.day,
    revenueMinor: Number(row.revenue ?? 0),
    orders: Number(row.orders ?? 0),
  }));
}

export type TodayFigures = {
  /** What was recorded received today, on the same revenue basis as the rest of the screen. */
  readonly revenueMinor: number;
  readonly completedOrders: number;
  /** Orders the customer placed today, whatever became of them. Workload, not money. */
  readonly ordersPlaced: number;
};

/**
 * Today on the shop's own calendar.
 *
 * The overview opens on the day the owner is actually having, while the charts keep the 30-day
 * context. Both clocks are the same ones `loadSummary` uses: money by `completed_at`, workload by
 * `placed_at`, and "today" cut in `Asia/Dhaka` in SQL because that is where the shop is.
 */
export async function loadToday(tx: Transaction): Promise<TodayFigures> {
  const moneyRows = await tx
    .select({
      revenue: sql<number>`coalesce(sum(${order.totalMinor}), 0)::bigint`,
      completed: sql<number>`count(*)::int`,
    })
    .from(order)
    .where(
      sql`${REVENUE_BASIS}
        and (${order.completedAt} at time zone ${STORE_TIME_ZONE})::date
            = (now() at time zone ${STORE_TIME_ZONE})::date`,
    );

  const placedRows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(
      sql`(${order.placedAt} at time zone ${STORE_TIME_ZONE})::date
          = (now() at time zone ${STORE_TIME_ZONE})::date`,
    );

  return {
    revenueMinor: Number(moneyRows[0]?.revenue ?? 0),
    completedOrders: Number(moneyRows[0]?.completed ?? 0),
    ordersPlaced: Number(placedRows[0]?.total ?? 0),
  };
}

/** The period's totals, from the same two clocks the series uses. */
export async function loadSummary(tx: Transaction, days: AnalyticsPeriod): Promise<AnalyticsSummary> {
  const moneyRows = await tx
    .select({
      completedOrders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${order.totalMinor}), 0)::bigint`,
      delivery: sql<number>`coalesce(sum(${order.shippingMinor}), 0)::bigint`,
      discount: sql<number>`coalesce(sum(${order.discountMinor}), 0)::bigint`,
      customers: sql<number>`count(distinct ${order.customerId})::int`,
    })
    .from(order)
    .where(sql`${REVENUE_BASIS} and ${order.completedAt} >= now() - make_interval(days => ${days})`);

  const placedRows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.placedAt} >= now() - make_interval(days => ${days})`);

  const itemRows = await tx
    .select({ units: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int` })
    .from(orderItem)
    .innerJoin(order, sql`${order.id} = ${orderItem.orderId}`)
    .where(sql`${REVENUE_BASIS} and ${order.completedAt} >= now() - make_interval(days => ${days})`);

  const costRows = await tx
    .select({ total: sql<number>`coalesce(sum(${orderAdditionalCost.amountMinor}), 0)::bigint` })
    .from(orderAdditionalCost)
    .innerJoin(order, sql`${order.id} = ${orderAdditionalCost.orderId}`)
    .where(
      sql`${orderAdditionalCost.voidedAt} is null and ${REVENUE_BASIS}
        and ${order.completedAt} >= now() - make_interval(days => ${days})`,
    );

  const money = moneyRows[0];
  const completedOrders = Number(money?.completedOrders ?? 0);
  const revenueMinor = Number(money?.revenue ?? 0);
  const deliveryMinor = Number(money?.delivery ?? 0);
  const additionalCostsMinor = Number(costRows[0]?.total ?? 0);

  return {
    ordersPlaced: Number(placedRows[0]?.total ?? 0),
    completedOrders,
    revenueMinor,
    itemsSold: Number(itemRows[0]?.units ?? 0),
    customersServed: Number(money?.customers ?? 0),
    averageOrderValueMinor: completedOrders === 0 ? null : Math.floor(revenueMinor / completedOrders),
    deliveryMinor,
    discountMinor: Number(money?.discount ?? 0),
    additionalCostsMinor,
    // The gross figure includes the courier's fee, so it is subtracted here and nowhere else.
    netEstimateMinor: completedOrders === 0 ? null : revenueMinor - deliveryMinor - additionalCostsMinor,
  };
}

/** The fulfilment mix, over orders the customer placed in the window. */
export async function loadStatusBreakdown(
  tx: Transaction,
  days: AnalyticsPeriod,
): Promise<StatusSlice[]> {
  const rows = await tx
    .select({ status: order.status, count: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.placedAt} >= now() - make_interval(days => ${days})`)
    .groupBy(order.status)
    .orderBy(sql`count(*) desc`);

  return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
}

/** What actually sold: units and money per product, on the revenue basis. */
export async function loadTopProducts(
  tx: Transaction,
  days: AnalyticsPeriod,
  limit = 6,
): Promise<TopProduct[]> {
  const rows = await tx
    .select({
      name: orderItem.productNameEn,
      units: sql<number>`sum(${orderItem.quantity})::int`,
      revenue: sql<number>`coalesce(sum(${orderItem.lineTotalMinor}), 0)::bigint`,
    })
    .from(orderItem)
    .innerJoin(order, sql`${order.id} = ${orderItem.orderId}`)
    .where(sql`${REVENUE_BASIS} and ${order.completedAt} >= now() - make_interval(days => ${days})`)
    .groupBy(orderItem.productNameEn)
    .orderBy(sql`sum(${orderItem.quantity}) desc, sum(${orderItem.lineTotalMinor}) desc`)
    .limit(limit);

  return rows.map((row) => ({
    name: row.name,
    units: Number(row.units),
    revenueMinor: Number(row.revenue),
  }));
}

/** Everything one analytics screen needs, in one transaction so the figures agree with each other. */
export async function loadAnalytics(
  tx: Transaction,
  period: AnalyticsPeriod,
): Promise<AnalyticsData> {
  const [summary, series, statuses, topProducts, promos] = await Promise.all([
    loadSummary(tx, period),
    loadSalesSeries(tx, period),
    loadStatusBreakdown(tx, period),
    loadTopProducts(tx, period),
    promoPeriodTotals(tx, period),
  ]);

  return { period, summary, series, statuses, topProducts, promos };
}
