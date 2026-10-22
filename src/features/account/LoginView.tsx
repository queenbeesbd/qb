'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * Customer sign-in form.
 *
 * A plain HTML form posting to `/api/account/login`: no client state, no fetch, so it works without
 * JavaScript and the password never passes through React. The failure notice is a fixed code from the
 * URL, mapped here to one message - it never distinguishes "no such account" from "wrong password".
 *
 * The recovery limitation used to be three paragraphs of prose under the form. It is now one line in the
 * form's footer plus a route to the code page, because the customer who needs it is looking for a way
 * back in, not for an explanation of the architecture.
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
    <AuthShell
      heading={t('account.loginTitle')}
      lead={t('account.loginBody')}
      asideTitle={t('account.authSignInAside')}
      footer={
        <>
          <p className={styles.muted}>
            {t('account.noAccount')}{' '}
            <Link href={`/account/register?next=${encodeURIComponent(next)}`}>
              {t('account.register')}
            </Link>
          </p>
          {/*
            Not a "forgot password" link: nothing is sent automatically, and there is no self-service
            reset. The route is where a customer enters the one-time code the owner read to them.
          */}
          <p className={styles.muted}>
            {t('account.forgotPassword')}{' '}
            <Link href={`/account/recover?next=${encodeURIComponent(next)}`}>
              {t('account.recoverTitle')}
            </Link>
          </p>
        </>
      }
    >
      {notice !== null && (
        <p className={styles.notice} role="alert">
          {notice === 'throttled' ? t('account.errors.throttled') : t('account.errors.invalid')}
        </p>
      )}

      <form className={styles.form} action="/api/account/login" method="post">
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
        <label className={styles.field}>
          <span>{t('account.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </label>
        <button type="submit" className={styles.primaryAction}>
          {t('account.loginSubmit')}
        </button>
      </form>
    </AuthShell>
  );
}
