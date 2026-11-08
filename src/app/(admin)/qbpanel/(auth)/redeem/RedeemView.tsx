'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { Notice } from '../../_ui/Notice';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../qbpanel.module.css';

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
        <Link href="/" className={styles.authBrand}>
          <span aria-hidden="true">✦</span> QueenBee&apos;s
        </Link>
        <div>
          <h1>{t('admin.redeem.title')}</h1>
          <p className={styles.lede} style={{ marginTop: 'var(--space-2)' }}>
            {t('admin.redeem.body')}
          </p>
        </div>

        {done ? (
          <>
            <Notice tone="success">{t('admin.redeem.success')}</Notice>
            <p className={styles.links}>
              <Link href="/qbpanel/login">{t('admin.login.submit')}</Link>
            </p>
          </>
        ) : (
          <>
            {error !== null ? <Notice tone="error">{errorText[error]}</Notice> : null}

            <form className={styles.form} action="/api/qbpanel/session/redeem" method="post">
              <div className={styles.field}>
                <label htmlFor="redeem-token">{t('admin.redeem.tokenLabel')}</label>
                <input
                  className={styles.input}
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
                  className={styles.input}
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
                  className={styles.input}
                  id="redeem-confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <SubmitButton label={t('admin.redeem.submit')} pendingLabel={t('admin.common.working')} wide />
            </form>

            <p className={styles.links}>
              <Link href="/qbpanel/login">{t('admin.login.submit')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
