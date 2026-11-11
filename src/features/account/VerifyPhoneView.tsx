'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';
import { AuthShell } from './AuthShell';

/**
 * The page the six-digit registration code is entered on.
 *
 * Two honest states: the code was just sent (after registration), or the page was reached later with a
 * number in the query string. The account already works, so **Skip for now** is always beside the form
 * - verification confirms the number, it does not gate the account. Any failure is one sentence: a code
 * that expired, was used or was never sent is indistinguishable.
 */
export function VerifyPhoneView({
  phone,
  next,
  sent,
  verified,
  notice,
}: {
  phone: string | null;
  next: string;
  sent: boolean;
  verified: boolean;
  notice: 'invalid' | 'throttled' | null;
}) {
  const { t } = useTranslation();
  const phoneLabel = phone ?? t('account.phone');

  return (
    <AuthShell
      heading={t('account.verifyPhoneTitle')}
      lead={t('account.verifyPhoneBody', { phone: phoneLabel })}
      asideTitle={t('account.authSignInAside')}
      footer={
        <p className={styles.muted}>
          <Link href={next}>{t('account.verifyPhoneSkip')}</Link>
        </p>
      }
    >
      {verified ? (
        <p className={styles.notice} role="status">
          {t('account.verifyPhoneDone')}
        </p>
      ) : (
        <>
          {notice !== null && (
            <p className={styles.notice} role="alert">
              {notice === 'throttled'
                ? t('account.errors.throttled')
                : t('account.verifyPhoneInvalid')}
            </p>
          )}
          {sent && notice === null && (
            <p className={styles.fieldHint} role="status">
              {t('account.verifyPhoneSent')}
            </p>
          )}
          {phone !== null && (
            <form className={styles.form} action="/api/account/verify-phone" method="post">
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="next" value={next} />
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
                />
              </label>
              <p className={styles.fieldHint}>{t('account.verifyPhoneHint')}</p>
              <button type="submit" className={styles.primaryAction}>
                {t('account.verifyPhoneSubmit')}
              </button>
            </form>
          )}
        </>
      )}
    </AuthShell>
  );
}
