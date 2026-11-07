'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * Customer registration form.
 *
 * Email and password only. A phone number is not collected here: it is optional contact information and
 * capturing it at sign-up would collect personal data the account does not need yet. There is **no email
 * verification step and no verification mail** (ADR 0012, unchanged by ADR 0030): the account works the
 * moment it is created, and mail is sent only for a deliberate account-security action.
 */
export function RegisterView({
  next,
  notice,
}: {
  next: string;
  notice: string | null;
}) {
  const { t } = useTranslation();

  const message = (): string | null => {
    switch (notice) {
      case 'invalid_email':
        return t('account.errors.invalidEmail');
      case 'weak_password':
        return t('account.errors.weakPassword', { min: PASSWORD_MIN_LENGTH });
      case 'mismatch':
        return t('account.errors.passwordMismatch');
      case 'email_taken':
        return t('account.errors.emailTaken');
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

      <form className={styles.form} action="/api/account/register" method="post">
        <input type="hidden" name="next" value={next} />
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
        <div className={styles.fieldPair}>
          <label className={styles.field}>
            <span>{t('account.password')}</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
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
        <p className={styles.fieldHint}>{t('account.passwordHelp', { min: PASSWORD_MIN_LENGTH })}</p>
        <button type="submit" className={styles.primaryAction}>
          {t('account.registerSubmit')}
        </button>
      </form>
    </AuthShell>
  );
}
