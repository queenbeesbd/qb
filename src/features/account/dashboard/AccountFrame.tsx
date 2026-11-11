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
  customer: { email: string | null; phone: string | null; displayName: string | null };
  /** Present whenever the customer is signed in; the sign-out form posts it. */
  csrfToken: string;
  active: AccountSection;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const identity = customer.displayName ?? customer.phone ?? customer.email ?? t('account.sidebar.member');

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
          <p className={styles.sidebarIdentity}>{identity}</p>
        </div>

        {/*
          Three destinations, one row on a phone: the studied screens' segmented track (48px, a
          sunken field with the active item on white) rather than a list of bordered chips, which
          wrapped to two lines at 390px and read as a toolbar of equal buttons. Contact is a desktop
          item; on a phone the shop's footer already carries it, and a fourth cell would push the
          track past the screen.
        */}
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
          <li className={styles.navContact}>
            <Link className={styles.navLink} href="/contact">
              {t('account.nav.contact')}
            </Link>
          </li>
        </ul>

        {/*
          On a phone there is no sidebar foot, so the identity and the way out sit directly under the
          track: who you are on the left, one plain "Sign out" on the right, on a 40px row that needs
          no opening and no second screen.
        */}
        <div className={styles.phoneIdentity}>
          <span className={styles.phoneIdentityName}>
            {identity}
          </span>
          <form action="/api/account/logout" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <button type="submit" className={styles.signOutButton}>
              {t('account.signOut')}
            </button>
          </form>
        </div>

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
