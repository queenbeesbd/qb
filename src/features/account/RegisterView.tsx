'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';
import type { SignInMethod } from './LoginView';

export type RegisterStep = 'identifier' | 'code' | 'password';

/**
 * Customer registration - one identifier, a code, then a password (ADR 0038).
 *
 * **The account is created last.** Step 1 asks for a number (default) or an address and sends a
 * six-digit code; step 2 enters it; step 3 sets the password and name. Until step 3 finishes there is
 * no customer row, so a registration flood costs one message per attempt and never an account - which
 * is why the owner moved verification **before** registration.
 *
 * The switch between number and address is a link, so it works without JavaScript. Every step posts
 * natively, and the server derives the step from its own httpOnly cookie rather than from the URL.
 */
export function RegisterView({
  step,
  method,
  identifier,
  next,
  notice,
  sent,
}: {
  step: RegisterStep;
  method: SignInMethod;
  /** The canonical number or address the code went to; shown back in steps 2 and 3. */
  identifier: string | null;
  next: string;
  notice: string | null;
  sent: boolean;
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
      case 'channel_unavailable':
        return method === 'phone'
          ? t('account.errors.smsUnavailable')
          : t('account.errors.emailUnavailable');
      case 'invalid_code':
        return t('account.errors.invalidCode');
      case 'expired':
        return t('account.errors.codeExpired');
      case 'not_found':
        return t('account.errors.codeNotFound');
      case 'session':
        return t('account.errors.signupSession');
      case 'invalid':
        return t('account.errors.invalid');
      default:
        return null;
    }
  };
  const text = message();

  const heading =
    step === 'identifier'
      ? t('account.registerTitle')
      : step === 'code'
        ? t('account.registerCodeTitle')
        : t('account.registerFinishTitle');

  const lead =
    step === 'identifier'
      ? t('account.registerBody')
      : step === 'code'
        ? t('account.registerCodeBody', { identifier: identifier ?? '' })
        : t('account.registerFinishBody', { identifier: identifier ?? '' });

  return (
    <AuthShell
      heading={heading}
      lead={lead}
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

      {step === 'identifier' && (
        <>
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

          <form className={styles.form} action="/api/account/register/start" method="post">
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
                <small>{t('account.phoneVerifyHelp')}</small>
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
                <small>{t('account.emailCodeHelp')}</small>
              </label>
            )}
            <p className={styles.fieldHint}>{t('account.registerCodeHint')}</p>
            <button type="submit" className={styles.primaryAction}>
              {t('account.registerSendCode')}
            </button>
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          {sent && notice === null && (
            <p className={styles.fieldHint} role="status">
              {t('account.registerCodeSent')}
            </p>
          )}
          <form className={styles.form} action="/api/account/register/verify" method="post">
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
                autoFocus
              />
            </label>
            <p className={styles.fieldHint}>{t('account.registerCodeExpiry')}</p>
            <button type="submit" className={styles.primaryAction}>
              {t('account.registerVerifyCode')}
            </button>
          </form>
          <form action="/api/account/register/restart" method="post">
            <button type="submit" className={styles.linkButton}>
              {t('account.registerRestart')}
            </button>
          </form>
        </>
      )}

      {step === 'password' && (
        <form className={styles.form} action="/api/account/register" method="post">
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
          <p className={styles.fieldHint}>
            {t('account.passwordHelp', { min: CUSTOMER_PASSWORD_MIN_LENGTH })}
          </p>
          <button type="submit" className={styles.primaryAction}>
            {t('account.registerSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
