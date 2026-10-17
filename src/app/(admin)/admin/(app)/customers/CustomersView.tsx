'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../admin.module.css';

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
 * Minimal on purpose: identify, show standing, suspend with a reason. Not a CRM, and not a role or
 * permission surface (D10) - there is deliberately nothing else to do here.
 */
export function CustomersView({
  rows,
  notice,
  csrfToken,
  canSuspend,
}: {
  rows: readonly CustomerRow[];
  notice: CustomerNotice | null;
  csrfToken: string;
  canSuspend: boolean;
}) {
  const { t, locale } = useTranslation();

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h1>{t('admin.customers.title')}</h1>
        <p>{t('admin.customers.body')}</p>
      </div>
      {notice !== null && (
        <p role="status" className={notice === 'suspended' ? styles.alertSuccess : styles.alertError}>
          {t(NOTICE_KEYS[notice])}
        </p>
      )}
      {rows.length === 0 ? (
        <p className={styles.empty}>{t('admin.customers.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.customers.customer')}</th>
                <th>{t('admin.customers.status')}</th>
                <th>{t('admin.customers.joined')}</th>
                <th>{t('admin.customers.orderCount')}</th>
                <th>{t('admin.customers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td>
                    {row.displayName ?? '—'}
                    <br />
                    <small className={styles.mono}>{row.email}</small>
                  </td>
                  <td>
                    <span className={row.status === 'suspended' ? styles.tagWarn : styles.tagMuted}>
                      {row.status === 'suspended' ? t('admin.customers.suspended') : t('admin.customers.active')}
                    </span>
                    {row.flagged && <span className={styles.tagWarn}>{t('admin.customers.flagged')}</span>}
                  </td>
                  <td>{new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium' }).format(new Date(row.createdAt))}</td>
                  <td>{row.orderCount}</td>
                  <td>
                    {row.status === 'active' ? (
                      <form className={styles.inlineForm} action="/api/admin/customers" method="post">
                        <input type="hidden" name="csrf" value={csrfToken} />
                        <input type="hidden" name="customerId" value={row.customerId} />
                        <input
                          type="text"
                          name="reason"
                          required
                          minLength={10}
                          maxLength={500}
                          className={styles.tokenValue}
                          style={{ maxWidth: '16rem' }}
                          placeholder={t('admin.customers.reasonPlaceholder')}
                        />
                        <button type="submit" className={styles.buttonSecondary} disabled={!canSuspend}>
                          {t('admin.customers.suspend')}
                        </button>
                      </form>
                    ) : (
                      <span className={styles.hint}>{t('admin.customers.suspendedNote')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}