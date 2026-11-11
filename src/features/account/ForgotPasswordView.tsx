'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * "Forgot your password?" - the customer types the number or address they sign in with, and a link or a
 * six-digit code is sent if it belongs to an active account.
 *
 * The confirmation sentence is deliberately the same one for every outcome: the page must not become a
 * way to find out which numbers or addresses have accounts. It is also the page a throttled or
 * provider-less request lands on, which is the point. After any submission the page offers both ways
 * forward - the mailed link, and the code entry - without saying which one was actually sent.
 */
export function ForgotPasswordView({
  next,
  sent,
}: {
  next: string;
  /** True after any submission, whatever the server actually did. */
  sent: boolean;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      heading={t('account.forgotTitle')}
      lead={t('account.forgotBody')}
      asideTitle={t('account.authForgotAside')}
      footer={
        <p className={styles.muted}>
          <Link href={`/account/login?next=${encodeURIComponent(next)}`}>{t('account.loginSubmit')}</Link>
        </p>
      }
    >
      {sent ? (
        <>
          <p className={styles.notice} role="status">
            {t('account.forgotSent')}
          </p>
          <p className={styles.fieldHint}>
            {t('account.forgotCodeHint')}{' '}
            <Link href="/account/reset">{t('account.resetTitle')}</Link>
          </p>
        </>
      ) : (
        <form className={styles.form} action="/api/account/recovery" method="post">
          <input type="hidden" name="next" value={next} />
          <label className={styles.field}>
            <span>{t('account.recoveryIdentifier')}</span>
            <input
              type="text"
              name="identifier"
              autoComplete="username"
              required
              maxLength={254}
              placeholder={t('account.recoveryIdentifierPlaceholder')}
            />
          </label>
          <p className={styles.fieldHint}>{t('account.forgotHint')}</p>
          <button type="submit" className={styles.primaryAction}>
            {t('account.forgotSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
