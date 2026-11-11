'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { StatusPill } from '../../_ui/StatusPill';
import styles from '../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type CustomerRow = {
  customerId: number;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: string;
  createdAt: string;
  orderCount: number;
  flagged: boolean;
};

export type CustomerNotice = 'suspended' | 'restored' | 'denied' | 'conflict' | 'invalid';

const NOTICE_KEYS: Record<CustomerNotice, TranslationKey> = {
  suspended: 'admin.customers.notice.suspended',
  restored: 'admin.customers.notice.restored',
  denied: 'admin.customers.notice.denied',
  conflict: 'admin.customers.notice.conflict',
  invalid: 'admin.customers.notice.invalid',
};

/**
 * Customer moderation.
 *
 * Lookup, standing, order count and the two standing actions. Not a CRM, and not a role or permission
 * surface (D10) - there is deliberately nothing else to do here. Banning revokes sessions and restoring
 * lifts that, so both sit behind a confirmation that requires a reason and states the consequence; they
 * are never a table-row text field, and a restore is not the undo of a ban's history - the order that
 * caused the ban stays exactly where it was.
 */
export function CustomersView({
  rows,
  notice,
  csrfToken,
  canSuspend,
  search,
  clearHref,
  total,
  page,
  pageCount,
  shown,
  size,
  defaultSize,
}: {
  rows: readonly CustomerRow[];
  notice: CustomerNotice | null;
  csrfToken: string;
  canSuspend: boolean;
  search: string;
  /** The unfiltered list, so "Clear" resets the search and keeps a non-default page size. */
  clearHref: string;
  total: number;
  page: number;
  pageCount: number;
  shown: number;
  size: number;
  defaultSize: number;
}) {
  const { t } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });

  return (
    <>
      <PageHeader title={t('admin.customers.title')} description={t('admin.customers.body')} />

      {notice !== null && (
        <Notice tone={notice === 'suspended' ? 'success' : 'error'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <ListToolbar>
        <ListSearch
          action="/qbpanel/customers"
          id="customer-search"
          label={t('admin.customers.searchLabel')}
          placeholder={t('admin.customers.searchPlaceholder')}
          value={search}
          hidden={{ size: size === defaultSize ? '' : String(size) }}
          clearHref={clearHref}
          dirty={search !== ''}
        />
      </ListToolbar>

      {rows.length === 0 ? (
        search !== '' ? (
          <EmptyState
            icon="search"
            title={t('admin.customers.searchEmptyTitle')}
            body={t('admin.customers.searchEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={clearHref}>
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.customers.emptyTitle')} body={t('admin.customers.emptyBody')} icon="customers" />
        )
      ) : (
        <>
        <ul className={styles.recordList} data-admin-list="">
          {rows.map((row) => {
            const active = row.status === 'active';
            return (
              <li className={styles.record} key={row.customerId}>
                <span className={styles.recordThumb} aria-hidden="true">
                  {(row.displayName ?? row.phone ?? row.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>
                    {row.displayName ?? row.phone ?? row.email}
                  </span>
                  <span className={styles.recordMeta}>
                    {row.phone !== null && <span>{row.phone}</span>}
                    {row.email !== null && <span>{row.email}</span>}
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
                    <Link className={styles.recordLink} href={`/qbpanel/customers/${row.customerId}`}>
                      {t('admin.customers.view')}
                    </Link>
                    {canSuspend && active && (
                      <ConfirmSubmit
                        action="/api/qbpanel/customers"
                        csrfToken={csrfToken}
                        fields={{ customerId: row.customerId, operation: 'ban' }}
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
                    {canSuspend && !active && (
                      <ConfirmSubmit
                        action="/api/qbpanel/customers"
                        csrfToken={csrfToken}
                        fields={{ customerId: row.customerId, operation: 'restore' }}
                        triggerLabel={t('admin.customers.restore')}
                        triggerVariant="secondary"
                        title={t('admin.customers.restoreTitle')}
                        body={t('admin.customers.restoreBody')}
                        confirmLabel={t('admin.customers.restore')}
                        cancelLabel={t('admin.common.cancel')}
                        pendingLabel={t('admin.common.working')}
                        reason={{
                          label: t('admin.customers.reasonLabel'),
                          placeholder: t('admin.customers.restoreReasonPlaceholder'),
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
          basePath="/qbpanel/customers"
          query={{ q: search, size: size === defaultSize ? '' : String(size) }}
          page={page}
          pageCount={pageCount}
          shown={shown}
          total={total}
          size={size}
          defaultSize={defaultSize}
        />
        </>
      )}
    </>
  );
}
