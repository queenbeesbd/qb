'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { AreaChart } from '../../_ui/charts';
import { PageHeader } from '../../_ui/PageHeader';
import shell from '../../qbpanel.module.css';
import styles from './traffic.module.css';

/**
 * The traffic screen.
 *
 * Presentation follows the dealt app style (accent ladder): colour on the data, not on the chrome - a
 * pale tint for the live figure and the one chart, ink everywhere else. The figures are type, not
 * tiles: no icons, no sparklines, no coloured circles. Every number names what it counts, because the
 * three that are easiest to misread are stated in the interface rather than assumed:
 *
 * - a **visit** is a browsing session, not a person (one person on two devices is two visits);
 * - **live now** is a request in the last five minutes, not a socket;
 * - a **cart left behind** is a session that carried a cart and never ordered, never a lost sale.
 */

export type TrafficDivisionSlice = { division: string | null; sessions: number };

export type TrafficVisitData = {
  visitsToday: number;
  pageViewsToday: number;
  liveNow: number;
  cartSessions: number;
  abandonedCarts: number;
  ordersFromVisits: number;
  totals: { allTime: number; today: number; last7: number; last30: number };
  series: readonly { date: string; visits: number; pageViews: number }[];
  funnel: readonly {
    key: 'visits' | 'product' | 'cart' | 'checkout' | 'order';
    sessions: number;
  }[];
  topPaths: readonly { path: string; views: number }[];
  divisions: readonly TrafficDivisionSlice[];
  devices: readonly { device: string; sessions: number }[];
};

const FUNNEL_KEYS: Record<TrafficVisitData['funnel'][number]['key'], TranslationKey> = {
  visits: 'admin.traffic.funnelVisits',
  product: 'admin.traffic.funnelProduct',
  cart: 'admin.traffic.funnelCart',
  checkout: 'admin.traffic.funnelCheckout',
  order: 'admin.traffic.funnelOrder',
};

/**
 * The eight divisions and the honest two remainder values.
 *
 * The order is the country's own (as they are listed officially), so a reader can scan down and find
 * their own; the table sorts by size, which is the question the owner actually asks of it.
 */
const DIVISION_KEYS: Record<string, TranslationKey> = {
  dhaka: 'admin.traffic.division.dhaka',
  chattogram: 'admin.traffic.division.chattogram',
  khulna: 'admin.traffic.division.khulna',
  rajshahi: 'admin.traffic.division.rajshahi',
  sylhet: 'admin.traffic.division.sylhet',
  barishal: 'admin.traffic.division.barishal',
  rangpur: 'admin.traffic.division.rangpur',
  mymensingh: 'admin.traffic.division.mymensingh',
  outside_bd: 'admin.traffic.division.outside',
};

const DEVICE_KEYS: Record<string, TranslationKey> = {
  phone: 'admin.traffic.devicePhone',
  tablet: 'admin.traffic.deviceTablet',
  desktop: 'admin.traffic.deviceDesktop',
};

/** One figure: a small label, a large tabular value, one line of what it counts. */
function Figure({
  label,
  value,
  note,
  live = false,
}: {
  label: string;
  value: string;
  note?: string;
  live?: boolean;
}) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>
        {live && <span className={styles.liveDot} aria-hidden="true" />}
        {label}
      </span>
      <span className={styles.figureValue}>{value}</span>
      {note !== undefined && <span className={styles.figureNote}>{note}</span>}
    </div>
  );
}

/** A share row: the bar is the row's share of the largest, the figures sit on the row's baseline. */
function ShareRow({
  label,
  share,
  detail,
  largest,
}: {
  label: string;
  share: number;
  detail?: string;
  largest: number;
}) {
  const width = largest === 0 ? 0 : Math.max(Math.round((share / largest) * 100), share === 0 ? 0 : 2);
  return (
    <li className={styles.shareRow}>
      <span className={styles.shareTrack} aria-hidden="true">
        <span className={styles.shareFill} style={{ width: width + '%' }} />
      </span>
      <span className={styles.shareLabel}>{label}</span>
      <span className={styles.shareValue}>{detail ?? String(share)}</span>
    </li>
  );
}

export function TrafficView({ period, visits }: { period: 7 | 30 | 90; visits: TrafficVisitData }) {
  const { t } = useTranslation();
  const count = new Intl.NumberFormat(INTL_LOCALE);
  const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });

  const periods = [7, 30, 90] as const;
  const windowSessions = visits.divisions.reduce((total, slice) => total + slice.sessions, 0);
  const placed = visits.divisions.filter((slice) => slice.division !== null);
  const unknown = visits.divisions.find((slice) => slice.division === null)?.sessions ?? 0;
  const largestDivision = placed.reduce((best, slice) => Math.max(best, slice.sessions), 0);
  const largestDevice = visits.devices.reduce((best, slice) => Math.max(best, slice.sessions), 0);
  const largestPage = visits.topPaths.reduce((best, page) => Math.max(best, page.views), 0);

  function dayLabel(iso: string): string {
    const [year = 1970, month = 1, day = 1] = iso.split('-').map((part) => Number.parseInt(part, 10));
    return dayFormat.format(new Date(year, month - 1, day));
  }

  return (
    <>
      <PageHeader
        title={t('admin.traffic.title')}
        description={t('admin.traffic.lede')}
        actions={
          <nav className={shell.filterTabs} aria-label={t('admin.traffic.periodLabel')}>
            {periods.map((value) => (
              <Link
                key={value}
                href={`/qbpanel/traffic?period=${value}`}
                className={`${shell.filterTab} ${value === period ? shell.filterTabActive : ''}`}
                aria-current={value === period ? 'true' : undefined}
              >
                {t('admin.analytics.lastDays', { count: value })}
              </Link>
            ))}
          </nav>
        }
      />

      {/*
        Six figures on one pitch: live, today, 7 days, 30 days, all time, carts left behind.
        "All time" is the retained log, so its note says so rather than implying a lifetime count.
      */}
      <section className={styles.figures} aria-label={t('admin.traffic.figuresLabel')}>
        {/* The only hue in the figures: a dot that appears when somebody is actually reading. */}
        <Figure
          label={t('admin.traffic.live')}
          value={count.format(visits.liveNow)}
          note={t('admin.traffic.liveNote')}
          live={visits.liveNow > 0}
        />
        <Figure label={t('admin.traffic.today')} value={count.format(visits.totals.today)} note={t('admin.traffic.sessionsNote')} />
        <Figure label={t('admin.traffic.last7')} value={count.format(visits.totals.last7)} note={t('admin.traffic.sessionsNote')} />
        <Figure label={t('admin.traffic.last30')} value={count.format(visits.totals.last30)} note={t('admin.traffic.sessionsNote')} />
        <Figure label={t('admin.traffic.allTime')} value={count.format(visits.totals.allTime)} note={t('admin.traffic.allTimeNote')} />
        <Figure
          label={t('admin.traffic.leftCarts')}
          value={count.format(visits.abandonedCarts)}
          note={t('admin.traffic.leftCartsNote')}
        />
      </section>

      <section className={shell.panel} aria-labelledby="traffic-series">
        <div className={shell.panelHead}>
          <div>
            <h2 id="traffic-series" className={shell.panelTitle}>
              {t('admin.traffic.chartTitle')}
            </h2>
            <span className={shell.statNote}>{t('admin.traffic.chartNote')}</span>
          </div>
          <span className={shell.statNote}>{t('admin.traffic.pageViewsToday', { count: visits.pageViewsToday })}</span>
        </div>
        <AreaChart
          points={visits.series.map((point) => ({ key: point.date, value: point.visits }))}
          label={t('admin.traffic.chartLabel')}
          caption={t('admin.traffic.chartCaption')}
          summary={
            visits.series.every((point) => point.visits === 0)
              ? t('admin.traffic.chartEmpty')
              : t('admin.traffic.chartSummary', {
                  visits: visits.series.reduce((total, point) => total + point.visits, 0),
                })
          }
          formatValue={(value) => count.format(value)}
          formatAxis={(value) => (value >= 1000 ? String(Math.round(value / 100) / 10) + 'k' : String(value))}
          formatDay={dayLabel}
        />
      </section>

      <div className={styles.split}>
        <section className={shell.panel} aria-labelledby="traffic-areas">
          <div className={shell.panelHead}>
            <div>
              <h2 id="traffic-areas" className={shell.panelTitle}>
                {t('admin.traffic.areasTitle')}
              </h2>
              <span className={shell.statNote}>{t('admin.traffic.areasNote')}</span>
            </div>
          </div>
          {windowSessions === 0 ? (
            <p className={shell.hint}>{t('admin.traffic.areasEmpty')}</p>
          ) : (
            <>
              <ul className={styles.shareList}>
                {placed.map((slice) => (
                  <ShareRow
                    key={slice.division}
                    label={t(DIVISION_KEYS[slice.division ?? 'outside_bd'] ?? 'admin.traffic.division.outside')}
                    share={slice.sessions}
                    detail={count.format(slice.sessions)}
                    largest={largestDivision}
                  />
                ))}
              </ul>
              {/* The remainder is not a place: it is what the platform could not place. */}
              {unknown > 0 && (
                <p className={shell.note}>{t('admin.traffic.areasUnknown', { count: unknown })}</p>
              )}
            </>
          )}
        </section>

        <section className={shell.panel} aria-labelledby="traffic-devices">
          <div className={shell.panelHead}>
            <div>
              <h2 id="traffic-devices" className={shell.panelTitle}>
                {t('admin.traffic.devicesTitle')}
              </h2>
              <span className={shell.statNote}>{t('admin.traffic.devicesNote')}</span>
            </div>
          </div>
          {visits.devices.length === 0 ? (
            <p className={shell.hint}>{t('admin.traffic.devicesEmpty')}</p>
          ) : (
            <ul className={styles.shareList}>
              {visits.devices.map((slice) => (
                <ShareRow
                  key={slice.device}
                  label={t(DEVICE_KEYS[slice.device] ?? 'admin.traffic.deviceDesktop')}
                  share={slice.sessions}
                  detail={count.format(slice.sessions)}
                  largest={largestDevice}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={shell.panel} aria-labelledby="traffic-funnel">
          <div className={shell.panelHead}>
            <div>
              <h2 id="traffic-funnel" className={shell.panelTitle}>
                {t('admin.traffic.funnelTitle')}
              </h2>
              <span className={shell.statNote}>{t('admin.traffic.funnelNote')}</span>
            </div>
          </div>
          {visits.funnel[0]?.sessions === 0 ? (
            <p className={shell.hint}>{t('admin.traffic.funnelEmpty')}</p>
          ) : (
            <ol className={styles.funnelList}>
              {visits.funnel.map((step) => {
                const start = visits.funnel[0]?.sessions ?? 0;
                const share = start === 0 ? 0 : Math.round((step.sessions / start) * 100);
                return (
                  <li key={step.key} className={styles.funnelRow}>
                    <span className={styles.funnelLabel}>{t(FUNNEL_KEYS[step.key])}</span>
                    <span className={styles.funnelTrack} aria-hidden="true">
                      <span
                        className={styles.funnelFill}
                        style={{ width: (step.sessions === 0 ? 0 : Math.max(share, 2)) + '%' }}
                      />
                    </span>
                    <span className={styles.funnelValue}>{count.format(step.sessions)}</span>
                    <span className={styles.funnelShare}>{share}%</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className={shell.panel} aria-labelledby="traffic-pages">
          <div className={shell.panelHead}>
            <div>
              <h2 id="traffic-pages" className={shell.panelTitle}>
                {t('admin.traffic.pagesTitle')}
              </h2>
              <span className={shell.statNote}>{t('admin.traffic.pagesNote')}</span>
            </div>
          </div>
          {visits.topPaths.length === 0 ? (
            <p className={shell.hint}>{t('admin.traffic.pagesEmpty')}</p>
          ) : (
            <ul className={styles.shareList}>
              {visits.topPaths.map((page) => (
                <ShareRow
                  key={page.path}
                  label={page.path}
                  share={page.views}
                  detail={count.format(page.views)}
                  largest={largestPage}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className={shell.note}>{t('admin.traffic.footer')}</p>
    </>
  );
}
