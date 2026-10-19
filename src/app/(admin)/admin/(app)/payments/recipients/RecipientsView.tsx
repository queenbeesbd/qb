'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../../admin.module.css';

export type RecipientMethodValue = 'bkash' | 'nagad';

export type RecipientViewRow = {
  id: number;
  method: string;
  accountNumber: string;
  accountLabel: string;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  claimCount: number;
};

export type RecipientNotice =
  | 'created'
  | 'updated'
  | 'replaced'
  | 'unchanged'
  | 'deactivated'
  | 'reactivated'
  | 'conflict'
  | 'invalid'
  | 'denied';

const NOTICE_KEYS: Record<RecipientNotice, TranslationKey> = {
  created: 'admin.recipients.notice.created',
  updated: 'admin.recipients.notice.updated',
  replaced: 'admin.recipients.notice.replaced',
  unchanged: 'admin.recipients.notice.unchanged',
  deactivated: 'admin.recipients.notice.deactivated',
  reactivated: 'admin.recipients.notice.reactivated',
  conflict: 'admin.recipients.notice.conflict',
  invalid: 'admin.recipients.notice.invalid',
  denied: 'admin.recipients.notice.denied',
};

const FAILURE: ReadonlySet<RecipientNotice> = new Set<RecipientNotice>(['conflict', 'invalid', 'denied']);

const METHOD_LABEL: Record<string, TranslationKey> = {
  bkash: 'admin.recipients.method.bkash',
  nagad: 'admin.recipients.method.nagad',
};

/**
 * Payment-recipient configuration.
 *
 * Deliberately one row per method, because that is what the storefront does: it shows one bKash number
 * and one Nagad number. The schema already refuses a second active row per method, so there is no
 * routing, priority or default-selection control here - inventing one would be a product decision the
 * owner has not made.
 *
 * The number is shown in full. The owner has to be able to read it back and check it against the
 * account; masking the store's own receiving number would defeat the purpose of the screen.
 */
export function RecipientsView({
  rows,
  availableMethods,
  notice,
  csrfToken,
}: {
  rows: readonly RecipientViewRow[];
  availableMethods: readonly string[];
  notice: RecipientNotice | null;
  csrfToken: string;
}) {
  const { t, locale } = useTranslation();

  const dateFormat = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium' });
  const activeFor = (method: RecipientMethodValue) =>
    rows.find((row) => row.method === method && row.isActive) ?? null;
  const historyFor = (method: RecipientMethodValue) =>
    rows.filter((row) => row.method === method && !row.isActive);

  const methodName = (method: string) => t(METHOD_LABEL[method] ?? 'admin.recipients.method.bkash');

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h1>{t('admin.recipients.title')}</h1>
        <p>{t('admin.recipients.body')}</p>
      </div>

      {notice !== null && (
        <p role="status" className={FAILURE.has(notice) ? styles.alertError : styles.alertSuccess}>
          {t(NOTICE_KEYS[notice])}
        </p>
      )}

      <div className={styles.panel}>
        <h2>{t('admin.recipients.availability')}</h2>
        <p className={styles.hint}>{t('admin.recipients.availabilityHint')}</p>
        <ul className={styles.facts}>
          {(['bkash', 'nagad'] as const).map((method) => {
            const active = activeFor(method);
            return (
              <li key={method} className={styles.fact}>
                <span className={styles.factLabel}>{methodName(method)}</span>
                <span className={styles.factValue}>
                  {active === null ? (
                    <span className={styles.tagMuted}>{t('admin.recipients.unavailable')}</span>
                  ) : (
                    <span className={styles.tag}>
                      {t('admin.recipients.available')} · {active.accountNumber}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
          <li className={styles.fact}>
            <span className={styles.factLabel}>{t('admin.recipients.method.cod')}</span>
            <span className={styles.factValue}>
              <span className={styles.tag}>{t('admin.recipients.codAlways')}</span>
            </span>
          </li>
        </ul>
        {availableMethods.length === 0 && (
          <p className={styles.note}>{t('admin.recipients.noneConfigured')}</p>
        )}
      </div>

      {(['bkash', 'nagad'] as const).map((method) => {
        const active = activeFor(method);
        const history = historyFor(method);
        return (
          <div key={method} className={styles.panel}>
            <h2>{methodName(method)}</h2>

            {active === null ? (
              <form className={styles.form} action="/api/admin/payment-recipients" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="create" />
                <input type="hidden" name="method" value={method} />
                <p className={styles.hint}>{t('admin.recipients.addHint')}</p>
                <div className={styles.field}>
                  <label htmlFor={`number-${method}`}>{t('admin.recipients.accountNumber')}</label>
                  <input
                    id={`number-${method}`}
                    name="accountNumber"
                    inputMode="tel"
                    autoComplete="off"
                    required
                    placeholder="01XXXXXXXXX"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`label-${method}`}>{t('admin.recipients.accountLabel')}</label>
                  <input
                    id={`label-${method}`}
                    name="accountLabel"
                    autoComplete="off"
                    required
                    maxLength={60}
                    placeholder={t('admin.recipients.accountLabelPlaceholder')}
                  />
                </div>
                <button type="submit" className={styles.button}>
                  {t('admin.recipients.add')}
                </button>
              </form>
            ) : (
              <>
                <p className={styles.hint}>
                  {t('admin.recipients.addedOn')} {dateFormat.format(new Date(active.createdAt))}
                </p>
                {active.claimCount > 0 && (
                  <p className={styles.note}>
                    {t('admin.recipients.claimsRefer').replace('{count}', String(active.claimCount))}
                  </p>
                )}
                <form className={styles.inlineForm} action="/api/admin/payment-recipients" method="post">
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="action" value="update" />
                  <input type="hidden" name="recipientId" value={active.id} />
                  <div className={styles.field}>
                    <label htmlFor={`edit-number-${active.id}`}>{t('admin.recipients.accountNumber')}</label>
                    <input
                      id={`edit-number-${active.id}`}
                      name="accountNumber"
                      defaultValue={active.accountNumber}
                      inputMode="tel"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`edit-label-${active.id}`}>{t('admin.recipients.accountLabel')}</label>
                    <input
                      id={`edit-label-${active.id}`}
                      name="accountLabel"
                      defaultValue={active.accountLabel}
                      autoComplete="off"
                      required
                      maxLength={60}
                    />
                  </div>
                  <button type="submit" className={styles.buttonSmall}>
                    {t('admin.recipients.save')}
                  </button>
                </form>
                <form className={styles.inlineForm} action="/api/admin/payment-recipients" method="post">
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="action" value="deactivate" />
                  <input type="hidden" name="recipientId" value={active.id} />
                  <button type="submit" className={styles.buttonSecondary}>
                    {t('admin.recipients.deactivate')}
                  </button>
                </form>
                <p className={styles.hint}>{t('admin.recipients.deactivateHint')}</p>
              </>
            )}

            {history.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.hint}>{t('admin.recipients.history')}</caption>
                  <thead>
                    <tr>
                      <th>{t('admin.recipients.accountNumber')}</th>
                      <th>{t('admin.recipients.accountLabel')}</th>
                      <th>{t('admin.recipients.deactivatedOn')}</th>
                      <th>{t('admin.recipients.claims')}</th>
                      <th>{t('admin.recipients.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.mono}>{row.accountNumber}</td>
                        <td>{row.accountLabel}</td>
                        <td>
                          {row.deactivatedAt === null ? '—' : dateFormat.format(new Date(row.deactivatedAt))}
                        </td>
                        <td>{row.claimCount}</td>
                        <td>
                          <form className={styles.inlineForm} action="/api/admin/payment-recipients" method="post">
                            <input type="hidden" name="csrf" value={csrfToken} />
                            <input type="hidden" name="action" value="reactivate" />
                            <input type="hidden" name="recipientId" value={row.id} />
                            <button type="submit" className={styles.buttonSmall}>
                              {t('admin.recipients.reactivate')}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
