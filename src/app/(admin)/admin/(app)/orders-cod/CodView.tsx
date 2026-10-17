'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../admin.module.css';

export type CodRow = {
  orderId: number;
  orderNumber: string;
  placedAt: string;
  totalMinor: number;
  recipientName: string;
  recipientPhone: string;
  area: string;
  city: string;
  addressLine: string;
};

export type CodNotice = 'approved' | 'rejected' | 'denied' | 'conflict' | 'invalid';

const NOTICE_KEYS: Record<CodNotice, TranslationKey> = {
  approved: 'admin.cod.notice.approved',
  rejected: 'admin.cod.notice.rejected',
  denied: 'admin.cod.notice.denied',
  conflict: 'admin.cod.notice.conflict',
  invalid: 'admin.cod.notice.invalid',
};

/** The COD owner-confirmation queue: call the customer, then accept or reject. Nothing is automatic. */
export function CodView({
  rows,
  notice,
  csrfToken,
  canApprove,
  canCancel,
}: {
  rows: readonly CodRow[];
  notice: CodNotice | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const { t, price, locale } = useTranslation();

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h1>{t('admin.cod.title')}</h1>
        <p>{t('admin.cod.body')}</p>
      </div>
      {notice !== null && (
        <p role="status" className={notice === 'approved' ? styles.alertSuccess : styles.alertError}>
          {t(NOTICE_KEYS[notice])}
        </p>
      )}
      {rows.length === 0 ? (
        <p className={styles.empty}>{t('admin.cod.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.cod.order')}</th>
                <th>{t('admin.cod.placed')}</th>
                <th>{t('admin.cod.total')}</th>
                <th>{t('admin.cod.contact')}</th>
                <th>{t('admin.cod.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderId}>
                  <td className={styles.mono}>{row.orderNumber}</td>
                  <td>{new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.placedAt))}</td>
                  <td>{price(row.totalMinor)}</td>
                  <td>
                    {row.recipientName}
                    <br />
                    <small className={styles.mono}>{row.recipientPhone}</small>
                    <br />
                    <small>
                      {row.addressLine}, {row.area}, {row.city}
                    </small>
                  </td>
                  <td>
                    <div className={styles.inlineForm}>
                      <form action="/api/admin/orders-cod" method="post">
                        <input type="hidden" name="csrf" value={csrfToken} />
                        <input type="hidden" name="orderId" value={row.orderId} />
                        <input type="hidden" name="decision" value="approve" />
                        <input type="text" name="reason" required minLength={10} maxLength={500} className={styles.tokenValue} style={{ maxWidth: '14rem' }} placeholder={t('admin.cod.approveReason')} />
                        <button type="submit" className={styles.button} disabled={!canApprove}>
                          {t('admin.cod.approve')}
                        </button>
                      </form>
                      <form action="/api/admin/orders-cod" method="post">
                        <input type="hidden" name="csrf" value={csrfToken} />
                        <input type="hidden" name="orderId" value={row.orderId} />
                        <input type="hidden" name="decision" value="reject" />
                        <input type="text" name="reason" required minLength={10} maxLength={500} className={styles.tokenValue} style={{ maxWidth: '14rem' }} placeholder={t('admin.cod.rejectReason')} />
                        <button type="submit" className={styles.buttonSecondary} disabled={!canCancel}>
                          {t('admin.cod.reject')}
                        </button>
                      </form>
                    </div>
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