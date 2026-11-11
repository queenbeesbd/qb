'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';
import type { SignInMethod } from './LoginView';

/**
 * Customer registration form.
 *
 * **One identifier, one account** (owner decision, 2026-11-12). The default is a Bangladeshi mobile
 * number; the switch beside the heading asks for an email address instead. The switch is a link, so it
 * works without JavaScript and the server receives the same `method` the person chose.
 *
 * **Neither mode asks for the other.** A phone-first account is opened with a number and gets a
 * six-digit SMS code; an email-first account is opened with an address and gets a verification link.
 * The account is usable immediately either way: verification confirms the identifier, it does not gate
 * the account.
 */
export function RegisterView({
  next,
  notice,
  method,
}: {
  next: string;
  notice: string | null;
  method: SignInMethod;
}) {
  const { t } = useTranslation();
  const phoneHref = `/account/register?next=${encodeURIComponent(next)}`;
  const emailHref = `/account/register?next=${encodeURIComponent(next)}&method=email`;

  const message = (): string | null => {
    switch (notice) {
      case 'invalid_email':
        return t('account.errors.invalidEmail');
      case 'invalid_phone':
        return t('account.errors.invalidPhone');
      case 'weak_password':
        return t('account.errors.weakPassword', { min: CUSTOMER_PASSWORD_MIN_LENGTH });
      case 'mismatch':
        return t('account.errors.passwordMismatch');
      case 'email_taken':
        return t('account.errors.emailTaken');
      case 'phone_taken':
        return t('account.errors.phoneTaken');
      case 'invalid_name':
        return t('account.errors.invalidName');
      case 'throttled':
        return t('account.errors.throttled');
      case 'invalid':
        return t('account.errors.invalid');
      default:
        return null;
    }
  };
  const text = message();

  return (
    <AuthShell
      heading={t('account.registerTitle')}
      lead={t('account.registerBody')}
      asideTitle={t('account.authRegisterAside')}
      footer={
        <p className={styles.muted}>
          {t('account.haveAccount')}{' '}
          <Link href={`/account/login?next=${encodeURIComponent(next)}`}>{t('account.signIn')}</Link>
        </p>
      }
    >
      {text !== null && (
        <p className={styles.notice} role="alert">
          {text}
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

      <form className={styles.form} action="/api/account/register" method="post">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={method} />
        <label className={styles.field}>
          <span>
            {t('account.displayName')} <em>{t('common.optional')}</em>
          </span>
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            maxLength={80}
            placeholder={t('account.namePlaceholder')}
          />
        </label>

        {method === 'phone' ? (
          <label className={styles.field}>
            <span>{t('account.phone')}</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              inputMode="tel"
              required
              maxLength={20}
              placeholder={t('account.phonePlaceholder')}
            />
            <small>{t('account.phoneVerifyHelp')}</small>
          </label>
        ) : (
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
            <small>{t('account.emailVerifyHelp')}</small>
          </label>
        )}

        <div className={styles.fieldPair}>
          <label className={styles.field}>
            <span>{t('account.password')}</span>
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
              name="confirmPassword"
              autoComplete="new-password"
              required
              placeholder="••••••••"
            />
          </label>
        </div>
        <p className={styles.fieldHint}>{t('account.passwordHelp', { min: CUSTOMER_PASSWORD_MIN_LENGTH })}</p>
        <button type="submit" className={styles.primaryAction}>
          {t('account.registerSubmit')}
        </button>
      </form>
    </AuthShell>
  );
}
