'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '../../admin.module.css';

export type LoginError = 'invalid' | 'throttled' | null;

/**
 * The sign-in form.
 *
 * A plain form post, so sign-in works without JavaScript. `autoComplete` is deliberate: a password
 * manager is the correct way to hold a long password, and refusing it would push people towards
 * shorter ones.
 *
 * The error text is one generic sentence for a wrong password, an unknown address and a disabled
 * account alike - the form must not become a way to discover which staff addresses exist. Throttling
 * gets its own message because it is actionable and discloses nothing about any account.
 */
export function LoginView({ error, next }: { error: LoginError; next: string }) {
  const { t } = useTranslation();

  return (
    <div className={styles.centered}>
      <div className={styles.card}>
        <h1>{t('admin.login.title')}</h1>
        <p className={styles.lede}>{t('admin.login.body')}</p>

        {error !== null ? (
          <p className={`${styles.alert} ${styles.alertError}`} role="alert">
            {error === 'throttled' ? t('admin.login.throttled') : t('admin.login.failed')}
          </p>
        ) : null}

        <form className={styles.form} action="/api/admin/session/login" method="post">
          <input type="hidden" name="next" value={next} />
          <div className={styles.field}>
            <label htmlFor="login-email">{t('admin.login.email')}</label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder={t('admin.login.emailPlaceholder')}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="login-password">{t('admin.login.password')}</label>
            <input id="login-password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <button type="submit" className={styles.button}>
            {t('admin.login.submit')}
          </button>
        </form>

        <p className={styles.note} style={{ marginTop: 'var(--space-5)' }}>
          {t('admin.login.noSelfRegistration')}
        </p>
        <p className={styles.links}>
          <Link href="/admin/redeem">{t('admin.login.redeemLink')}</Link>
        </p>
      </div>
    </div>
  );
}
