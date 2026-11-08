'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { EmptyState } from '../../_ui/EmptyState';
import { PageHeader } from '../../_ui/PageHeader';
import { Pagination } from '../../_ui/Pagination';
import { ScrollableTable } from '../../_ui/ScrollableTable';
import styles from '../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type AuditRow = {
  id: number;
  occurredAt: string;
  actorType: string;
  actorLabel: string;
  actorRoleCodes: string[];
  action: string;
  entityType: string;
  entityId: number;
  reason: string | null;
};

/**
 * The audit trail, read-only.
 *
 * There is no edit or delete control anywhere in this view, because the table cannot accept one: the
 * append-only trigger refuses an `UPDATE` or `DELETE` regardless of the caller's role, and the
 * deployed application role has neither grant. The list shows only what was recorded - no derived
 * summary, no inferred actor.
 *
 * The table is the one list surface that keeps a table: five short columns are faster to scan than
 * five stacked rows. It scrolls inside its own container, so a narrow viewport never widens the
 * document.
 */
export function AuditView({
  rows,
  total,
  page,
  pageCount,
  size,
  defaultSize,
}: {
  rows: readonly AuditRow[];
  total: number;
  page: number;
  pageCount: number;
  size: number;
  defaultSize: number;
}) {
  const { t } = useTranslation();
  const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat(INTL_LOCALE, {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));

  return (
    <>
      <PageHeader title={t('admin.audit.title')} description={t('admin.audit.body')} />

      {rows.length === 0 ? (
        <EmptyState title={t('admin.audit.emptyTitle')} body={t('admin.audit.emptyBody')} icon="audit" />
      ) : (
        <>
          <ScrollableTable label={t('admin.audit.tableLabel')} hint={t('admin.audit.scrollHint')}>
            <table className={styles.table} data-admin-table="">
              <caption className="sr-only">{t('admin.audit.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.audit.when')}</th>
                  <th scope="col">{t('admin.audit.actor')}</th>
                  <th scope="col">{t('admin.audit.action')}</th>
                  <th scope="col">{t('admin.audit.target')}</th>
                  <th scope="col">{t('admin.audit.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.occurredAt)}</td>
                    <td>
                      {row.actorType === 'system' ? t('admin.audit.system') : row.actorLabel}
                      {row.actorRoleCodes.length > 0 ? (
                        <>
                          <br />
                          <span className={styles.note}>{row.actorRoleCodes.join(', ')}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={styles.tag}>{row.action}</span>
                    </td>
                    <td className={styles.mono}>
                      {row.entityType}#{row.entityId}
                    </td>
                    <td>{row.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <Pagination
            basePath="/qbpanel/audit"
            query={{ size: size === defaultSize ? '' : String(size) }}
            page={page}
            pageCount={pageCount}
            shown={rows.length}
            total={total}
            size={size}
            defaultSize={defaultSize}
          />
        </>
      )}
    </>
  );
}
