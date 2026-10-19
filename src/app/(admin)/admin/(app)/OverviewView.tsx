'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from '../_ui/icons';
import { CodOrderCard, type CodOrderRow } from '../_ui/CodOrderCard';
import { EmptyState } from '../_ui/EmptyState';
import { PageHeader } from '../_ui/PageHeader';
import { StatusPill } from '../_ui/StatusPill';
import styles from '../admin.module.css';

type FlagRow = { customerId: number; email: string; displayName: string | null; reason: string };

type CatalogCounts = {
  products: number;
  productsPublished: number;
  productsInStock: number;
  productsOutOfStock: number;
};

/**
 * The operational overview.
 *
 * Hierarchy is deliberate: the queue that waits on a phone call first, then anything blocked or
 * refused, then small entry points. Catalog counts sit at the bottom as reference, not as the
 * headline. No card grid, no fabricated metric.
 */
export function OverviewView({
  nowIso,
  pending,
  pendingCount,
  oldestPlacedAt,
  moreCount,
  flagged,
  denials,
  catalog,
  csrfToken,
  canApprove,
  canCancel,
  canReadOrders,
  canReadCustomers,
  canReadAudit,
  canReadCatalog,
}: {
  nowIso: string;
  pending: readonly CodOrderRow[];
  pendingCount: number;
  oldestPlacedAt: string | null;
  moreCount: number;
  flagged: readonly FlagRow[];
  denials: number | null;
  catalog: CatalogCounts | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  canReadOrders: boolean;
  canReadCustomers: boolean;
  canReadAudit: boolean;
  canReadCatalog: boolean;
}) {
  const { t, locale } = useTranslation();
  const now = new Date(nowIso);
  const dateFormat = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'full' });
  const timeFormat = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const attentionCount = flagged.length + (denials ?? 0);
  const oldestAge =
    oldestPlacedAt === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(oldestPlacedAt).getTime()) / 3_600_000));

  return (
    <>
      <PageHeader
        eyebrow={dateFormat.format(now)}
        title={t('admin.overview.title')}
        description={t('admin.overview.body')}
      />

      {canReadOrders && (
        <section className={styles.section} aria-labelledby="cod-heading">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="cod-heading">{t('admin.overview.worklistTitle')}</h2>
              <p>{t('admin.overview.worklistBody')}</p>
            </div>
            <Link className={styles.sectionLink} href="/admin/orders-cod">
              {t('admin.overview.viewQueue')} →
            </Link>
          </div>

          {pendingCount > 0 && oldestAge !== null ? (
            <div className={styles.statRow}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{pendingCount}</span>
                <span className={styles.statLabel}>{t('admin.overview.waitingOrders')}</span>
              </div>
              <div className={styles.stat}>
                <span className={oldestAge >= 24 ? `${styles.statValue} ${styles.statValueHot}` : styles.statValue}>
                  {oldestAge < 1 ? t('admin.cod.ageLessThanHour') : t('admin.cod.ageHours', { count: oldestAge })}
                </span>
                <span className={styles.statLabel}>{t('admin.overview.oldestWait')}</span>
              </div>
            </div>
          ) : null}

          {pending.length === 0 ? (
            <EmptyState
              title={t('admin.overview.worklistEmptyTitle')}
              body={t('admin.overview.worklistEmptyBody')}
              action={
                canReadCatalog ? (
                  <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/admin/catalog">
                    {t('admin.overview.quickCatalog')}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.worklist}>
              {pending.map((row) => (
                <CodOrderCard
                  key={row.orderId}
                  nowIso={nowIso}
                  row={row}
                  csrfToken={csrfToken}
                  canApprove={canApprove}
                  canCancel={canCancel}
                />
              ))}
              {moreCount > 0 && (
                <p className={styles.note}>
                  {t('admin.overview.moreInQueue', { count: moreCount })}{' '}
                  <Link className={styles.recordLink} href="/admin/orders-cod">
                    {t('admin.overview.viewQueue')}
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {(canReadCustomers || canReadAudit) && (
        <section className={styles.section} aria-labelledby="attention-heading">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="attention-heading">{t('admin.overview.attentionTitle')}</h2>
              <p>{t('admin.overview.attentionBody')}</p>
            </div>
            {attentionCount > 0 && <StatusPill tone="warning">{t('admin.overview.attentionCount', { count: attentionCount })}</StatusPill>}
          </div>

          {attentionCount === 0 ? (
            <div className={styles.notice}>
              <AdminIcon name="check" />
              <span>{t('admin.overview.attentionEmpty')}</span>
            </div>
          ) : (
            <div className={styles.panel}>
              <ul className={styles.dividerList}>
                {denials !== null && denials > 0 && (
                  <li className={styles.dividerItem}>
                    <span className={styles.recordTitle}>
                      {t('admin.overview.refusals', { count: denials })}
                    </span>
                    <span className={styles.recordMeta}>{t('admin.overview.refusalsBody')}</span>
                    {canReadAudit && (
                      <Link className={styles.recordLink} href="/admin/audit">
                        {t('admin.overview.viewAudit')}
                      </Link>
                    )}
                  </li>
                )}
                {flagged.map((flag) => (
                  <li className={styles.dividerItem} key={flag.customerId}>
                    <span className={styles.recordTitle}>
                      {flag.displayName ?? flag.email}{' '}
                      <StatusPill tone="warning">{t('admin.customers.flagged')}</StatusPill>
                    </span>
                    <span className={styles.recordMeta}>{flag.reason}</span>
                    <Link className={styles.recordLink} href={`/admin/customers/${flag.customerId}`}>
                      {t('admin.overview.reviewCustomer')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className={styles.section} aria-labelledby="shortcuts-heading">
        <div className={styles.sectionHead}>
          <h2 id="shortcuts-heading">{t('admin.overview.quickTitle')}</h2>
        </div>
        <div className={styles.recordList}>
          {canReadCatalog && (
            <>
              <Link className={styles.record} href="/admin/catalog">
                <span className={styles.recordThumb} aria-hidden="true">
                  <AdminIcon name="package" />
                </span>
                <span className={styles.recordMain}>
                  <span className={styles.recordTitle}>{t('admin.overview.quickCatalog')}</span>
                  <span className={styles.recordMeta}>{t('admin.overview.quickCatalogBody')}</span>
                </span>
                <span className={styles.recordLink} aria-hidden="true">
                  →
                </span>
              </Link>
              <Link className={styles.record} href="/admin/categories">
                <span className={styles.recordThumb} aria-hidden="true">
                  <AdminIcon name="categories" />
                </span>
                <span className={styles.recordMain}>
                  <span className={styles.recordTitle}>{t('admin.overview.quickCategories')}</span>
                  <span className={styles.recordMeta}>{t('admin.overview.quickCategoriesBody')}</span>
                </span>
                <span className={styles.recordLink} aria-hidden="true">
                  →
                </span>
              </Link>
            </>
          )}
          {canReadCustomers && (
            <Link className={styles.record} href="/admin/customers">
              <span className={styles.recordThumb} aria-hidden="true">
                <AdminIcon name="customers" />
              </span>
              <span className={styles.recordMain}>
                <span className={styles.recordTitle}>{t('admin.overview.quickCustomers')}</span>
                <span className={styles.recordMeta}>{t('admin.overview.quickCustomersBody')}</span>
              </span>
              <span className={styles.recordLink} aria-hidden="true">
                →
              </span>
            </Link>
          )}
          {canReadAudit && (
            <Link className={styles.record} href="/admin/audit">
              <span className={styles.recordThumb} aria-hidden="true">
                <AdminIcon name="audit" />
              </span>
              <span className={styles.recordMain}>
                <span className={styles.recordTitle}>{t('admin.overview.quickAudit')}</span>
                <span className={styles.recordMeta}>{t('admin.overview.quickAuditBody')}</span>
              </span>
              <span className={styles.recordLink} aria-hidden="true">
                →
              </span>
            </Link>
          )}
        </div>
      </section>

      {canReadCatalog && catalog !== null && (
        <section className={styles.section} aria-labelledby="catalog-state-heading">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="catalog-state-heading">{t('admin.overview.catalogTitle')}</h2>
              <p>{t('admin.overview.catalogBody')}</p>
            </div>
            <Link className={styles.sectionLink} href="/admin/catalog">
              {t('admin.overview.quickCatalog')} →
            </Link>
          </div>
          <div className={styles.statRow}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{catalog.productsPublished}</span>
              <span className={styles.statLabel}>{t('admin.overview.catalogPublished')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{catalog.productsInStock}</span>
              <span className={styles.statLabel}>{t('admin.catalog.inStock')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{catalog.productsOutOfStock}</span>
              <span className={styles.statLabel}>{t('admin.catalog.outOfStock')}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{catalog.products}</span>
              <span className={styles.statLabel}>{t('admin.overview.catalogProducts')}</span>
            </div>
          </div>
          <p className={styles.note}>{t('admin.overview.catalogNote', { time: timeFormat.format(now) })}</p>
        </section>
      )}
    </>
  );
}
