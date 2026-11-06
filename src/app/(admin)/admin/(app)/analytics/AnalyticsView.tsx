'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { statusLabel } from '@/features/account/order-labels';
import { AreaChart, DonutChart, Sparkline, type ChartTone } from '../../_ui/charts';
import { EmptyState } from '../../_ui/EmptyState';
import { PageHeader } from '../../_ui/PageHeader';
import styles from '../../admin.module.css';

export type AnalyticsStatusSlice = { status: string; count: number };
export type AnalyticsTopProduct = { name: string; units: number; revenueMinor: number };

export type AnalyticsViewData = {
  period: 7 | 30 | 90;
  summary: {
    ordersPlaced: number;
    completedOrders: number;
    revenueMinor: number;
    itemsSold: number;
    customersServed: number;
    averageOrderValueMinor: number | null;
    deliveryMinor: number;
    discountMinor: number;
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
 * The screen answers three questions in order: what came in, what is in the pipeline, and what actually
 * sold. Every figure is derived from the order rows on read, so nothing here can disagree with the
 * order list it came from.
 *
 * Two clocks are kept visually apart and labelled: money is bucketed by the day the owner recorded
 * payment (completed), the pipeline by the day the customer placed the order. They are never summed,
 * because "orders placed" and "orders paid" are different facts about different moments.
 *
 * The traffic gap is stated, not filled. This product runs no analytics tracker, so a visits figure
 * would be invented; the note says so and stops.
 */
export function AnalyticsView({ data }: { data: AnalyticsViewData }) {
  const { t, price } = useTranslation();
  const { summary, series, statuses, topProducts, promos, period } = data;
  const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });
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
          <nav className={styles.filterTabs} aria-label={t('admin.analytics.periodLabel')}>
            {periods.map((value) => (
              <Link
                key={value}
                href={`/admin/analytics?period=${value}`}
                className={`${styles.filterTab} ${value === period ? styles.filterTabActive : ''}`}
                aria-current={value === period ? 'true' : undefined}
              >
                {t('admin.analytics.lastDays', { count: value })}
              </Link>
            ))}
          </nav>
        }
      />

      <div className={styles.kpiGrid}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiRevenue')}</span>
          <span className={styles.kpiValue}>{price(summary.revenueMinor)}</span>
          <span className={styles.kpiNote}>
            {t('admin.analytics.kpiRevenueNote', { count: summary.completedOrders })}
          </span>
          <Sparkline points={series.map((point) => point.revenueMinor)} />
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiOrders')}</span>
          <span className={styles.kpiValue}>{summary.ordersPlaced}</span>
          <span className={styles.kpiNote}>{t('admin.analytics.kpiOrdersNote')}</span>
          <Sparkline points={series.map((point) => point.orders)} tone="blue" />
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiItems')}</span>
          <span className={styles.kpiValue}>{summary.itemsSold}</span>
          <span className={styles.kpiNote}>{t('admin.analytics.kpiItemsNote')}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiCustomers')}</span>
          <span className={styles.kpiValue}>{summary.customersServed}</span>
          <span className={styles.kpiNote}>{t('admin.analytics.kpiCustomersNote')}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiAverage')}</span>
          <span className={styles.kpiValue}>
            {summary.averageOrderValueMinor === null ? '—' : price(summary.averageOrderValueMinor)}
          </span>
          <span className={styles.kpiNote}>
            {summary.averageOrderValueMinor === null
              ? t('admin.analytics.kpiAverageEmpty')
              : t('admin.analytics.kpiAverageNote')}
          </span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('admin.analytics.kpiDiscounts')}</span>
          <span className={styles.kpiValue}>{price(summary.discountMinor)}</span>
          <span className={styles.kpiNote}>
            {t('admin.analytics.kpiDiscountsNote', { count: promos.redemptions })}
          </span>
        </div>
      </div>

      <div className={styles.chartGrid}>
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

        <section className={styles.panel} aria-labelledby="analytics-status">
          <div className={styles.panelHead}>
            <h2 id="analytics-status" className={styles.panelTitle}>
              {t('admin.analytics.statusTitle')}
            </h2>
          </div>
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
        </section>
      </div>

      <div className={styles.splitGrid}>
        <div className={styles.stack}>
        <section className={styles.panel} aria-labelledby="analytics-products">
          <div className={styles.panelHead}>
            <h2 id="analytics-products" className={styles.panelTitle}>
              {t('admin.analytics.productsTitle')}
            </h2>
            <span className={styles.statNote}>{t('admin.analytics.productsNote')}</span>
          </div>
          {topProducts.length === 0 ? (
            <EmptyState
              title={t('admin.analytics.productsEmptyTitle')}
              body={t('admin.analytics.productsEmptyBody')}
              icon="package"
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">{t('admin.analytics.productsCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.analytics.columnProduct')}</th>
                    <th scope="col">{t('admin.analytics.columnUnits')}</th>
                    <th scope="col">{t('admin.analytics.columnRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product) => (
                    <tr key={product.name}>
                      <td>
                        <span className={styles.rankCell}>
                          <span>{product.name}</span>
                          {/* A bar with one row compares the product to itself: it reads as an underline,
                              so it is only drawn when there is something to rank against. */}
                          {topProducts.length > 1 && (
                            <span className={styles.rankTrack} aria-hidden="true">
                              <span
                                className={styles.rankFill}
                                style={{ width: `${Math.round((product.units / Math.max(1, busiest)) * 100)}%` }}
                              />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={styles.mono}>{product.units}</td>
                      <td className={styles.mono}>{price(product.revenueMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

          <section className={styles.panel} aria-labelledby="analytics-promos">
            <div className={styles.panelHead}>
              <h2 id="analytics-promos" className={styles.panelTitle}>
                {t('admin.analytics.promoTitle')}
              </h2>
              <Link className={styles.sectionLink} href="/admin/promo-codes">
                {t('admin.analytics.promoLink')}
              </Link>
            </div>
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
            {promos.redemptions === 0 && (
              <p className={styles.note}>{t('admin.analytics.promoNone')}</p>
            )}
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="analytics-money">
            <div className={styles.panelHead}>
              <h2 id="analytics-money" className={styles.panelTitle}>
                {t('admin.analytics.moneyTitle')}
              </h2>
            </div>
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
          </section>
        </div>

      </div>

            <p className={styles.note}>{t('admin.analytics.trafficGap')}</p>
    </>
  );
}
