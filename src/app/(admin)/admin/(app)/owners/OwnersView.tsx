'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../../admin.module.css';

export type OwnerRow = {
  id: number;
  email: string;
  displayName: string;
  status: string;
  disabledAt: string | null;
  lastSeenAt: string | null;
  hasCredential: boolean;
};

export type OwnerNotice =
  | 'created'
  | 'tokenIssued'
  | 'disabled'
  | 'enabled'
  | 'denied'
  | 'conflict'
  | 'exists'
  | 'invalid';

const NOTICE_KEYS: Record<OwnerNotice, TranslationKey> = {
  created: 'admin.owners.notice.created',
  tokenIssued: 'admin.owners.notice.tokenIssued',
  disabled: 'admin.owners.notice.disabled',
  enabled: 'admin.owners.notice.enabled',
  denied: 'admin.owners.notice.denied',
  conflict: 'admin.owners.notice.conflict',
  exists: 'admin.owners.notice.exists',
  invalid: 'admin.owners.notice.invalid',
};

const ERROR_NOTICES: readonly OwnerNotice[] = ['denied', 'conflict', 'exists', 'invalid'];

/**
 * Owner accounts.
 *
 * Every control is a plain form post to a route handler that re-checks the permission, the CSRF token
 * and the same-origin header server-side, so the interface is a convenience and never the control.
 *
 * There is deliberately no role picker: a new account is an owner, and that is the only kind of account
 * this screen can create.
 */
export function OwnersView({
  owners,
  currentStaffUserId,
  canManage,
  notice,
  issuedToken,
  csrfToken,
}: {
  owners: readonly OwnerRow[];
  currentStaffUserId: number;
  canManage: boolean;
  notice: OwnerNotice | null;
  issuedToken: { token: string; expiresAt: string } | null;
  csrfToken: string;
}) {
  const { t, locale } = useTranslation();
  const format = (iso: string): string =>
    new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.owners.title')}</h1>
          <p>{t('admin.owners.body')}</p>
        </div>

        {notice !== null && (
          <p className={noticeIsError ? `${styles.alert} ${styles.alertError}` : `${styles.alert} ${styles.alertSuccess}`}>
            {t(NOTICE_KEYS[notice])}
          </p>
        )}

        {/* Shown exactly once, and only to the browser that performed the action. */}
        {issuedToken !== null && (
          <div className={styles.tokenBox}>
            <strong>{t('admin.owners.tokenTitle')}</strong>
            <p className={styles.note}>{t('admin.owners.tokenBody')}</p>
            <p className={styles.tokenValue}>{issuedToken.token}</p>
            <p className={styles.hint}>
              {t('admin.owners.tokenExpires')}: {format(issuedToken.expiresAt)}
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.owners.listTitle')}</h2>
        </div>

        {owners.length === 0 ? (
          <p className={styles.empty}>{t('admin.owners.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('admin.owners.displayName')}</th>
                  <th>{t('admin.owners.status')}</th>
                  <th>{t('admin.owners.credentialSet')}</th>
                  <th>{t('admin.owners.lastSeen')}</th>
                  <th>{t('admin.owners.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => {
                  const isSelf = owner.id === currentStaffUserId;
                  const active = owner.status === 'active';
                  return (
                    <tr key={owner.id}>
                      <td>
                        {owner.displayName}
                        {isSelf && (
                          <>
                            {' '}
                            <span className={styles.tag}>{t('admin.owners.you')}</span>
                          </>
                        )}
                        <br />
                        <span className={styles.mono}>{owner.email}</span>
                      </td>
                      <td>
                        {active ? (
                          <span className={styles.tag}>{t('admin.owners.statusActive')}</span>
                        ) : (
                          <span className={`${styles.tag} ${styles.tagWarn}`}>
                            {t('admin.owners.statusDisabled')}
                          </span>
                        )}
                      </td>
                      <td>
                        {owner.hasCredential ? (
                          t('admin.owners.credentialSet')
                        ) : (
                          <span className={styles.tagMuted}>{t('admin.owners.credentialNotSet')}</span>
                        )}
                      </td>
                      <td>
                        {owner.lastSeenAt === null ? (
                          <span className={styles.tagMuted}>{t('admin.owners.never')}</span>
                        ) : (
                          format(owner.lastSeenAt)
                        )}
                      </td>
                      <td>
                        {canManage && (
                          <div className={styles.inlineForm}>
                            <form className={styles.inlineForm} action="/api/admin/owners/credential" method="post">
                              <input type="hidden" name="csrf" value={csrfToken} />
                              <input type="hidden" name="staffUserId" value={owner.id} />
                              <button
                                type="submit"
                                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                              >
                                {t('admin.owners.issueToken')}
                              </button>
                            </form>
                            {/* Self-disable is refused by the service, so the control is not offered. */}
                            {!isSelf && (
                              <form
                                className={styles.inlineForm}
                                action="/api/admin/owners/status"
                                method="post"
                                onSubmit={(event) => {
                                  if (active && !window.confirm(t('admin.owners.lastOwnerNote'))) {
                                    event.preventDefault();
                                  }
                                }}
                              >
                                <input type="hidden" name="csrf" value={csrfToken} />
                                <input type="hidden" name="staffUserId" value={owner.id} />
                                <input type="hidden" name="operation" value={active ? 'disable' : 'enable'} />
                                <button
                                  type="submit"
                                  className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                                >
                                  {active ? t('admin.owners.disable') : t('admin.owners.enable')}
                                </button>
                              </form>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className={styles.note}>{t('admin.owners.selfNote')}</p>
        <p className={styles.note}>{t('admin.owners.lastOwnerNote')}</p>
        <p className={styles.note}>{t('admin.owners.noSelfRegistration')}</p>
      </section>

      {canManage && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.owners.createTitle')}</h2>
            <p>{t('admin.owners.createBody')}</p>
          </div>
          <form className={styles.form} action="/api/admin/owners" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <div className={styles.field}>
              <label htmlFor="displayName">{t('admin.owners.displayName')}</label>
              <input id="displayName" name="displayName" required maxLength={80} />
            </div>
            <div className={styles.field}>
              <label htmlFor="email">{t('admin.owners.email')}</label>
              <input id="email" name="email" type="email" required maxLength={254} />
            </div>
            <button type="submit" className={styles.button}>
              {t('admin.owners.createSubmit')}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
