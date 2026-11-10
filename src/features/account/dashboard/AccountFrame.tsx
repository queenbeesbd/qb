'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '@/app/account-dashboard.module.css';

export type AccountSection = 'overview' | 'orders' | 'security';

/**
 * The frame every account screen is drawn in: a labelled sidebar and the canvas beside it.
 *
 * **Dealt as an app screen (2026-11-10).** The shop's own header sits above this frame, so the sidebar
 * names the person the account belongs to rather than repeating the mark a second time. The chrome
 * holds no colour - the active destination is a neutral pill - because the brand lavender is spent on
 * the one thing that carries data on these screens: an order's current step.
 *
 * The active section is passed in rather than read from the pathname: each page already knows which
 * screen it is, so the navigation needs no client router state and renders in the first byte.
 *
 * Every item here is a real destination in this tree, and the sign-out is the same guarded POST the
 * rest of the shop uses.
 */
export function AccountFrame({
  customer,
  csrfToken,
  active,
  children,
}: {
  customer: { email: string; displayName: string | null };
  /** Present whenever the customer is signed in; the sign-out form posts it. */
  csrfToken: string;
  active: AccountSection;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  const destinations: { section: AccountSection; href: string; label: TranslationKey }[] = [
    { section: 'overview', href: '/account', label: 'account.nav.overview' },
    { section: 'orders', href: '/account/orders', label: 'account.nav.orders' },
    { section: 'security', href: '/account/security', label: 'account.nav.security' },
  ];

  return (
    <div className={styles.dashboard}>
      <nav className={styles.sidebar} aria-label={t('account.nav.label')}>
        <div className={styles.sidebarTop}>
          <p className={styles.sidebarScope}>{t('account.sidebar.scope')}</p>
          <p className={styles.sidebarIdentity}>{customer.displayName ?? customer.email}</p>
        </div>

        <ul className={styles.nav}>
          {destinations.map((destination) => (
            <li key={destination.section}>
              <Link
                className={styles.navLink}
                href={destination.href}
                data-active={active === destination.section ? 'true' : 'false'}
                aria-current={active === destination.section ? 'page' : undefined}
              >
                {t(destination.label)}
              </Link>
            </li>
          ))}
          {/*
            The shop's contact page is a real destination outside this tree, and the one place a
            customer settles anything the dashboard cannot: a delivery, a change to an order in flight.
          */}
          <li>
            <Link className={styles.navLink} href="/contact">
              {t('account.nav.contact')}
            </Link>
          </li>
          {/* Sign-out joins the strip when the sidebar folds, so a phone never has to open a screen to leave. */}
          <li className={styles.phoneSignOut}>
            <form action="/api/account/logout" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <button type="submit" className={styles.signOutButton}>
                {t('account.signOut')}
              </button>
            </form>
          </li>
        </ul>

        <div className={styles.sidebarFoot}>
          <p className={styles.sidebarEmail}>{customer.email}</p>
          <form className={styles.signOut} action="/api/account/logout" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <button type="submit" className={styles.signOutButton}>
              {t('account.signOut')}
            </button>
          </form>
        </div>
      </nav>

      <div className={styles.canvas}>{children}</div>
    </div>
  );
}
