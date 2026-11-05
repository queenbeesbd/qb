'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CheckIcon } from '@/components/icons';
import styles from '@/app/account.module.css';

/**
 * The account landing surface.
 *
 * **Redesigned 2026-10-23.** It was a single card of definition rows followed by a paragraph explaining
 * that no self-service password recovery exists - honest, but it answered a question nobody had asked
 * yet and gave a signed-in customer nothing to do. It is now an account hub: who you are, where your
 * orders are, how to reach the shop about the password, and sign out.
 *
 * Two honest states and nothing else: signed in, or not. Every value comes from the session the server
 * resolved; nothing is stored or derived here.
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

  /*
   * Signed out, the page uses the same two-panel frame as the sign-in form rather than a lone card on an
   * empty page: it is the same decision being made, and a customer arriving here from the account icon
   * should not have to recognise a different layout to take it.
   */
  if (customer === null) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authShell}>
          <aside className={styles.authAside}>
            <Link href="/" className={styles.authBrand} aria-label={t('common.brand')}>
              <span className={styles.authBrandMark} aria-hidden="true">
              <img
                src="/brand/logo-round-192.jpeg"
                srcSet="/brand/logo-round-96.jpeg 96w, /brand/logo-round-192.jpeg 192w"
                sizes="48px"
                alt=""
                width={48}
                height={48}
              />
            </span>
            </Link>
            <h2 className={styles.authAsideTitle}>{t('account.authSignInAside')}</h2>
          </aside>
          <section className={styles.authPanel} aria-labelledby="account-signed-out">
            <header className={styles.authHeader}>
              <h1 id="account-signed-out">{t('account.notSignedInTitle')}</h1>
              <p className={styles.muted}>{t('account.notSignedInBody')}</p>
            </header>
            <div className={styles.authChoice}>
              <Link className={styles.primaryAction} href="/account/login?next=/account">
                {t('account.signIn')}
              </Link>
              <Link className={styles.secondaryAction} href="/account/register?next=/account">
                {t('account.register')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.pageKicker}>{t('account.signedInAs')}</p>
        <h1>{customer.displayName ?? customer.email}</h1>
        {customer.displayName !== null && <p className={styles.muted}>{customer.email}</p>}
      </header>

      <div className={styles.accountGrid}>
        {/*
          Orders lead because it is the only thing a returning customer comes here for. The card states
          what the page will show rather than a count it has not read.
        */}
        <section className={styles.accountCard}>
          <div className={styles.accountCardHead}>
            <h2>{t('account.orders')}</h2>
          </div>
          <p className={styles.muted}>{t('account.ordersBody')}</p>
          <Link className={styles.cardAction} href="/account/orders">
            {t('account.ordersAction')}
          </Link>
        </section>

        <section className={styles.accountCard}>
          <div className={styles.accountCardHead}>
            <h2>{t('account.detailsTitle')}</h2>
          </div>
          <dl className={styles.facts}>
            {customer.displayName !== null && (
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
        </section>

        {/*
          The recovery limitation (ADR 0012 / ADR 0019) is stated where a customer would look for a
          password control, and it names the one route that exists: a one-time code the shop reads out
          after verifying them by phone. The contact channel itself is still absent by design, because
          the shop publishes no phone number or address yet - an owner-data gap, not a code gap.
        */}
        <section className={styles.accountCard}>
          <div className={styles.accountCardHead}>
            <h2>{t('account.passwordTitle')}</h2>
          </div>
          <p className={styles.muted}>{t('account.noRecoveryBody')}</p>
          <p className={styles.cardNote}>
            <span className={styles.cardNoteIcon} aria-hidden="true">
              <CheckIcon width={14} height={14} />
            </span>
            {t('account.recoveryContactNote')}
          </p>
          <Link className={styles.cardAction} href="/account/recover">
            {t('account.recoverTitle')}
          </Link>
        </section>

        <section className={styles.accountCardQuiet}>
          <div className={styles.accountCardHead}>
            <h2>{t('account.sessionTitle')}</h2>
          </div>
          <p className={styles.muted}>{t('account.sessionBody')}</p>
          {csrfToken && (
            <form action="/api/account/logout" method="post" className={styles.inlineForm}>
              <input type="hidden" name="csrf" value={csrfToken} />
              <button type="submit" className={styles.secondaryButton}>
                {t('account.signOut')}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
