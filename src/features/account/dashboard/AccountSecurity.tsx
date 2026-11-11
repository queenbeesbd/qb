'use client';

import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account-dashboard.module.css';
import { securityNotice } from './notices';

/**
 * Password and email, on one screen (ADR 0030).
 *
 * **The screen's one question** is "is this account still only mine?" - so the two facts that decide it
 * sit beside each other, each with the field that changes it. The panel states the rule that is easy
 * to miss before an action is taken rather than after: a change signs the other devices out.
 *
 * Both forms post natively with the session-bound CSRF token, so they work before any script runs and
 * a password is never held in component state. A refusal returns to this page and is rendered beside
 * the form that produced it.
 */
export function AccountSecurity({
  email,
  phone,
  emailVerified,
  csrfToken,
  notice,
}: {
  email: string;
  phone: string | null;
  emailVerified: boolean;
  csrfToken: string;
  notice: string | null;
}) {
  const { t } = useTranslation();
  const entry = securityNotice(notice);

  return (
    <>
      <header className={styles.canvasHead}>
        <h1>{t('account.security.title')}</h1>
        <p className={styles.canvasLead}>{t('account.security.lead')}</p>
      </header>

      {entry !== undefined && (
        <p
          className={`${styles.notice} ${entry.error ? styles.noticeError : styles.noticeInfo}`}
          role={entry.error ? 'alert' : 'status'}
        >
          {t(entry.key, { min: CUSTOMER_PASSWORD_MIN_LENGTH })}
        </p>
      )}

      <div className={styles.settings}>
        <section className={styles.settingsRow} aria-labelledby="security-password">
          <div className={styles.settingsText}>
            <h2 id="security-password" className={styles.settingsTitle}>
              {t('account.changePasswordTitle')}
            </h2>
            <p className={styles.settingsBody}>{t('account.changePasswordBody')}</p>
            <p className={styles.fieldHint}>{t('account.security.passwordHint')}</p>
          </div>
          <div className={styles.settingsPanel}>
            <form className={styles.form} action="/api/account/password" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('account.currentPassword')}</span>
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('account.newPassword')}</span>
                  <input
                    type="password"
                    name="newPassword"
                    autoComplete="new-password"
                    required
                    minLength={CUSTOMER_PASSWORD_MIN_LENGTH}
                    placeholder="••••••••"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('account.confirmPassword')}</span>
                  <input
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    minLength={CUSTOMER_PASSWORD_MIN_LENGTH}
                    placeholder="••••••••"
                  />
                </label>
              </div>
              <p className={styles.fieldHint}>
                {t('account.passwordHelp', { min: CUSTOMER_PASSWORD_MIN_LENGTH })}
              </p>
              <button type="submit" className={styles.button}>
                {t('account.changePasswordSubmit')}
              </button>
            </form>
          </div>
        </section>

        {phone !== null && (
          <section className={styles.settingsRow} aria-labelledby="security-phone">
            <div className={styles.settingsText}>
              <h2 id="security-phone" className={styles.settingsTitle}>
                {t('account.security.phoneTitle')}
              </h2>
              <p className={styles.settingsBody}>{t('account.security.phoneBody')}</p>
            </div>
            <div className={styles.settingsPanel}>
              <p className={styles.fieldHint}>{phone}</p>
              <p className={styles.fieldHint}>{t('account.security.phoneUnverified')}</p>
            </div>
          </section>
        )}

        <section className={styles.settingsRow} aria-labelledby="security-email">
          <div className={styles.settingsText}>
            <h2 id="security-email" className={styles.settingsTitle}>
              {t('account.changeEmailTitle')}
            </h2>
            <p className={styles.settingsBody}>{t('account.changeEmailBody')}</p>
            <p className={styles.fieldHint}>
              {t('account.security.currentEmail')} {email}
            </p>
          </div>
          <div className={styles.settingsPanel}>
            <p className={styles.fieldHint}>
              {emailVerified
                ? t('account.security.emailVerified')
                : t('account.security.emailUnverified')}
            </p>
            {!emailVerified && (
              <form className={styles.form} action="/api/account/verification" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <button type="submit" className={styles.button}>
                  {t('account.security.resendVerification')}
                </button>
              </form>
            )}
            <form className={styles.form} action="/api/account/email" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('account.newEmail')}</span>
                <input
                  type="email"
                  name="newEmail"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder={t('account.emailPlaceholder')}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('account.currentPassword')}</span>
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              </label>
              <p className={styles.fieldHint}>{t('account.emailHelp')}</p>
              <button type="submit" className={styles.button}>
                {t('account.changeEmailSubmit')}
              </button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
