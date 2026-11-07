'use client';

import Link from 'next/link';

import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

export type ResetNotice = 'invalid' | 'weak' | 'mismatch' | 'throttled' | 'missing';

const ERROR_KEYS = {
  invalid: 'account.resetInvalid',
  weak: 'account.errors.weakPassword',
  mismatch: 'account.resetMismatch',
  throttled: 'account.errors.throttled',
  missing: 'account.resetMissing',
} as const;

/**
 * The page a mailed recovery link opens.
 *
 * The token lives in the page's URL - that is what a link is - and is posted back with the form in a
 * hidden field. The page never displays it, and a failure never describes which kind of dead link it
 * was: unknown, expired and already used are one sentence.
 */
export function ResetPasswordView({
  token,
  notice,
}: {
  token: string | null;
  notice: ResetNotice | null;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      heading={t('account.resetTitle')}
      lead={t('account.resetBody')}
      asideTitle={t('account.authForgotAside')}
      footer={
        <p className={styles.muted}>
          <Link href="/account/login">{t('account.loginSubmit')}</Link>
        </p>
      }
    >
      {notice !== null && (
        <p className={styles.notice} role="alert">
          {t(ERROR_KEYS[notice], { min: CUSTOMER_PASSWORD_MIN_LENGTH })}
        </p>
      )}

      {token === null ? (
        <p className={styles.muted}>
          {t('account.resetNoToken')}{' '}
          <Link href="/account/forgot-password">{t('account.forgotTitle')}</Link>
        </p>
      ) : (
        <form className={styles.form} action="/api/account/reset" method="post">
          <input type="hidden" name="token" value={token} />
          <div className={styles.fieldPair}>
            <label className={styles.field}>
              <span>{t('account.newPassword')}</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={CUSTOMER_PASSWORD_MIN_LENGTH}
                placeholder="••••••••"
              />
            </label>
            <label className={styles.field}>
              <span>{t('account.confirmPassword')}</span>
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                placeholder="••••••••"
              />
            </label>
          </div>
          <p className={styles.fieldHint}>{t('account.passwordHelp', { min: CUSTOMER_PASSWORD_MIN_LENGTH })}</p>
          <button type="submit" className={styles.primaryAction}>
            {t('account.resetSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
