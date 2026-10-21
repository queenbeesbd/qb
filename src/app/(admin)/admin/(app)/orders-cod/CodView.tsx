'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { buildQueryHref } from '@/lib/admin-query';
import { CodOrderCard, type CodOrderRow } from '../../_ui/CodOrderCard';
import { EmptyState } from '../../_ui/EmptyState';
import { FilterTabs, ListSearch, ListToolbar } from '../../_ui/ListToolbar';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
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
  total,
  page,
  pageCount,
  size,
  defaultSize,
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
  /** Total matching the current filter and search, so the page can state what it is not showing. */
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const { t } = useTranslation();
  const sizeParam = size === defaultSize ? '' : String(size);
  const waitingHref = buildQueryHref('/admin/orders-cod', { q: search, size: sizeParam });
  const decidedHref = buildQueryHref('/admin/orders-cod', { filter: 'decided', q: search, size: sizeParam });

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

      <ListToolbar>
        <FilterTabs
          label={t('admin.cod.filterLabel')}
          active={filter}
          options={[
            {
              value: 'waiting',
              label: t('admin.cod.tabWaiting'),
              href: waitingHref,
              count: waitingCount,
            },
            { value: 'decided', label: t('admin.cod.tabDecided'), href: decidedHref },
          ]}
        />

        <ListSearch
          action="/admin/orders-cod"
          id="cod-search"
          label={t('admin.cod.searchLabel')}
          placeholder={t('admin.cod.searchPlaceholder')}
          value={search}
          hidden={{
            filter: filter === 'decided' ? 'decided' : '',
            size: sizeParam,
          }}
          clearHref={filter === 'decided' ? buildQueryHref('/admin/orders-cod', { filter: 'decided', size: sizeParam }) : waitingHref}
          dirty={search !== ''}
        />
      </ListToolbar>

      {rows.length === 0 ? (
        search !== '' ? (
          <EmptyState
            icon="search"
            title={t('admin.cod.searchEmptyTitle')}
            body={t('admin.cod.searchEmptyBody')}
            action={
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href={filter === 'decided' ? buildQueryHref('/admin/orders-cod', { filter: 'decided', size: sizeParam }) : waitingHref}
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

      {rows.length > 0 && (
        <Pagination
          basePath="/admin/orders-cod"
          query={{ q: search, filter: filter === 'decided' ? 'decided' : '', size: sizeParam }}
          page={page}
          pageCount={pageCount}
          shown={rows.length}
          total={total}
          size={size}
          defaultSize={defaultSize}
        />
      )}
    </>
  );
}
