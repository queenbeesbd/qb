'use client';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../../admin.module.css';

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
 */
export function AuditView({ rows, total, shown }: { rows: readonly AuditRow[]; total: number; shown: number }) {
  const { t, locale } = useTranslation();
  const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h1>{t('admin.audit.title')}</h1>
        <p>{t('admin.audit.body')}</p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.tableWrap}>
          <p className={styles.empty}>{t('admin.audit.empty')}</p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">{t('admin.audit.title')}</caption>
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
          </div>
          <p className={styles.note}>{t('admin.audit.showing', { shown, total })}</p>
        </>
      )}
    </section>
  );
}
