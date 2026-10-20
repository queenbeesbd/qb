'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';

/**
 * One-time credential redemption.
 *
 * A plain HTML form posting to `/api/account/recover`: no client state and no fetch, so the credential
 * and the new password never pass through React or reach a bundle. Every failure the server can return
 * is rendered as the same generic refusal - the page never tells a visitor whether a credential was
 * wrong, expired, already used or superseded, because it cannot know which and should not guess aloud.
 */
export function RecoverView({
  next,
  notice,
}: {
  next: string;
  /** `invalid` | `weak` | `throttled` | other, from the redirect. */
  notice: string | null;
}) {
  const { t } = useTranslation();

  const noticeText =
    notice === 'weak'
      ? t('account.errors.weakPassword')
      : notice === 'throttled'
        ? t('account.errors.throttled')
        : notice === 'invalid'
          ? t('account.errors.recoveryInvalid')
          : null;

  return (
    <div className={styles.narrow}>
      <header className={styles.header}>
        <h1>{t('account.recoverTitle')}</h1>
        <p className={styles.muted}>{t('account.recoverBody')}</p>
      </header>

      {noticeText !== null && (
        <p className={styles.notice} role="alert">
          {noticeText}
        </p>
      )}

      <form className={styles.form} action="/api/account/recover" method="post">
        <input type="hidden" name="next" value={next} />
        <label className={styles.field}>
          <span>{t('account.recoverCode')}</span>
          <input
            name="token"
            autoComplete="one-time-code"
            inputMode="text"
            spellCheck={false}
            required
            maxLength={43}
            pattern="[A-Za-z0-9_-]{43}"
          />
        </label>
        <label className={styles.field}>
          <span>{t('account.newPassword')}</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
          />
        </label>
        <button type="submit" className={styles.primaryAction}>
          {t('account.recoverSubmit')}
        </button>
      </form>

      <p className={styles.muted}>
        <strong>{t('account.noRecoveryTitle')}</strong>
      </p>
      <p className={styles.muted}>{t('account.noRecoveryBody')}</p>

      <p className={styles.muted}>
        <Link href={`/account/login?next=${encodeURIComponent(next)}`}>{t('account.loginSubmit')}</Link>
      </p>
    </div>
  );
}
