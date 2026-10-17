'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../admin.module.css';

export type PaymentQueue = {
  claimId: number;
  orderNumber: string;
  submittedAt: string;
  method: string;
  recipientNumber: string;
  recipientLabel: string;
  senderMsisdn: string;
  transactionReference: string;
  claimedAmountMinor: number;
  orderTotalMinor: number;
  recipientName: string;
  recipientPhone: string;
  area: string;
  city: string;
  addressLine: string;
  held: boolean;
  duplicateReference: boolean;
};

export type PaymentNotice =
  | 'verified'
  | 'rejected'
  | 'falselyClaimed'
  | 'held'
  | 'holdReleased'
  | 'denied'
  | 'conflict'
  | 'invalid';

const NOTICE_KEYS: Record<PaymentNotice, TranslationKey> = {
  verified: 'admin.payments.notice.verified',
  rejected: 'admin.payments.notice.rejected',
  falselyClaimed: 'admin.payments.notice.falselyClaimed',
  held: 'admin.payments.notice.held',
  holdReleased: 'admin.payments.notice.holdReleased',
  denied: 'admin.payments.notice.denied',
  conflict: 'admin.payments.notice.conflict',
  invalid: 'admin.payments.notice.invalid',
};

/** The prepaid verification queue. Every control posts to a route that re-checks the permission. */
export function PaymentsView({
  rows,
  notice,
  csrfToken,
  canVerify,
  canReject,
  canFlagFalse,
}: {
  rows: readonly PaymentQueue[];
  notice: PaymentNotice | null;
  csrfToken: string;
  canVerify: boolean;
  canReject: boolean;
  canFlagFalse: boolean;
}) {
  const { t, price, locale } = useTranslation();
  const errorNotice = notice !== null && ['denied', 'conflict', 'invalid'].includes(notice);

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.payments.title')}</h1>
          <p>{t('admin.payments.body')}</p>
        </div>
        {notice !== null && (
          <p className={errorNotice ? styles.alertError : styles.alertSuccess} role="status">
            {t(NOTICE_KEYS[notice])}
          </p>
        )}
        {rows.length === 0 ? (
          <p className={styles.empty}>{t('admin.payments.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin.payments.order')}</th>
                  <th>{t('admin.payments.submitted')}</th>
                  <th>{t('admin.payments.method')}</th>
                  <th>{t('admin.payments.recipient')}</th>
                  <th>{t('admin.payments.sender')}</th>
                  <th>{t('admin.payments.reference')}</th>
                  <th>{t('admin.payments.claimedAmount')}</th>
                  <th>{t('admin.payments.orderTotal')}</th>
                  <th>{t('admin.payments.delivery')}</th>
                  <th>{t('admin.payments.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.claimId}>
                    <td>
                      <span className={styles.mono}>{row.orderNumber}</span>
                      {row.held && (
                        <span className={`${styles.tag} ${styles.tagWarn}`}>{t('admin.payments.held')}</span>
                      )}
                    </td>
                    <td>{new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.submittedAt))}</td>
                    <td>{t(row.method === 'bkash' ? 'orders.method.bkash' : 'orders.method.nagad')}</td>
                    <td>
                      <span className={styles.mono}>{row.recipientNumber}</span>
                      <br />
                      <small>{row.recipientLabel}</small>
                    </td>
                    <td className={styles.mono}>{row.senderMsisdn}</td>
                    <td className={styles.mono}>
                      {row.transactionReference}
                      {row.duplicateReference && (
                        <span className={`${styles.tag} ${styles.tagWarn}`}>{t('admin.payments.duplicateReference')}</span>
                      )}
                    </td>
                    <td>{price(row.claimedAmountMinor)}</td>
                    <td>
                      {price(row.orderTotalMinor)}
                      {row.claimedAmountMinor !== row.orderTotalMinor && (
                        <span className={`${styles.tag} ${styles.tagWarn}`}>{t('admin.payments.mismatch')}</span>
                      )}
                    </td>
                    <td>
                      {row.recipientName}
                      <br />
                      <small className={styles.mono}>{row.recipientPhone}</small>
                      <br />
                      <small>
                        {row.addressLine}
                        <br />
                        {row.area}, {row.city}
                      </small>
                    </td>
                    <td>
                      <div className={styles.inlineForm}>
                        <form action="/api/admin/payments" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="claimId" value={row.claimId} />
                          <input type="hidden" name="decision" value="verify" />
                          {row.claimedAmountMinor !== row.orderTotalMinor && (
                            <input type="hidden" name="mismatchAcknowledged" value="1" />
                          )}
                          <label className={styles.hint}>
                            {t('admin.payments.confirmedAmount')}
                            <input type="number" name="verifiedAmount" required min={1} step="1" className={styles.tokenValue} style={{ maxWidth: '9rem' }} />
                          </label>
                          <button type="submit" className={styles.button} disabled={!canVerify}>
                            {t('admin.payments.verify')}
                          </button>
                        </form>
                        <form action="/api/admin/payments" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="claimId" value={row.claimId} />
                          <input type="hidden" name="decision" value="reject" />
                          <input type="text" name="reason" required minLength={10} maxLength={500} placeholder={t('admin.payments.reasonPlaceholder')} className={styles.tokenValue} style={{ maxWidth: '16rem' }} />
                          <button type="submit" className={styles.buttonSecondary} disabled={!canReject}>
                            {t('admin.payments.reject')}
                          </button>
                        </form>
                        <form action="/api/admin/payments" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="claimId" value={row.claimId} />
                          <input type="hidden" name="decision" value="falsely_claimed" />
                          <input type="text" name="reason" required minLength={10} maxLength={500} placeholder={t('admin.payments.falseReasonPlaceholder')} className={styles.tokenValue} style={{ maxWidth: '16rem' }} />
                          <button type="submit" className={styles.buttonSecondary} disabled={!canFlagFalse}>
                            {t('admin.payments.falselyClaimed')}
                          </button>
                        </form>
                        <form action="/api/admin/payments" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="claimId" value={row.claimId} />
                          <input type="hidden" name="decision" value={row.held ? 'release_hold' : 'hold'} />
                          <input type="text" name="reason" required minLength={10} maxLength={500} className={styles.tokenValue} style={{ maxWidth: '14rem' }} placeholder={row.held ? t('admin.payments.releaseHoldReason') : t('admin.payments.holdReason')} />
                          <button type="submit" className={row.held ? styles.buttonSecondary : styles.button}>
                            {row.held ? t('admin.payments.releaseHold') : t('admin.payments.hold')}
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
    </>
  );
}