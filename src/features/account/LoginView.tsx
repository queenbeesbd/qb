'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';

/**
 * Customer sign-in form.
 *
 * A plain HTML form posting to `/api/account/login`: no client state, no fetch, so it works without
 * JavaScript and the password never passes through React. The failure notice is a fixed code from the
 * URL, mapped here to one message - it never distinguishes "no such account" from "wrong password".
 */
export function LoginView({
  next,
  notice,
}: {
  next: string;
  /** `invalid` | `throttled` | other, from the redirect. */
  notice: string | null;
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.narrow}>
      <header className={styles.header}>
        <h1>{t('account.loginTitle')}</h1>
        <p className={styles.muted}>{t('account.loginBody')}</p>
      </header>

      {notice !== null && (
        <p className={styles.notice} role="alert">
          {notice === 'throttled' ? t('account.errors.throttled') : t('account.errors.invalid')}
        </p>
      )}

      <form className={styles.form} action="/api/account/login" method="post">
        <input type="hidden" name="next" value={next} />
        <label className={styles.field}>
          <span>{t('account.email')}</span>
          <input type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className={styles.field}>
          <span>{t('account.password')}</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className={styles.primaryAction}>
          {t('account.loginSubmit')}
        </button>
      </form>

      <p className={styles.muted}>
        {t('account.noAccount')}{' '}
        <Link href={`/account/register?next=${encodeURIComponent(next)}`}>{t('account.register')}</Link>
      </p>
      {/* The limitation is stated here, on the sign-in screen, and not only on the account page: a
          customer who cannot sign in is exactly who needs to know there is no self-service reset. */}
      <p className={styles.muted}>
        <strong>{t('account.noRecoveryTitle')}</strong>
      </p>
      <p className={styles.muted}>{t('account.noRecoveryBody')}</p>
      {/* The recovery page is not a "forgot password" link - nothing is sent automatically. It is where
          a customer enters the one-time code the owner read to them. */}
      <p className={styles.muted}>
        <Link href={`/account/recover?next=${encodeURIComponent(next)}`}>
          {t('account.recoverTitle')}
        </Link>
      </p>
    </div>
  );
}
