'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';

/**
 * The account landing surface.
 *
 * Two honest states and nothing else: signed in (who you are, where your orders are, sign out) or not
 * signed in (sign in, create an account). It states plainly that **no self-service password recovery
 * exists** (ADR 0012) rather than offering a link that leads nowhere.
 */
export function AccountView({
  customer,
  csrfToken,
}: {
  customer: { email: string; displayName: string | null } | null;
  /** Present only when signed in; the sign-out form is the only mutation on this page. */
  csrfToken: string | null;
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('account.title')}</h1>
      </header>

      {customer === null ? (
        <section className={styles.card}>
          <h2>{t('account.notSignedInTitle')}</h2>
          <p className={styles.muted}>{t('account.notSignedInBody')}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/account/login?next=/account">
              {t('account.signIn')}
            </Link>
            <Link className={styles.secondaryAction} href="/account/register?next=/account">
              {t('account.register')}
            </Link>
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          <h2>{t('account.signedInAs')}</h2>
          <dl className={styles.facts}>
            <div>
              <dt>{t('account.email')}</dt>
              <dd>{customer.email}</dd>
            </div>
            {customer.displayName && (
              <div>
                <dt>{t('account.displayName')}</dt>
                <dd>{customer.displayName}</dd>
              </div>
            )}
          </dl>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/account/orders">
              {t('account.orders')}
            </Link>
            {csrfToken && (
              <form action="/api/account/logout" method="post" className={styles.inlineForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <button type="submit" className={styles.secondaryButton}>
                  {t('account.signOut')}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h2>{t('account.noRecoveryTitle')}</h2>
        <p className={styles.muted}>{t('account.noRecoveryBody')}</p>
      </section>
    </div>
  );
}
