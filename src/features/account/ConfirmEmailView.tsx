'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * The page a change-of-address link opens.
 *
 * The confirmation is a **button**, not a side effect of the page loading: a mail client that prefetches
 * links, or a scanner that visits every URL in a message, must not be able to move somebody's account.
 * The token is carried in a hidden field and is never rendered as text.
 */
export function ConfirmEmailView({
  token,
  notice,
}: {
  token: string | null;
  notice: 'invalid' | 'taken' | null;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      heading={t('account.confirmEmailTitle')}
      lead={t('account.confirmEmailBody')}
      asideTitle={t('account.authForgotAside')}
      footer={
        <p className={styles.muted}>
          <Link href="/account/login">{t('account.loginSubmit')}</Link>
        </p>
      }
    >
      {notice !== null && (
        <p className={styles.notice} role="alert">
          {notice === 'taken' ? t('account.confirmEmailTaken') : t('account.confirmEmailInvalid')}
        </p>
      )}

      {token === null ? (
        <p className={styles.muted}>{t('account.confirmEmailInvalid')}</p>
      ) : (
        <form className={styles.form} action="/api/account/confirm-email" method="post">
          <input type="hidden" name="token" value={token} />
          <p className={styles.fieldHint}>{t('account.confirmEmailHint')}</p>
          <button type="submit" className={styles.primaryAction}>
            {t('account.confirmEmailSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
