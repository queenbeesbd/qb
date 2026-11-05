'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { INTL_LOCALE } from '@/i18n/config';
import { statusLabel } from '@/features/account/order-labels';
import { AreaChart, DonutChart, Sparkline, type ChartTone } from '../_ui/charts';
import { AdminIcon } from '../_ui/icons';
import { CodOrderCard, type CodOrderRow } from '../_ui/CodOrderCard';
import { PageHeader } from '../_ui/PageHeader';
import { StatusPill } from '../_ui/StatusPill';
import styles from '../admin.module.css';

type FlagRow = { customerId: number; email: string; displayName: string | null; reason: string };

type RecentRow = {
  orderId: number;
  orderNumber: string;
  placedAt: string;
  totalMinor: number;
  status: string;
  customerName: string | null;
  customerEmail: string;
};

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

  function dayLabel(iso: string): string {
    const [year = 1970, month = 1, day = 1] = iso.split('-').map((part) => Number.parseInt(part, 10));
    return dayFormat.format(new Date(year, month - 1, day));
  }

  return (
    <>
      <PageHeader
        title={firstName === '' ? t('admin.overview.title') : t('admin.overview.greeting', { name: firstName })}
        actions={
          canReadOrders ? (
            <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin/analytics">
              {t('admin.overview.openAnalytics')}
            </Link>
          ) : undefined
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
                <Link className={styles.queueLink} href="/admin/orders-cod">
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
                  <Link href="/admin/orders-cod">{t('admin.overview.viewQueue')}</Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {analytics !== null && (
        <div className={styles.kpiGrid}>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>{t('admin.overview.kpiRevenue')}</span>
            <span className={styles.kpiValue}>{price(analytics.summary.revenueMinor)}</span>
            <span className={styles.kpiNote}>
              {t('admin.overview.kpiRevenueNote', { count: analytics.summary.completedOrders })}
            </span>
            <Sparkline points={analytics.series.map((point) => point.revenueMinor)} />
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>{t('admin.overview.kpiOrders')}</span>
            <span className={styles.kpiValue}>{analytics.summary.ordersPlaced}</span>
            <span className={styles.kpiNote}>{t('admin.overview.kpiOrdersNote')}</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>{t('admin.overview.kpiItems')}</span>
            <span className={styles.kpiValue}>{analytics.summary.itemsSold}</span>
            <span className={styles.kpiNote}>{t('admin.overview.kpiItemsNote')}</span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>{t('admin.overview.kpiCustomers')}</span>
            <span className={styles.kpiValue}>{analytics.summary.customersServed}</span>
            <span className={styles.kpiNote}>{t('admin.overview.kpiCustomersNote')}</span>
          </div>
          <div className={pendingCount > 0 ? `${styles.kpi} ${styles.kpiHot}` : styles.kpi}>
            <span className={styles.kpiLabel}>{t('admin.overview.kpiWaiting')}</span>
            <span className={styles.kpiValue}>{pendingCount}</span>
            <span className={styles.kpiNote}>
              {pendingCount === 0 ? t('admin.overview.kpiWaitingClear') : oldestAgePhrase}
            </span>
          </div>
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
                <Link className={styles.sectionLink} href="/admin/analytics">
                  {t('admin.overview.chartLink')}
                </Link>
              )}
            </div>
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
                <Link className={styles.sectionLink} href="/admin/orders">
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
                {recent.map((row) => (
                  <li key={row.orderId}>
                    <div className={styles.recentWho}>
                      <span className={styles.recentName}>{row.customerName ?? row.customerEmail}</span>
                      <Link className={`${styles.mono} ${styles.recentRef}`} href={`/admin/orders/${row.orderNumber}`}>
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
                ))}
              </ul>
            )}
          </section>

          {((canReadCatalog && catalog !== null) || (canReadPromo && promo !== null)) && (
            <div className={styles.duoGrid}>
              {canReadCatalog && catalog !== null && (
                <section className={styles.panel} aria-labelledby="catalog-state-heading">
                  <div className={styles.panelHead}>
                    <h2 id="catalog-state-heading" className={styles.panelTitle}>
                      {t('admin.overview.catalogTitle')}
                    </h2>
                    <Link className={styles.sectionLink} href="/admin/catalog">
                      {t('admin.overview.quickCatalog')}
                    </Link>
                  </div>
                  <div className={styles.catalogStats}>
                    <div className={styles.catalogStat}>
                      <span className={styles.catalogValue}>{catalog.productsPublished}</span>
                      <span className={styles.catalogLabel}>{t('admin.overview.catalogPublished')}</span>
                    </div>
                    <div className={styles.catalogStat}>
                      <span className={styles.catalogValue}>{catalog.productsInStock}</span>
                      <span className={styles.catalogLabel}>{t('admin.catalog.inStock')}</span>
                    </div>
                    <div className={styles.catalogStat}>
                      <span className={styles.catalogValue}>{catalog.productsOutOfStock}</span>
                      <span className={styles.catalogLabel}>{t('admin.catalog.outOfStock')}</span>
                    </div>
                  </div>
                  <p className={styles.note}>
                    {t('admin.overview.catalogNote', { time: timeFormat.format(now) })}
                    {' · '}
                    {t('admin.overview.catalogTotal', { count: catalog.products })}
                  </p>
                </section>
              )}

              {canReadPromo && promo !== null && (
                <section className={styles.panel} aria-labelledby="overview-promo">
                  <div className={styles.panelHead}>
                    <h2 id="overview-promo" className={styles.panelTitle}>
                      {t('admin.overview.promoTitle')}
                    </h2>
                    <Link className={styles.sectionLink} href="/admin/promo-codes">
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
          )}
        </div>

        <div className={styles.stack}>
          {canReadOrders && revenue !== null && (
            <section className={styles.panel} aria-labelledby="revenue-heading">
              <div className={styles.panelHead}>
                <h2 id="revenue-heading" className={styles.panelTitle}>
                  {t('admin.overview.revenueTitle')}
                </h2>
                <Link className={styles.sectionLink} href="/admin/orders">
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
              <p className={styles.note}>{t('admin.overview.revenueNote')}</p>
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
                        <Link className={styles.overviewLink} href="/admin/audit">
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
                      <Link className={styles.overviewLink} href={`/admin/customers/${flag.customerId}`}>
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
    </>
  );
}
