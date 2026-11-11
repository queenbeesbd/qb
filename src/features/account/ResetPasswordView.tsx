'use client';

import Link from 'next/link';

import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

export type ResetNotice = 'invalid' | 'weak' | 'mismatch' | 'throttled';

const ERROR_KEYS = {
  invalid: 'account.resetInvalid',
  weak: 'account.errors.weakPassword',
  mismatch: 'account.resetMismatch',
  throttled: 'account.errors.throttled',
} as const;

/**
 * The page a mailed recovery link opens, and the page a customer types an SMS code on.
 *
 * Two shapes of the same form. With a `token` - the link's own query string - only the new password is
 * asked for. Without one, the customer types the number the code was sent to and the six digits, which
 * is the whole recovery path for a phone-first account. The token never renders as text and a failure
 * never describes which kind of dead credential it was: unknown, expired and already used are one
 * sentence.
 */
export function ResetPasswordView({
  token,
  phone,
  notice,
}: {
  token: string | null;
  /** The number a code was requested for, echoed back so a refusal keeps the field filled. */
  phone: string | null;
  notice: ResetNotice | null;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      heading={t('account.resetTitle')}
      lead={token === null ? t('account.resetCodeBody') : t('account.resetBody')}
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

      <form className={styles.form} action="/api/account/reset" method="post">
        {token === null ? (
          <>
            <label className={styles.field}>
              <span>{t('account.phone')}</span>
              <input
                type="tel"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                required
                maxLength={20}
                defaultValue={phone ?? ''}
                placeholder={t('account.phonePlaceholder')}
              />
            </label>
            <label className={styles.field}>
              <span>{t('account.resetCode')}</span>
              <input
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
              />
            </label>
          </>
        ) : (
          <input type="hidden" name="token" value={token} />
        )}

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

      {token === null && (
        <p className={styles.fieldHint}>
          <Link href="/account/forgot-password">{t('account.forgotTitle')}</Link>
        </p>
      )}
    </AuthShell>
  );
}
