'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { AdminIcon } from '../../_ui/icons';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill } from '../../_ui/StatusPill';
import styles from '../../admin.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type CustomerRow = {
  customerId: number;
  email: string;
  displayName: string | null;
  status: string;
  createdAt: string;
  orderCount: number;
  flagged: boolean;
};

export type CustomerNotice = 'suspended' | 'denied' | 'conflict' | 'invalid';

const NOTICE_KEYS: Record<CustomerNotice, TranslationKey> = {
  suspended: 'admin.customers.notice.suspended',
  denied: 'admin.customers.notice.denied',
  conflict: 'admin.customers.notice.conflict',
  invalid: 'admin.customers.notice.invalid',
};

/**
 * Customer moderation.
 *
 * Lookup, standing, order count and one destructive action. Not a CRM, and not a role or permission
 * surface (D10) - there is deliberately nothing else to do here. Suspension is an irreversible owner
 * decision that revokes sessions, so it sits behind a confirmation that requires a reason and states
 * the consequence; it is never a table-row text field.
 */
export function CustomersView({
  rows,
  notice,
  csrfToken,
  canSuspend,
  search,
  total,
  page,
  pageCount,
}: {
  rows: readonly CustomerRow[];
  notice: CustomerNotice | null;
  csrfToken: string;
  canSuspend: boolean;
  search: string;
  total: number;
  page: number;
  pageCount: number;
}) {
  const { t } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });

  return (
    <>
      <PageHeader eyebrow={t('admin.nav.group.customers')} title={t('admin.customers.title')} description={t('admin.customers.body')} />

      {notice !== null && (
        <Notice tone={notice === 'suspended' ? 'success' : 'error'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <div className={styles.toolbar}>
        <form className={styles.searchForm} action="/admin/customers" method="get" role="search">
          <div className={styles.searchField}>
            <AdminIcon name="search" width={16} height={16} />
            <label className="sr-only" htmlFor="customer-search">
              {t('admin.customers.searchLabel')}
            </label>
            <input
              id="customer-search"
              className={styles.input}
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t('admin.customers.searchPlaceholder')}
              maxLength={80}
            />
          </div>
          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
            {t('admin.common.search')}
          </button>
          {search !== '' && (
            <Link className={styles.recordLink} href="/admin/customers">
              {t('admin.common.clear')}
            </Link>
          )}
        </form>
        <span className={styles.toolbarMeta}>{t('admin.customers.resultCount', { count: total })}</span>
      </div>

      {rows.length === 0 ? (
        search !== '' ? (
          <EmptyState
            icon="search"
            title={t('admin.customers.searchEmptyTitle')}
            body={t('admin.customers.searchEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/admin/customers">
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.customers.emptyTitle')} body={t('admin.customers.emptyBody')} icon="customers" />
        )
      ) : (
        <>
        <ul className={styles.recordList}>
          {rows.map((row) => {
            const active = row.status === 'active';
            return (
              <li className={styles.record} key={row.customerId}>
                <span className={styles.recordThumb} aria-hidden="true">
                  {(row.displayName ?? row.email).slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{row.displayName ?? row.email}</span>
                  <span className={styles.recordMeta}>
                    <span>{row.email}</span>
                    <span>{t('admin.customers.joinedValue', { date: dateFormat.format(new Date(row.createdAt)) })}</span>
                    <span>{t('admin.customers.ordersValue', { count: row.orderCount })}</span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <StatusPill tone={active ? 'success' : 'danger'}>
                    {active ? t('admin.customers.active') : t('admin.customers.suspended')}
                  </StatusPill>
                  {row.flagged && <StatusPill tone="warning">{t('admin.customers.flagged')}</StatusPill>}
                  <div className={styles.recordActions}>
                    <Link className={styles.recordLink} href={`/admin/customers/${row.customerId}`}>
                      {t('admin.customers.view')}
                    </Link>
                    {active && canSuspend && (
                      <ConfirmSubmit
                        action="/api/admin/customers"
                        csrfToken={csrfToken}
                        fields={{ customerId: row.customerId }}
                        triggerLabel={t('admin.customers.suspend')}
                        title={t('admin.customers.suspendTitle')}
                        body={t('admin.customers.suspendBody')}
                        confirmLabel={t('admin.customers.suspend')}
                        cancelLabel={t('admin.common.cancel')}
                        pendingLabel={t('admin.common.working')}
                        reason={{
                          label: t('admin.customers.reasonLabel'),
                          placeholder: t('admin.customers.reasonPlaceholder'),
                          minLength: 10,
                          maxLength: 500,
                          required: true,
                        }}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination
          basePath="/admin/customers"
          query={{ q: search }}
          page={page}
          pageCount={pageCount}
          shown={rows.length}
          total={total}
        />
        </>
      )}
    </>
  );
}
