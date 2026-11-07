'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * "Forgot your password?" - the customer types the address and a recovery link is mailed if it belongs
 * to an active account.
 *
 * The confirmation sentence is deliberately the same one for every outcome: the page must not become a
 * way to find out which addresses have accounts. It is also the page a throttled or provider-less request
 * lands on, which is the point.
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
        <p className={styles.notice} role="status">
          {t('account.forgotSent')}
        </p>
      ) : (
        <form className={styles.form} action="/api/account/recovery" method="post">
          <input type="hidden" name="next" value={next} />
          <label className={styles.field}>
            <span>{t('account.email')}</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder={t('account.emailPlaceholder')}
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
