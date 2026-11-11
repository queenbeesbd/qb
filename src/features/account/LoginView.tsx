'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/** Which identifier the sign-in form is asking for. Phone is the default (owner direction, 2026-11-11). */
export type SignInMethod = 'phone' | 'email';

/**
 * Customer sign-in form.
 *
 * One identifier field and a switch between the two identifiers the account can carry: a Bangladeshi
 * mobile number (the default) or an email address. The switch is a link, not client state, so it works
 * before any script runs and the chosen method survives the POST and its refusal notice.
 *
 * A plain HTML form posting to `/api/account/login`: no client state, no fetch, so the password never
 * passes through React. The failure notice is a fixed code from the URL, mapped here to one message -
 * it never distinguishes "no such account" from "wrong password".
 */
export function LoginView({
  next,
  notice,
  method,
}: {
  next: string;
  /** `invalid` | `throttled` | `resetDone` | `emailChanged` | `emailVerified`, from the redirect. */
  notice: string | null;
  method: SignInMethod;
}) {
  const { t } = useTranslation();
  const phoneHref = `/account/login?next=${encodeURIComponent(next)}`;
  const emailHref = `/account/login?next=${encodeURIComponent(next)}&method=email`;

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
            One route back: a recovery link mailed to the address on the account, which every account
            carries - including a phone-first one.
          */}
          <p className={styles.muted}>
            {t('account.forgotPassword')}{' '}
            <Link href={`/account/forgot-password?next=${encodeURIComponent(next)}`}>
              {t('account.forgotTitle')}
            </Link>
          </p>
        </>
      }
    >
      {notice !== null && (
        <p
          className={styles.notice}
          role={
            notice === 'resetDone' || notice === 'emailChanged' || notice === 'emailVerified'
              ? 'status'
              : 'alert'
          }
        >
          {notice === 'resetDone'
            ? t('account.login.resetDone')
            : notice === 'emailChanged'
              ? t('account.login.emailChanged')
              : notice === 'emailVerified'
                ? t('account.login.emailVerified')
                : notice === 'throttled'
                  ? t('account.errors.throttled')
                  : t('account.errors.invalid')}
        </p>
      )}

      <nav className={styles.methodSwitch} aria-label={t('account.methodLabel')}>
        <Link
          className={styles.methodOption}
          href={phoneHref}
          data-active={method === 'phone' ? 'true' : 'false'}
          aria-current={method === 'phone' ? 'true' : undefined}
        >
          {t('account.methodPhone')}
        </Link>
        <Link
          className={styles.methodOption}
          href={emailHref}
          data-active={method === 'email' ? 'true' : 'false'}
          aria-current={method === 'email' ? 'true' : undefined}
        >
          {t('account.methodEmail')}
        </Link>
      </nav>

      <form className={styles.form} action="/api/account/login" method="post">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={method} />
        {method === 'phone' ? (
          <label className={styles.field}>
            <span>{t('account.phone')}</span>
            <input
              type="tel"
              name="identifier"
              autoComplete="tel"
              inputMode="tel"
              required
              maxLength={20}
              placeholder={t('account.phonePlaceholder')}
            />
          </label>
        ) : (
          <label className={styles.field}>
            <span>{t('account.email')}</span>
            <input
              type="email"
              name="identifier"
              autoComplete="email"
              required
              maxLength={254}
              placeholder={t('account.emailPlaceholder')}
            />
          </label>
        )}
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
