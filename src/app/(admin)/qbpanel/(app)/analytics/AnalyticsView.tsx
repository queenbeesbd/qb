'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { statusLabel } from '@/features/account/order-labels';
import { AreaChart, DonutChart, Sparkline, type ChartTone } from '../../_ui/charts';
import { EmptyState } from '../../_ui/EmptyState';
import { MetricCard } from '../../_ui/MetricCard';
import { PageHeader } from '../../_ui/PageHeader';
import styles from '../../qbpanel.module.css';

export type AnalyticsStatusSlice = { status: string; count: number };
export type AnalyticsTopProduct = { name: string; units: number; revenueMinor: number };

export type AnalyticsViewData = {
  period: 7 | 30 | 90;
  summary: {
    revenueMinor: number;
    completedOrders: number;
    ordersPlaced: number;
    itemsSold: number;
    customersServed: number;
    averageOrderValueMinor: number | null;
    discountMinor: number;
    deliveryMinor: number;
    additionalCostsMinor: number;
    netEstimateMinor: number | null;
  };
  series: readonly { date: string; revenueMinor: number; orders: number }[];
  statuses: readonly AnalyticsStatusSlice[];
  topProducts: readonly AnalyticsTopProduct[];
  promos: { redemptions: number; discountGivenMinor: number; distinctCodes: number };
};

/** Axis labels stay short enough to sit beside the plot; the exact amount is in the table and the caption. */
function compactMoney(minor: number): string {
  const taka = Math.round(minor / 100);
  if (taka >= 10_000) return `${Math.round(taka / 1000)}k`;
  if (taka >= 1000) return `${(taka / 1000).toFixed(1)}k`;
  return String(taka);
}

/*
 * Eight states, eight hues.
 *
 * The previous map gave `confirmed`, `processing` and `shipped` the same purple and `delivered` and
 * `completed` the same green, so the ring drew two arcs and its legend repeated its own swatch. A
 * chart whose categories cannot be told apart is not a chart; these are chosen to differ in hue and
 * lightness in sequence (see `--chart-1`..`--chart-8`).
 */
const STATUS_TONES: Record<string, ChartTone> = {
  pending: 'amber',
  confirmed: 'blue',
  processing: 'teal',
  shipped: 'lavender',
  delivered: 'green',
  completed: 'violet',
  cancelled: 'rose',
  returned: 'slate',
};

/**
 * Analytics.
 *
 * The screen answers three questions in order: **what came in**, **what is in the pipeline**, and
 * **what actually sold**. Every figure is derived from the order rows on read, so nothing here can
 * disagree with the order list it came from.
 *
 * **Mobile-first composition (owner direction, 2026-11-21).** A phone opens on the period tabs, the
 * four figures the owner actually watches, and the revenue chart. Everything that is a *reference*
 * rather than a *reading* - the status ring, what sold, promo use, the money split - is a disclosure
 * below them, folded by default, whose summary states the one fact it is opened for. The page is
 * therefore one to two screens instead of four, and no figure was dropped: the disclosures carry every
 * panel the page ever had.
 *
 * **Folded by default is the point.** A summary that already answers the question ("Orders by status
 * · 6 orders") means opening it is optional; a summary that said "Details" would make the fold a hiding
 * place. The rule is the same one `docs/design-system.md` sets for a list filter: the closed summary
 * names what is inside.
 *
 * Two clocks stay apart and labelled: money is bucketed by the day the owner recorded payment
 * (completed), the pipeline by the day the customer placed the order. They are never summed.
 *
 * The traffic questions live on their own screen (`/qbpanel/traffic`, ADR 0033).
 */
export function AnalyticsView({ data }: { data: AnalyticsViewData }) {
  const { t, price } = useTranslation();
  const { summary, series, statuses, topProducts, promos, period } = data;
  const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });
  const countFormat = new Intl.NumberFormat(INTL_LOCALE);
  const orderTotal = statuses.reduce((total, slice) => total + slice.count, 0);
  const peak =
    series.length === 0
      ? undefined
      : series.reduce((best, point) => (point.revenueMinor > best.revenueMinor ? point : best));
  const busiest = topProducts[0]?.units ?? 0;

  function dayLabel(iso: string): string {
    const [year = 1970, month = 1, day = 1] = iso.split('-').map((part) => Number.parseInt(part, 10));
    return dayFormat.format(new Date(year, month - 1, day));
  }

  const periods = [7, 30, 90] as const;

  return (
    <>
      <PageHeader
        title={t('admin.analytics.title')}
        actions={
          <nav
            className={`${styles.filterTabs} ${styles.filterTabsShort}`}
            aria-label={t('admin.analytics.periodLabel')}
          >
            {periods.map((value) => (
              <Link
                key={value}
                href={`/qbpanel/analytics?period=${value}`}
                className={`${styles.filterTab} ${value === period ? styles.filterTabActive : ''}`}
                aria-current={value === period ? 'true' : undefined}
              >
                {t('admin.analytics.lastDays', { count: value })}
              </Link>
            ))}
          </nav>
        }
      />

      {/*
        Four figures, not six (owner direction, 2026-11-21).

        "Items sold" and "Average order" were tiles the owner read once and never acted on; they are
        still stated, as headline figures under the chart, where they belong to the reading rather than
        competing with the money. The four here are the ones the phone is opened for: what came in, how
        many orders, who bought and what was given away.
      */}
      <div className={`${styles.kpiGrid} ${styles.kpiGridFour}`}>
        <MetricCard
          tone="green"
          icon="analytics"
          label={t('admin.analytics.kpiRevenue')}
          value={price(summary.revenueMinor)}
          note={t('admin.analytics.kpiRevenueNote', { count: summary.completedOrders })}
          spark={<Sparkline points={series.map((point) => point.revenueMinor)} tone="green" />}
        />
        <MetricCard
          tone="blue"
          icon="orders"
          label={t('admin.analytics.kpiOrders')}
          value={countFormat.format(summary.ordersPlaced)}
          note={t('admin.analytics.kpiOrdersNote')}
          spark={<Sparkline points={series.map((point) => point.orders)} tone="blue" />}
        />
        <MetricCard
          tone="amber"
          icon="customers"
          label={t('admin.analytics.kpiCustomers')}
          value={countFormat.format(summary.customersServed)}
          note={t('admin.analytics.kpiCustomersNote')}
        />
        <MetricCard
          tone="rose"
          icon="tag"
          label={t('admin.analytics.kpiDiscounts')}
          value={price(summary.discountMinor)}
          note={t('admin.analytics.kpiDiscountsNote', { count: promos.redemptions })}
        />
      </div>

      <section className={styles.panel} aria-labelledby="analytics-revenue">
        <div className={styles.panelHead}>
          <h2 id="analytics-revenue" className={styles.panelTitle}>
            {t('admin.analytics.revenueTitle')}
          </h2>
          {peak !== undefined && peak.revenueMinor > 0 && (
            <span className={styles.statNote}>
              {t('admin.analytics.peakDay', {
                date: dayLabel(peak.date),
                amount: price(peak.revenueMinor),
              })}
            </span>
          )}
        </div>
        {/*
          The two figures that left the tile row. They are readings of this chart, not a second band of
          headline numbers: items sold is the volume under the money, average order is the money per
          order - both of them are the chart's own facts, stated beneath it.
        */}
        <dl className={styles.chartStats}>
          <div>
            <dt>{t('admin.analytics.kpiItems')}</dt>
            <dd>{countFormat.format(summary.itemsSold)}</dd>
          </div>
          <div>
            <dt>{t('admin.analytics.kpiAverage')}</dt>
            <dd>
              {summary.averageOrderValueMinor === null
                ? t('admin.analytics.kpiAverageEmpty')
                : price(summary.averageOrderValueMinor)}
            </dd>
          </div>
          <div>
            <dt>{t('admin.analytics.kpiOrders')}</dt>
            <dd>{countFormat.format(summary.ordersPlaced)}</dd>
          </div>
        </dl>
        <AreaChart
          points={series.map((point) => ({ key: point.date, value: point.revenueMinor }))}
          label={t('admin.analytics.revenueChartLabel')}
          caption={t('admin.analytics.revenueChartCaption')}
          summary={
            summary.completedOrders === 0
              ? t('admin.analytics.revenueEmpty')
              : t('admin.analytics.revenueSummary', {
                  amount: price(summary.revenueMinor),
                  count: summary.completedOrders,
                })
          }
          formatValue={(value) => price(value)}
          formatAxis={compactMoney}
          formatDay={dayLabel}
        />
      </section>

      {/*
        The reference panels, folded (owner direction, 2026-11-21).

        A phone was scrolling 2,244px past five panels to reach nothing: the ring, what sold, promo use
        and the money split are read occasionally and change with the period, so they are disclosures
        whose closed summary states the fact they answer. Nothing is hidden that the owner cannot name
        from the summary, and each one opens in place, without JavaScript and without a route change.
      */}
      <div className={styles.foldSection}>
        <details>
          <summary className={styles.foldSummary}>
            <span className={styles.foldSummaryText}>
              <h2 className={styles.foldSummaryTitle} id="analytics-status">
                {t('admin.analytics.statusTitle')}
              </h2>
              <span className={styles.foldSummaryMeta}>
                {orderTotal === 0
                  ? t('admin.analytics.statusEmpty')
                  : t('admin.analytics.statusSummary', { count: orderTotal })}
              </span>
            </span>
            <span className={styles.foldSummaryChevron} aria-hidden="true">
              <ChevronIcon />
            </span>
          </summary>
          <div className={styles.foldBody} aria-labelledby="analytics-status">
            {orderTotal === 0 ? (
              <p className={styles.hint}>{t('admin.analytics.statusEmpty')}</p>
            ) : (
              <DonutChart
                label={t('admin.analytics.statusTitle')}
                centerLabel={t('admin.analytics.statusCenter')}
                total={orderTotal}
                slices={statuses.map((slice) => ({
                  label: t(statusLabel(slice.status) as TranslationKey),
                  value: slice.count,
                  tone: STATUS_TONES[slice.status] ?? 'slate',
                }))}
              />
            )}
          </div>
        </details>
      </div>

      <div className={styles.foldSection}>
        <details>
          <summary className={styles.foldSummary}>
            <span className={styles.foldSummaryText}>
              <h2 className={styles.foldSummaryTitle} id="analytics-products">
                {t('admin.analytics.productsTitle')}
              </h2>
              <span className={styles.foldSummaryMeta}>
                {topProducts.length === 0
                  ? t('admin.analytics.productsEmptyTitle')
                  : t('admin.analytics.productsSummary', {
                      name: topProducts[0]?.name ?? '',
                      count: busiest,
                    })}
              </span>
            </span>
            <span className={styles.foldSummaryChevron} aria-hidden="true">
              <ChevronIcon />
            </span>
          </summary>
          <div className={styles.foldBody} aria-labelledby="analytics-products">
            {topProducts.length === 0 ? (
              <EmptyState
                title={t('admin.analytics.productsEmptyTitle')}
                body={t('admin.analytics.productsEmptyBody')}
                icon="package"
              />
            ) : (
              /*
                A ranked list, not a table (owner direction, 2026-11-21). The table was 736px wide
                inside a 324px phone panel, so the fold's content arrived as a horizontal scroll -
                three columns of which only two were ever on screen. Rows carry the same three facts:
                rank, name with its volume bar, units and money on the right.
              */
              <ol className={styles.rankList}>
                {topProducts.map((product) => (
                  <li key={product.name} className={styles.rankRow}>
                    <span className={styles.rankNumber} aria-hidden="true">
                      {topProducts.indexOf(product) + 1}
                    </span>
                    <span className={styles.rankCell}>
                      <span className={styles.rankName}>{product.name}</span>
                      <span className={styles.rankTrack} aria-hidden="true">
                        <span
                          className={styles.rankFill}
                          style={{
                            width: `${Math.round((product.units / Math.max(1, busiest)) * 100)}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className={styles.rankMeta}>
                      {t('admin.analytics.soldUnits', {
                        units: product.units,
                        amount: price(product.revenueMinor),
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </div>

      <div className={styles.foldSection}>
        <details>
          <summary className={styles.foldSummary}>
            <span className={styles.foldSummaryText}>
              <h2 className={styles.foldSummaryTitle} id="analytics-money">
                {t('admin.analytics.moneyTitle')}
              </h2>
              <span className={styles.foldSummaryMeta}>
                {summary.netEstimateMinor === null
                  ? t('admin.analytics.unavailable')
                  : t('admin.analytics.moneySummary', {
                      amount: price(summary.netEstimateMinor),
                    })}
              </span>
            </span>
            <span className={styles.foldSummaryChevron} aria-hidden="true">
              <ChevronIcon />
            </span>
          </summary>
          <div className={styles.foldBody} aria-labelledby="analytics-money">
            <dl className={styles.moneyList}>
              <div>
                <dt>{t('admin.analytics.moneyPayment')}</dt>
                <dd>{price(summary.revenueMinor)}</dd>
              </div>
              <div>
                <dt>{t('admin.analytics.moneyDelivery')}</dt>
                <dd>{summary.deliveryMinor > 0 ? `− ${price(summary.deliveryMinor)}` : price(0)}</dd>
              </div>
              <div>
                <dt>{t('admin.analytics.moneyCosts')}</dt>
                <dd>
                  {summary.additionalCostsMinor > 0 ? `− ${price(summary.additionalCostsMinor)}` : price(0)}
                </dd>
              </div>
              <div className={styles.moneyTotal}>
                <dt>{t('admin.analytics.moneyNet')}</dt>
                <dd>
                  {summary.netEstimateMinor === null
                    ? t('admin.analytics.unavailable')
                    : price(summary.netEstimateMinor)}
                </dd>
              </div>
            </dl>
          </div>
        </details>
      </div>

      <div className={styles.foldSection}>
        <details>
          <summary className={styles.foldSummary}>
            <span className={styles.foldSummaryText}>
              <h2 className={styles.foldSummaryTitle} id="analytics-promos">
                {t('admin.analytics.promoTitle')}
              </h2>
              <span className={styles.foldSummaryMeta}>
                {promos.redemptions === 0
                  ? t('admin.analytics.promoNone')
                  : t('admin.analytics.promoSummaryLine', {
                      count: promos.redemptions,
                      amount: price(promos.discountGivenMinor),
                    })}
              </span>
            </span>
            <span className={styles.foldSummaryChevron} aria-hidden="true">
              <ChevronIcon />
            </span>
          </summary>
          <div className={styles.foldBody} aria-labelledby="analytics-promos">
            <dl className={styles.moneyList}>
              <div>
                <dt>{t('admin.analytics.promoRedemptions')}</dt>
                <dd>{promos.redemptions}</dd>
              </div>
              <div>
                <dt>{t('admin.analytics.promoCodes')}</dt>
                <dd>{promos.distinctCodes}</dd>
              </div>
              <div>
                <dt>{t('admin.analytics.promoGiven')}</dt>
                <dd>{price(promos.discountGivenMinor)}</dd>
              </div>
            </dl>
            <Link className={styles.foldAction} href="/qbpanel/promo-codes">
              {t('admin.analytics.promoLink')}
            </Link>
          </div>
        </details>
      </div>
    </>
  );
}

/**
 * The disclosure chevron.
 *
 * Drawn here rather than added to the shared icon set: it marks a state (open / closed, by rotation),
 * not a destination or an action, and the storefront screen's richer summary does not use it. One
 * glyph, one file, so a change to the fold's affordance is a change in one place.
 */
function ChevronIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}