'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { INTL_LOCALE } from '@/i18n/config';
import { statusLabel } from '@/features/account/order-labels';
import { AreaChart, DonutChart, Sparkline, type ChartTone } from '../_ui/charts';
import { AdminIcon } from '../_ui/icons';
import { CodOrderCard, type CodOrderRow } from '../_ui/CodOrderCard';
import { MetricCard } from '../_ui/MetricCard';
import { PageHeader } from '../_ui/PageHeader';
import { StatusPill } from '../_ui/StatusPill';
import styles from '../qbpanel.module.css';

type FlagRow = { customerId: number; email: string; displayName: string | null; reason: string };

type RecentRow = {
  orderId: number;
  orderNumber: string;
  placedAt: string;
  totalMinor: number;
  status: string;
  customerName: string | null;
  /** Null for a guest order. */
  customerEmail: string | null;
};

type TodayFigures = {
  revenueMinor: number;
  completedOrders: number;
  ordersPlaced: number;
};

type OutOfStockRow = { id: number; nameEn: string; slug: string };

/**
 * The dashboard's money figures, derived from completed orders with recorded payment receipt.
 *
 * Four amounts, never one: what the customer paid, the standard delivery fee inside it, the extra
 * courier costs the owner recorded, and the estimated net proceeds. The gross figure is not revenue,
 * and the net figure is an estimate - the screen says both.
 */
type RevenueTotals = {
  orderCount: number;
  customerPaymentMinor: number;
  standardDeliveryFeeMinor: number;
  additionalCostsMinor: number;
  activeCostCount: number;
  estimatedNetProceedsMinor: number | null;
  netBasisOrderCount: number;
  unsubstantiatedOrderCount: number;
};

type CatalogCounts = {
  products: number;
  productsPublished: number;
  productsInStock: number;
  productsOutOfStock: number;
};

type DashboardAnalytics = {
  summary: {
    revenueMinor: number;
    completedOrders: number;
    ordersPlaced: number;
    itemsSold: number;
    customersServed: number;
  };
  series: readonly { date: string; revenueMinor: number }[];
  statuses: readonly { status: string; count: number }[];
  topProducts: readonly { name: string; units: number; revenueMinor: number }[];
};

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

const PILL_TONES: Record<string, 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  shipped: 'info',
  delivered: 'info',
  completed: 'success',
  cancelled: 'danger',
  returned: 'danger',
};

/** Axis labels: one decimal between 1k and 10k keeps the ticks proportional instead of lumpy. */
function compactMoney(minor: number): string {
  const taka = Math.round(minor / 100);
  if (taka >= 10_000) return `${Math.round(taka / 1000)}k`;
  if (taka >= 1000) return `${(taka / 1000).toFixed(1)}k`;
  return String(taka);
}

/**
 * The operational overview.
 *
 * The page answers "what is happening, and what needs me" in that order - the shop's last thirty days
 * first, because a dashboard that opens on an empty queue tells the owner nothing about the business,
 * then the queue that actually waits on a person.
 *
 * The numbers are the shop's own, derived on every read: revenue is only counted once the owner has
 * recorded payment as received, so a dispatched parcel is never presented as money. The traffic figure
 * a marketplace dashboard would show is absent, because this shop measures nothing about browsing.
 */
export function OverviewView({
  displayName,
  nowIso,
  pending,
  pendingCount,
  oldestPlacedAt,
  moreCount,
  flagged,
  denials,
  catalog,
  revenue,
  analytics,
  today,
  customerTotal,
  outOfStock,
  recent,
  promo,
  csrfToken,
  canApprove,
  canCancel,
  canReadOrders,
  canReadCustomers,
  canReadAudit,
  canReadCatalog,
  canReadPromo,
}: {
  displayName: string;
  nowIso: string;
  pending: readonly CodOrderRow[];
  pendingCount: number;
  oldestPlacedAt: string | null;
  moreCount: number;
  flagged: readonly FlagRow[];
  denials: number | null;
  catalog: CatalogCounts | null;
  revenue: RevenueTotals | null;
  analytics: DashboardAnalytics | null;
  today: TodayFigures | null;
  customerTotal: number | null;
  outOfStock: readonly OutOfStockRow[] | null;
  recent: readonly RecentRow[];
  promo: { active: number; redemptions: number; givenMinor: number } | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  canReadOrders: boolean;
  canReadCustomers: boolean;
  canReadAudit: boolean;
  canReadCatalog: boolean;
  canReadPromo: boolean;
}) {
  const { t, price } = useTranslation();
  const now = new Date(nowIso);
  const timeFormat = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
  const countFormat = new Intl.NumberFormat(INTL_LOCALE);
  const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });

  const attentionCount = flagged.length + (denials ?? 0);
  const oldestAge =
    oldestPlacedAt === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(oldestPlacedAt).getTime()) / 3_600_000));
  /*
   * The same three-step age the order chips use. It printed "12968 hours" in the summary and
   * "540 d" on the row directly beneath it, which is one fact in two units.
   */
  const oldestAgeLabel =
    oldestAge === null
      ? null
      : oldestAge < 1
        ? t('admin.cod.ageLessThanHour')
        : oldestAge < 48
          ? t('admin.cod.ageHours', { count: oldestAge })
          : Math.floor(oldestAge / 24) === 1
            ? t('admin.cod.ageDaysOne', { count: 1 })
            : t('admin.cod.ageDaysLong', { count: Math.floor(oldestAge / 24) });

  // The age label is written for a chip ("Under an hour"); mid-sentence it starts lowercase.
  const oldestAgePhrase =
    oldestAgeLabel === null ? '' : oldestAgeLabel.charAt(0).toLowerCase() + oldestAgeLabel.slice(1);

  const firstName = displayName.trim().split(/\s+/)[0] ?? '';
  const queueSummary =
    pendingCount === 0
      ? t('admin.overview.queueClear')
      : pendingCount === 1
        ? t('admin.overview.queueSummaryOne', { age: oldestAgePhrase })
        : t('admin.overview.queueSummary', { count: pendingCount, age: oldestAgePhrase });

  const orderTotal = (analytics?.statuses ?? []).reduce((total, slice) => total + slice.count, 0);
  const seriesPoints = (analytics?.series ?? []).map((point) => ({ key: point.date, value: point.revenueMinor }));
  const seriesDays = Math.max(1, analytics?.series.length ?? 30);
  const averageDailyMinor = analytics === null ? 0 : Math.round(analytics.summary.revenueMinor / seriesDays);
  /*
   * The peak is a real stored day. When no day has revenue the chart already says so, and the panel's
   * headline states the same fact rather than naming a zero-value day as a "peak".
   */
  const peakPoint =
    analytics === null
      ? null
      : analytics.series.reduce<(typeof analytics.series)[number] | null>(
          (best, point) => (best === null || point.revenueMinor > best.revenueMinor ? point : best),
          null,
        );
  const peakIsReal = peakPoint !== null && peakPoint.revenueMinor > 0;

  const initialsOf = (name: string | null, email: string | null): string => {
    const source = name?.trim() || email?.trim() || '?';
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  };

  function dayLabel(iso: string): string {
    const [year = 1970, month = 1, day = 1] = iso.split('-').map((part) => Number.parseInt(part, 10));
    return dayFormat.format(new Date(year, month - 1, day));
  }

  return (
    <>
      <PageHeader
        title={firstName === '' ? t('admin.overview.title') : t('admin.overview.greeting', { name: firstName })}
        description={t('admin.overview.subtitle')}
        actions={
          <>
            <Link
              className={`${styles.button} ${styles.buttonSecondary}`}
              href="/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <AdminIcon name="storefront" width={16} height={16} />
              {t('admin.overview.viewStorefront')}
            </Link>
            {canReadCatalog && (
              <Link className={styles.button} href="/qbpanel/catalog/new">
                <AdminIcon name="plus" width={16} height={16} />
                {t('admin.overview.quickAddProduct')}
              </Link>
            )}
          </>
        }
      />

      {/*
        The queue is the front door, so it comes first - above the figures. The product rule and the
        CSS comment both said so while the DOM put five KPI tiles and a chart ahead of it, which put
        the calls waiting 1.3 screens down a phone.
      */}
      {canReadOrders && (
        <section className={styles.queuePanel} aria-labelledby="cod-heading">
          <div className={styles.queueHead}>
            <div className={styles.queueIntro}>
              <div className={styles.queueTitleRow}>
                <h2 id="cod-heading" className={styles.queueTitle}>
                  {t('admin.overview.worklistTitle')}
                </h2>
                {pendingCount > 0 && <span className={styles.queueBadge}>{pendingCount}</span>}
                <Link className={styles.queueLink} href="/qbpanel/orders-cod">
                  {t('admin.overview.viewQueue')}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <p className={styles.queueSub}>{queueSummary}</p>
            </div>
          </div>

          {/* An empty queue is a sentence, not a panel: the strip above already says nothing waits,
              and an empty state with another button would compete with the rail for the same click. */}
          {pending.length > 0 && (
            <div className={styles.worklist}>
              {pending.map((row) => (
                <CodOrderCard
                  key={row.orderId}
                  nowIso={nowIso}
                  row={row}
                  csrfToken={csrfToken}
                  canApprove={canApprove}
                  canCancel={canCancel}
                  compact
                />
              ))}
              {moreCount > 0 && (
                <p className={styles.queueMore}>
                  {t('admin.overview.moreInQueue', { count: moreCount })}{' '}
                  <Link href="/qbpanel/orders-cod">{t('admin.overview.viewQueue')}</Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {analytics !== null && (
        <div className={styles.kpiGrid}>
          <MetricCard
            tone="green"
            icon="analytics"
            label={t('admin.overview.kpiRevenueToday')}
            value={price(today?.revenueMinor ?? 0)}
            note={t('admin.overview.kpiRevenueTodayNote', { amount: price(analytics.summary.revenueMinor) })}
            spark={<Sparkline points={analytics.series.map((point) => point.revenueMinor)} tone="green" />}
          />
          <MetricCard
            tone="blue"
            icon="orders"
            label={t('admin.overview.kpiOrdersToday')}
            value={countFormat.format(today?.ordersPlaced ?? 0)}
            note={t('admin.overview.kpiOrdersTodayNote', { count: analytics.summary.ordersPlaced })}
          />
          {catalog !== null && (
            <MetricCard
              tone="violet"
              icon="package"
              label={t('admin.overview.kpiActiveProducts')}
              value={countFormat.format(catalog.productsPublished)}
              note={t('admin.overview.kpiActiveProductsNote', {
                count: catalog.productsInStock,
                out: catalog.productsOutOfStock,
              })}
            />
          )}
          {customerTotal !== null && (
            <MetricCard
              tone="amber"
              icon="customers"
              label={t('admin.overview.kpiTotalCustomers')}
              value={countFormat.format(customerTotal)}
              note={t('admin.overview.kpiTotalCustomersNote', { count: analytics.summary.customersServed })}
            />
          )}
          <MetricCard
            tone={pendingCount > 0 ? 'warning' : 'amber'}
            icon="clock"
            label={t('admin.overview.kpiWaiting')}
            value={countFormat.format(pendingCount)}
            note={pendingCount === 0 ? t('admin.overview.kpiWaitingClear') : oldestAgePhrase}
          />
        </div>
      )}

      {analytics !== null && (
        <div className={styles.chartGrid}>
          <section className={styles.panel} aria-labelledby="overview-revenue">
            <div className={styles.panelHead}>
              <h2 id="overview-revenue" className={styles.panelTitle}>
                {t('admin.overview.chartTitle')}
              </h2>
              {canReadOrders && (
                <Link className={styles.sectionLink} href="/qbpanel/analytics">
                  {t('admin.overview.chartLink')}
                </Link>
              )}
            </div>
            <dl className={styles.chartStats}>
              <div>
                <dt>{t('admin.overview.chartAverage')}</dt>
                <dd>{price(averageDailyMinor)}</dd>
              </div>
              <div>
                <dt>{t('admin.overview.chartPeak')}</dt>
                <dd>
                  {peakIsReal && peakPoint !== null
                    ? `${dayLabel(peakPoint.date)} · ${price(peakPoint.revenueMinor)}`
                    : t('admin.overview.chartNoPeak')}
                </dd>
              </div>
              <div>
                <dt>{t('admin.overview.chartItems')}</dt>
                <dd>{analytics.summary.itemsSold}</dd>
              </div>
            </dl>
            <AreaChart
              points={seriesPoints}
              label={t('admin.analytics.revenueChartLabel')}
              caption={t('admin.analytics.revenueChartCaption')}
              summary={
                analytics.summary.completedOrders === 0
                  ? t('admin.analytics.revenueEmpty')
                  : t('admin.analytics.revenueSummary', {
                      amount: price(analytics.summary.revenueMinor),
                      count: analytics.summary.completedOrders,
                    })
              }
              formatValue={(value) => price(value)}
              formatAxis={compactMoney}
              formatDay={dayLabel}
            />
          </section>

          <section className={styles.panel} aria-labelledby="overview-status">
            <div className={styles.panelHead}>
              <h2 id="overview-status" className={styles.panelTitle}>
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
                slices={(analytics.statuses ?? []).map((slice) => ({
                  label: t(statusLabel(slice.status)),
                  value: slice.count,
                  tone: STATUS_TONES[slice.status] ?? 'slate',
                }))}
              />
            )}
          </section>
        </div>
      )}

      <div className={styles.splitGrid}>
        <div className={styles.stack}>
          <section className={styles.panel} aria-labelledby="overview-recent">
            <div className={styles.panelHead}>
              <h2 id="overview-recent" className={styles.panelTitle}>
                {t('admin.overview.recentTitle')}
              </h2>
              {canReadOrders && (
                <Link className={styles.sectionLink} href="/qbpanel/orders">
                  {t('admin.overview.recentLink')}
                </Link>
              )}
            </div>
            {recent.length === 0 ? (
              <p className={styles.hint}>{t('admin.overview.recentEmpty')}</p>
            ) : (
              // A list, not a table: five columns on a 390px phone shrink every cell to a word
              // fragment. Each row states the same five facts in two lines that fit any width.
              <ul className={styles.recentList}>
                {recent.map((row) => {
                  const customer = row.customerName ?? row.customerEmail;
                  return (
                    <li key={row.orderId} className={styles.recentRow}>
                      <span className={styles.recentAvatar} aria-hidden="true">
                        {initialsOf(row.customerName, row.customerEmail)}
                      </span>
                      <div className={styles.recentWho}>
                        <span className={styles.recentName}>
                          {customer ?? t('admin.overview.guestCustomer')}
                        </span>
                        <Link
                          className={`${styles.mono} ${styles.recentRef}`}
                          href={`/qbpanel/orders/${row.orderNumber}`}
                        >
                          {row.orderNumber}
                        </Link>
                      </div>
                      <div className={styles.recentMeta}>
                        <span className={styles.recentTotal}>{price(row.totalMinor)}</span>
                        <StatusPill tone={PILL_TONES[row.status] ?? 'info'}>
                          {t(statusLabel(row.status))}
                        </StatusPill>
                        <span className={styles.recentWhen}>{timeFormat.format(new Date(row.placedAt))}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {canReadPromo && promo !== null && (
            <section className={styles.panel} aria-labelledby="overview-promo">
              <div className={styles.panelHead}>
                <h2 id="overview-promo" className={styles.panelTitle}>
                  {t('admin.overview.promoTitle')}
                </h2>
                <Link className={styles.sectionLink} href="/qbpanel/promo-codes">
                  {t('admin.overview.promoLink')}
                </Link>
              </div>
              <dl className={styles.moneyList}>
                <div>
                  <dt>{t('admin.overview.promoActive')}</dt>
                  <dd>{promo.active}</dd>
                </div>
                <div>
                  <dt>{t('admin.overview.promoUses')}</dt>
                  <dd>{promo.redemptions}</dd>
                </div>
                <div>
                  <dt>{t('admin.overview.promoGiven')}</dt>
                  <dd>{price(promo.givenMinor)}</dd>
                </div>
              </dl>
              {promo.active === 0 && <p className={styles.note}>{t('admin.overview.promoNone')}</p>}
            </section>
          )}
        </div>

        <div className={styles.stack}>
          {canReadOrders && revenue !== null && (
            <section className={styles.panel} aria-labelledby="revenue-heading">
              <div className={styles.panelHead}>
                <h2 id="revenue-heading" className={styles.panelTitle}>
                  {t('admin.overview.revenueTitle')}
                </h2>
                <Link className={styles.sectionLink} href="/qbpanel/orders">
                  {t('admin.overview.revenueLink')}
                </Link>
              </div>
              <div className={styles.revenueLead}>
                <span className={styles.revenueLabel}>{t('admin.overview.revenueCustomerPayment')}</span>
                <span className={styles.revenueAmount}>{price(revenue.customerPaymentMinor)}</span>
                <span className={styles.revenueMeta}>
                  {t('admin.overview.revenueFromOrders', { count: revenue.orderCount })}
                </span>
              </div>
              <dl className={styles.revenueBreakdown}>
                <div>
                  <dt>{t('admin.overview.revenueStandardFee')}</dt>
                  <dd>{price(revenue.standardDeliveryFeeMinor)}</dd>
                </div>
                <div>
                  <dt>{t('admin.overview.revenueAdditionalCosts', { count: revenue.activeCostCount })}</dt>
                  <dd>{price(revenue.additionalCostsMinor)}</dd>
                </div>
                <div>
                  <dt>{t('admin.overview.revenueNetEstimate')}</dt>
                  <dd>
                    {revenue.estimatedNetProceedsMinor === null
                      ? t('admin.overview.revenueUnavailable')
                      : price(revenue.estimatedNetProceedsMinor)}
                  </dd>
                </div>
              </dl>
              {revenue.unsubstantiatedOrderCount > 0 && (
                <p className={styles.note}>
                  {t('admin.overview.revenueUnsubstantiated', { count: revenue.unsubstantiatedOrderCount })}
                </p>
              )}
            </section>
          )}

          {(canReadCustomers || canReadAudit) && (
            <section className={styles.panel} aria-labelledby="attention-heading">
              <div className={styles.panelHead}>
                <h2 id="attention-heading" className={styles.panelTitle}>
                  {t('admin.overview.attentionTitle')}
                </h2>
                {attentionCount > 0 && (
                  <StatusPill tone="warning">
                    {t('admin.overview.attentionCount', { count: attentionCount })}
                  </StatusPill>
                )}
              </div>

              {attentionCount === 0 ? (
                <p className={styles.attentionClear}>
                  <AdminIcon name="check" className={styles.attentionClearIcon} />
                  <span>{t('admin.overview.attentionEmpty')}</span>
                </p>
              ) : (
                <ul className={styles.attentionList}>
                  {denials !== null && denials > 0 && (
                    <li className={styles.attentionRow}>
                      <span className={styles.attentionName}>
                        {t('admin.overview.refusals', { count: denials })}
                      </span>
                      <span className={styles.attentionReason}>{t('admin.overview.refusalsBody')}</span>
                      {canReadAudit && (
                        <Link className={styles.overviewLink} href="/qbpanel/audit">
                          {t('admin.overview.viewAudit')} <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </li>
                  )}
                  {flagged.map((flag) => (
                    <li className={styles.attentionRow} key={flag.customerId}>
                      <span className={styles.attentionName}>
                        {flag.displayName ?? flag.email}{' '}
                        <StatusPill tone="warning">{t('admin.customers.flagged')}</StatusPill>
                      </span>
                      <span className={styles.attentionReason}>{flag.reason}</span>
                      <Link className={styles.overviewLink} href={`/qbpanel/customers/${flag.customerId}`}>
                        {t('admin.overview.reviewCustomer')} <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      <div className={styles.tripleGrid}>
        {canReadCatalog && outOfStock !== null && (
          <section className={styles.panel} aria-labelledby="overview-out-of-stock">
            <div className={styles.panelHead}>
              <h2 id="overview-out-of-stock" className={styles.panelTitle}>
                {t('admin.overview.outOfStockTitle')}
              </h2>
              <Link className={styles.sectionLink} href="/qbpanel/catalog?stock=out_of_stock">
                {t('admin.overview.outOfStockLink')}
              </Link>
            </div>
            {outOfStock.length === 0 ? (
              <p className={styles.hint}>{t('admin.overview.outOfStockEmpty')}</p>
            ) : (
              <ol className={styles.rankList}>
                {outOfStock.map((row, index) => (
                  <li key={row.id} className={styles.rankRow}>
                    <span className={styles.rankNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <Link className={styles.rankName} href={`/qbpanel/catalog/${row.id}`}>
                      {row.nameEn}
                    </Link>
                    <span className={styles.rankMeta}>{t('admin.catalog.outOfStock')}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className={styles.note}>{t('admin.overview.outOfStockBody')}</p>
          </section>
        )}

        {canReadOrders && analytics !== null && (
          <section className={styles.panel} aria-labelledby="overview-top-selling">
            <div className={styles.panelHead}>
              <h2 id="overview-top-selling" className={styles.panelTitle}>
                {t('admin.overview.topSellingTitle')}
              </h2>
              <Link className={styles.sectionLink} href="/qbpanel/analytics">
                {t('admin.overview.topSellingLink')}
              </Link>
            </div>
            {analytics.topProducts.length === 0 ? (
              <p className={styles.hint}>{t('admin.overview.topSellingEmpty')}</p>
            ) : (
              <ol className={styles.rankList}>
                {analytics.topProducts.slice(0, 5).map((product, index) => (
                  <li key={product.name} className={styles.rankRow}>
                    <span className={styles.rankNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className={styles.rankName}>{product.name}</span>
                    <span className={styles.rankMeta}>
                      {t('admin.overview.topSellingUnits', { count: product.units })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className={styles.note}>{t('admin.overview.topSellingBody')}</p>
          </section>
        )}

        <section className={styles.panel} aria-labelledby="overview-quick-actions">
          <div className={styles.panelHead}>
            <h2 id="overview-quick-actions" className={styles.panelTitle}>
              {t('admin.overview.quickActionsTitle')}
            </h2>
          </div>
          <div className={styles.quickGrid}>
            {canReadCatalog && (
              <Link className={styles.quickAction} href="/qbpanel/catalog/new">
                <span className={styles.quickIcon} data-tone="violet" aria-hidden="true">
                  <AdminIcon name="plus" width={18} height={18} />
                </span>
                {t('admin.overview.quickAddProduct')}
              </Link>
            )}
            {canReadOrders && (
              <Link className={styles.quickAction} href="/qbpanel/orders-cod">
                <span className={styles.quickIcon} data-tone="blue" aria-hidden="true">
                  <AdminIcon name="orders" width={18} height={18} />
                </span>
                {t('admin.overview.quickCod')}
              </Link>
            )}
            {canReadCatalog && (
              <Link className={styles.quickAction} href="/qbpanel/categories">
                <span className={styles.quickIcon} data-tone="amber" aria-hidden="true">
                  <AdminIcon name="categories" width={18} height={18} />
                </span>
                {t('admin.overview.quickCategories')}
              </Link>
            )}
            {canReadPromo && (
              <Link className={styles.quickAction} href="/qbpanel/promo-codes">
                <span className={styles.quickIcon} data-tone="rose" aria-hidden="true">
                  <AdminIcon name="tag" width={18} height={18} />
                </span>
                {t('admin.overview.quickPromo')}
              </Link>
            )}
            {canReadPromo && (
              <Link className={styles.quickAction} href="/qbpanel/settings/delivery">
                <span className={styles.quickIcon} data-tone="teal" aria-hidden="true">
                  <AdminIcon name="settings" width={18} height={18} />
                </span>
                {t('admin.overview.quickDelivery')}
              </Link>
            )}
            {canReadOrders && (
              <Link className={styles.quickAction} href="/qbpanel/analytics">
                <span className={styles.quickIcon} data-tone="green" aria-hidden="true">
                  <AdminIcon name="analytics" width={18} height={18} />
                </span>
                {t('admin.overview.quickAnalytics')}
              </Link>
            )}
          </div>
          <p className={styles.note}>{t('admin.overview.quickActionsBody')}</p>
        </section>
      </div>
    </>
  );
}
