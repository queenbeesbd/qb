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
          {/*
           * The optional display name leads when it exists, because that is what the customer
           * chose to be called and it is the one thing on this page that is not an email
           * address. It is shown here and in the header's account control - two purposeful
           * places - and nowhere else: it must not leak onto a page the customer did not ask
           * for it on. When it was never given, the email stands alone and no empty label is
           * printed (Phase 24 S-32 / X-13).
           */}
          <h2>
            {customer.displayName
              ? t('account.welcomeBack', { name: customer.displayName })
              : t('account.signedInAs')}
          </h2>
          <dl className={styles.facts}>
            {customer.displayName && (
              <div>
                <dt>{t('account.displayName')}</dt>
                <dd>{customer.displayName}</dd>
              </div>
            )}
            <div>
              <dt>{t('account.email')}</dt>
              <dd>{customer.email}</dd>
            </div>
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

      {/*
       * Recovery limitation (ADR 0012 / ADR 0019). The honest statement stays exactly as it
       * was - there is no self-service reset - but it no longer leaves the customer with no
       * next step: the store issues a one-time code after verifying them by phone. The
       * contact channel itself is still absent by design, because the store publishes no
       * phone number or address anywhere in this product yet; that is an owner-data gap,
       * recorded in the completion report of Phase 25 rather than invented here.
       */}
      <section className={styles.card}>
        <h2>{t('account.noRecoveryTitle')}</h2>
        <p className={styles.muted}>{t('account.noRecoveryBody')}</p>
        <p className={styles.muted}>{t('account.recoveryContactNote')}</p>
      </section>
    </div>
  );
}
