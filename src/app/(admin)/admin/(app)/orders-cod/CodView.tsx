'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { AdminIcon } from '../../_ui/icons';
import { CodOrderCard, type CodOrderRow } from '../../_ui/CodOrderCard';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import styles from '../../admin.module.css';

export type CodNotice = 'approved' | 'rejected' | 'denied' | 'conflict' | 'invalid';

type Row = CodOrderRow & { decision?: 'approved' | 'rejected'; decidedAt?: string };

const NOTICE_KEYS: Record<CodNotice, TranslationKey> = {
  approved: 'admin.cod.notice.approved',
  rejected: 'admin.cod.notice.rejected',
  denied: 'admin.cod.notice.denied',
  conflict: 'admin.cod.notice.conflict',
  invalid: 'admin.cod.notice.invalid',
};

const ERROR_NOTICES: readonly CodNotice[] = ['denied', 'conflict', 'invalid'];

/**
 * The COD queue: call the customer, then accept or cancel. Nothing is automatic.
 *
 * Search and the two filters are server-side and preserve each other, so a link can be bookmarked
 * and the browser never filters a stale full list. A decided order is listed read-only; it is not
 * shown with dead buttons, because "already decided" is a different screen from "waiting".
 */
export function CodView({
  nowIso,
  rows,
  waitingCount,
  filter,
  search,
  notice,
  csrfToken,
  canApprove,
  canCancel,
}: {
  nowIso: string;
  rows: readonly Row[];
  waitingCount: number;
  filter: 'waiting' | 'decided';
  search: string;
  notice: CodNotice | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const { t } = useTranslation();
  const waitingHref = search === '' ? '/admin/orders-cod' : `/admin/orders-cod?q=${encodeURIComponent(search)}`;
  const decidedHref =
    search === ''
      ? '/admin/orders-cod?filter=decided'
      : `/admin/orders-cod?filter=decided&q=${encodeURIComponent(search)}`;

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.commerce')}
        title={t('admin.cod.title')}
        description={t('admin.cod.body')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <div className={styles.toolbar}>
        <div className={styles.filterTabs} role="group" aria-label={t('admin.cod.filterLabel')}>
          <Link
            href={waitingHref}
            className={filter === 'waiting' ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
            aria-current={filter === 'waiting' ? 'page' : undefined}
          >
            {t('admin.cod.tabWaiting')}
            <span className={styles.filterCount}>{waitingCount}</span>
          </Link>
          <Link
            href={decidedHref}
            className={filter === 'decided' ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
            aria-current={filter === 'decided' ? 'page' : undefined}
          >
            {t('admin.cod.tabDecided')}
          </Link>
        </div>

        <form className={styles.searchForm} action="/admin/orders-cod" method="get" role="search">
          {filter === 'decided' && <input type="hidden" name="filter" value="decided" />}
          <div className={styles.searchField}>
            <AdminIcon name="search" width={16} height={16} />
            <label className="sr-only" htmlFor="cod-search">
              {t('admin.cod.searchLabel')}
            </label>
            <input
              id="cod-search"
              className={styles.input}
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t('admin.cod.searchPlaceholder')}
              maxLength={80}
            />
          </div>
          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
            {t('admin.common.search')}
          </button>
          {search !== '' && (
            <Link className={styles.recordLink} href={filter === 'decided' ? '/admin/orders-cod?filter=decided' : '/admin/orders-cod'}>
              {t('admin.common.clear')}
            </Link>
          )}
        </form>
        <span className={styles.toolbarMeta}>
          {t('admin.cod.resultCount', { count: rows.length })}
        </span>
      </div>

      {rows.length === 0 ? (
        search !== '' ? (
          <EmptyState
            icon="search"
            title={t('admin.cod.searchEmptyTitle')}
            body={t('admin.cod.searchEmptyBody')}
            action={
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href={filter === 'decided' ? '/admin/orders-cod?filter=decided' : '/admin/orders-cod'}
              >
                {t('admin.common.clear')}
              </Link>
            }
          />
        ) : filter === 'decided' ? (
          <EmptyState
            title={t('admin.cod.decidedEmptyTitle')}
            body={t('admin.cod.decidedEmptyBody')}
            action={
              <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/admin/orders-cod">
                {t('admin.cod.tabWaiting')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('admin.cod.emptyTitle')} body={t('admin.cod.emptyBody')} />
        )
      ) : (
        <div className={styles.worklist}>
          {rows.map((row) =>
            row.decision !== undefined && row.decidedAt !== undefined ? (
              <CodOrderCard
                key={row.orderId}
                nowIso={nowIso}
                row={row}
                csrfToken={csrfToken}
                canApprove={canApprove}
                canCancel={canCancel}
                decided={{ decision: row.decision, decidedAt: row.decidedAt }}
              />
            ) : (
              <CodOrderCard
                key={row.orderId}
                nowIso={nowIso}
                row={row}
                csrfToken={csrfToken}
                canApprove={canApprove}
                canCancel={canCancel}
              />
            ),
          )}
        </div>
      )}
    </>
  );
}
