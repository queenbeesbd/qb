'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import styles from '../../admin.module.css';

export type RedeemError = 'invalidToken' | 'weakPassword' | 'mismatch' | 'accountDisabled' | null;

/**
 * Credential redemption.
 *
 * This is both the first-credential flow for a new staff member and the recovery path, because no
 * mail provider is authorized to deliver a reset link. The owner issues a single-use token and passes
 * it on out of band; the password is chosen here, by the person it belongs to, so the owner never
 * knows it.
 *
 * The token is submitted in the request body, never placed in the URL, so it cannot leak through
 * browser history, a referrer header or a shared link.
 */
export function RedeemView({ error, token, done }: { error: RedeemError; token: string; done: boolean }) {
  const { t } = useTranslation();

  const errorText: Record<Exclude<RedeemError, null>, string> = {
    invalidToken: t('admin.redeem.invalidToken'),
    weakPassword: t('admin.redeem.weakPassword', { min: PASSWORD_MIN_LENGTH }),
    mismatch: t('admin.redeem.mismatch'),
    accountDisabled: t('admin.redeem.accountDisabled'),
  };

  return (
    <div className={styles.centered}>
      <div className={styles.card}>
        <h1>{t('admin.redeem.title')}</h1>
        <p className={styles.lede}>{t('admin.redeem.body')}</p>

        {done ? (
          <>
            <p className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              {t('admin.redeem.success')}
            </p>
            <p className={styles.links}>
              <Link href="/admin/login">{t('admin.login.submit')}</Link>
            </p>
          </>
        ) : (
          <>
            {error !== null ? (
              <p className={`${styles.alert} ${styles.alertError}`} role="alert">
                {errorText[error]}
              </p>
            ) : null}

            <form className={styles.form} action="/api/admin/session/redeem" method="post">
              <div className={styles.field}>
                <label htmlFor="redeem-token">{t('admin.redeem.tokenLabel')}</label>
                <input
                  id="redeem-token"
                  name="token"
                  type="text"
                  required
                  defaultValue={token}
                  autoComplete="one-time-code"
                  spellCheck={false}
                  aria-describedby="redeem-token-hint"
                />
                <span className={styles.hint} id="redeem-token-hint">
                  {t('admin.redeem.tokenHelp')}
                </span>
              </div>
              <div className={styles.field}>
                <label htmlFor="redeem-password">{t('admin.redeem.passwordLabel')}</label>
                <input
                  id="redeem-password"
                  name="password"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="redeem-password-hint"
                />
                <span className={styles.hint} id="redeem-password-hint">
                  {t('admin.redeem.passwordHelp', { min: PASSWORD_MIN_LENGTH })}
                </span>
              </div>
              <div className={styles.field}>
                <label htmlFor="redeem-confirm">{t('admin.redeem.confirmLabel')}</label>
                <input
                  id="redeem-confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className={styles.button}>
                {t('admin.redeem.submit')}
              </button>
            </form>

            <p className={styles.links}>
              <Link href="/admin/login">{t('admin.login.submit')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
