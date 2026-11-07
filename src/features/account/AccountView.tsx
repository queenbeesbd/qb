'use client';

import Link from 'next/link';

import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account.module.css';

/**
 * The result of an account-security action, as the server reports it on the redirect.
 *
 * One map, so a code the route can produce is either rendered with the right tone or is not produced at
 * all: `passwordChanged` and `emailConfirmSent` are confirmations, every other entry is a refusal.
 */
const NOTICES: Record<string, { key: TranslationKey; error: boolean }> = {
  passwordChanged: { key: 'account.notice.passwordChanged', error: false },
  wrongPassword: { key: 'account.notice.wrongPassword', error: true },
  weakPassword: { key: 'account.notice.weakPassword', error: true },
  passwordMismatch: { key: 'account.notice.passwordMismatch', error: true },
  passwordUnavailable: { key: 'account.notice.passwordUnavailable', error: true },
  throttled: { key: 'account.notice.throttled', error: true },
  emailConfirmSent: { key: 'account.notice.emailConfirmSent', error: false },
  emailWrongPassword: { key: 'account.notice.emailWrongPassword', error: true },
  emailInvalid: { key: 'account.notice.emailInvalid', error: true },
  emailSame: { key: 'account.notice.emailSame', error: true },
  emailTaken: { key: 'account.notice.emailTaken', error: true },
  emailThrottled: { key: 'account.notice.emailThrottled', error: true },
};

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
  notice,
}: {
  customer: { email: string; displayName: string | null } | null;
  /** Present only when signed in; every mutation on this page carries it. */
  csrfToken: string | null;
  /** A result code from a redirect, mapped by `NOTICES`; unknown codes are ignored. */
  notice: string | null;
}) {
  const { t } = useTranslation();
  const noticeEntry = notice === null ? undefined : NOTICES[notice];

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

      {noticeEntry !== undefined && (
        <p
          className={styles.notice}
          role={noticeEntry.error ? 'alert' : 'status'}
          style={{ marginBottom: '1rem' }}
        >
          {t(noticeEntry.key, { min: CUSTOMER_PASSWORD_MIN_LENGTH })}
        </p>
      )}

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
          Security lives on the account page (ADR 0030). Both forms post natively with the session-bound
          CSRF token; the password is never held in React state and never sent anywhere but this origin.
          The one-time code the shop reads out is still offered below, for a customer who cannot reach
          the inbox the recovery link went to.
        */}
        {csrfToken !== null && (
          <>
            <section className={styles.accountCard}>
              <div className={styles.accountCardHead}>
                <h2>{t('account.changePasswordTitle')}</h2>
              </div>
              <p className={styles.muted}>{t('account.changePasswordBody')}</p>
              <form className={styles.form} action="/api/account/password" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <label className={styles.field}>
                  <span>{t('account.currentPassword')}</span>
                  <input
                    type="password"
                    name="currentPassword"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                  />
                </label>
                <div className={styles.fieldPair}>
                  <label className={styles.field}>
                    <span>{t('account.newPassword')}</span>
                    <input
                      type="password"
                      name="newPassword"
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
                <button type="submit" className={styles.secondaryButton}>
                  {t('account.changePasswordSubmit')}
                </button>
              </form>
            </section>

            <section className={styles.accountCard}>
              <div className={styles.accountCardHead}>
                <h2>{t('account.changeEmailTitle')}</h2>
              </div>
              <p className={styles.muted}>{t('account.changeEmailBody')}</p>
              <form className={styles.form} action="/api/account/email" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <label className={styles.field}>
                  <span>{t('account.newEmail')}</span>
                  <input
                    type="email"
                    name="newEmail"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder={t('account.emailPlaceholder')}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('account.currentPassword')}</span>
                  <input
                    type="password"
                    name="currentPassword"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                  />
                </label>
                <p className={styles.fieldHint}>{t('account.emailHelp')}</p>
                <button type="submit" className={styles.secondaryButton}>
                  {t('account.changeEmailSubmit')}
                </button>
              </form>
            </section>
          </>
        )}

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
