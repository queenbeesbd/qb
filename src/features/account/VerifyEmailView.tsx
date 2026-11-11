'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * The page a registration verification link opens.
 *
 * The confirmation is a **button**, not a side effect of loading: a mail scanner that prefetches every
 * URL in a message must not be able to mark an address verified. The token is carried in a hidden field
 * and never rendered as text.
 *
 * The account is already usable, so this page has no "finish creating your account" step; it confirms
 * one stored fact and offers the way back into the shop.
 */
export function VerifyEmailView({
  token,
  verified,
  notice,
}: {
  token: string | null;
  verified: boolean;
  notice: 'invalid' | null;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      heading={t('account.verifyEmailTitle')}
      lead={t('account.verifyEmailBody')}
      asideTitle={t('account.authSignInAside')}
      footer={
        <p className={styles.muted}>
          <Link href="/account/login">{t('account.loginSubmit')}</Link>
        </p>
      }
    >
      {verified ? (
        <p className={styles.notice} role="status">
          {t('account.verifyEmailDone')}
        </p>
      ) : notice !== null || token === null ? (
        <p className={styles.notice} role="alert">
          {t('account.verifyEmailInvalid')}
        </p>
      ) : (
        <form className={styles.form} action="/api/account/verify-email" method="post">
          <input type="hidden" name="token" value={token} />
          <p className={styles.fieldHint}>{t('account.verifyEmailHint')}</p>
          <button type="submit" className={styles.primaryAction}>
            {t('account.verifyEmailSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
