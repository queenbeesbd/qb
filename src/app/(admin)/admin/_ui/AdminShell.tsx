'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../admin.module.css';
import { AdminIcon } from './icons';
import type { AdminNavGroup, AdminNavItem } from './nav';

export type AdminIdentity = {
  readonly displayName: string;
  readonly email: string;
  readonly roleCodes: readonly string[];
  readonly csrfToken: string;
};

const GROUP_ORDER: readonly AdminNavGroup[] = ['overview', 'commerce', 'customers', 'settings', 'system'];

const GROUP_KEYS: Record<AdminNavGroup, TranslationKey> = {
  overview: 'admin.nav.group.overview',
  commerce: 'admin.nav.group.commerce',
  customers: 'admin.nav.group.customers',
  settings: 'admin.nav.group.settings',
  system: 'admin.nav.group.system',
};

/**
 * The authenticated application shell.
 *
 * **Desktop** keeps a lavender rail and a hairline top bar. **Below 1024px** the rail is replaced by
 * a fixed bottom tab bar - the pattern the owner asked for, and the one a phone in a shop actually
 * supports: four ranked destinations plus a More sheet. There is no drawer and no hamburger, because
 * two mobile navigation models would each have to be learned and maintained.
 *
 * The More sheet is the only modal surface here, so it is the only place that traps focus: opening it
 * moves focus to its close control, Escape closes it, and closing returns focus to the More tab.
 * Sign-out is a native form post, so it works without JavaScript and is CSRF-checked by the same
 * guard as every other mutation.
 *
 * The destinations arrive already filtered by the session's permissions, so no tab can advertise a
 * refusal. This component is presentation only; every route re-checks its own permission.
 */
export function AdminShell({
  identity,
  items,
  children,
}: {
  identity: AdminIdentity;
  items: readonly AdminNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const trigger = moreButtonRef.current;
    sheetCloseRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (sheet === null) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, summary',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      // Return to the control that opened the sheet. Clicking a button does not focus it, so saving
      // `document.activeElement` would restore focus to <body>.
      trigger?.focus();
    };
  }, [moreOpen]);

  /*
   * A focused field must never sit underneath the fixed bottom bar.
   *
   * `scroll-padding-bottom` in globals.css asks the browser to clear the bar, but Chromium and Safari do
   * not always honour scroll padding when they reveal a focused control - the delivery amount and the
   * product description were both reported fully hidden. This measures the focused control against the
   * bar and scrolls only the overlap, so a field that is already visible never moves. One handler, on
   * the document, is what keeps every form on the surface covered; no editor gets its own.
   */
  useEffect(() => {
    const CLEARANCE_PX = 16;
    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      const bar = document.querySelector<HTMLElement>('[data-admin-bottom-nav]');
      // `display: none` above 1023px, so a desktop focus never moves the page.
      if (bar === null || bar.getClientRects().length === 0) return;
      const barTop = bar.getBoundingClientRect().top;
      const covered = target.getBoundingClientRect().bottom - (barTop - CLEARANCE_PX);
      if (covered <= 0) return;
      window.scrollBy(0, covered);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const active = items.find(
    (item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')),
  );

  const roleLabel =
    identity.roleCodes.length === 0
      ? t('admin.session.noRoles')
      : identity.roleCodes
          .map((code) => (code === 'owner' ? t('admin.session.roleOwner') : code))
          .join(', ');

  const initials = identity.displayName.trim().slice(0, 2).toUpperCase();

  const primaryTabs = [...items]
    .filter((item) => item.mobileRank !== undefined)
    .sort((a, b) => (a.mobileRank ?? 0) - (b.mobileRank ?? 0))
    .slice(0, 4);
  const primaryHrefs = new Set(primaryTabs.map((item) => item.href));
  const moreActive = active !== undefined && !primaryHrefs.has(active.href);
  const activeLabel = active === undefined ? t('admin.nav.overview') : t(active.labelKey);

  const renderNav = (onNavigate?: () => void) => (
    <nav className={styles.nav} aria-label={t('admin.nav.label')}>
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div className={styles.navGroup} key={group}>
            <p className={styles.navGroupLabel}>{t(GROUP_KEYS[group])}</p>
            {groupItems.map((item) => {
              const isActive = active?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <AdminIcon name={item.icon} className={styles.navIcon} />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#admin-main">
        {t('admin.skipToContent')}
      </a>
      <div className={styles.shell} data-admin-shell="">
        <aside id="admin-rail" className={styles.sidebar} aria-label={t('admin.nav.label')}>
          <div className={styles.drawerHeader}>
            <Link href="/admin" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true">
                <AdminMark />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandName}>QueenBee&apos;s</span>
                <span className={styles.brandArea}>{t('admin.title')}</span>
              </span>
            </Link>
          </div>
          {renderNav()}
          <div className={styles.sidebarFoot}>
            <Link href="/" target="_blank" rel="noreferrer">
              <AdminIcon name="storefront" />
              {t('admin.nav.storefront')}
            </Link>
          </div>
        </aside>

        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.topbarInner}>
              <Link href="/admin" className={`${styles.brand} ${styles.mobileBrand}`} aria-label={t('admin.nav.overview')}>
                <span className={styles.brandMark} aria-hidden="true">
                  <AdminMark />
                </span>
              </Link>
              <nav className={styles.breadcrumb} aria-label={t('admin.breadcrumbLabel')}>
                <span className={styles.breadcrumbRoot}>{t('admin.title')}</span>
                <span className={styles.breadcrumbSeparator} aria-hidden="true">
                  /
                </span>
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {activeLabel}
                </span>
              </nav>
              <span className={styles.topbarPageTitle} aria-hidden="true">
                {activeLabel}
              </span>
              <span className={styles.topbarSpacer} />
              <details className={styles.account}>
                <summary className={styles.accountSummary} aria-label={t('admin.account.menuLabel')}>
                  <span className={styles.accountAvatar} aria-hidden="true">
                    {initials}
                  </span>
                  <span className={styles.accountName}>{identity.displayName}</span>
                </summary>
                <div className={styles.accountPanel}>
                  <div>
                    <p className={styles.factValue}>{identity.displayName}</p>
                    <p className={styles.accountEmail}>{identity.email}</p>
                    <p className={styles.accountRole}>{roleLabel}</p>
                  </div>
                  <form action="/api/admin/session/logout" method="post">
                    <input type="hidden" name="csrf" value={identity.csrfToken} />
                    <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
                      <AdminIcon name="logout" />
                      {t('admin.session.signOut')}
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </header>

          <main id="admin-main" className={styles.content} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      <nav className={styles.bottomNav} aria-label={t('admin.nav.mobileLabel')} data-admin-bottom-nav>
        {primaryTabs.map((tab) => {
          const isActive = active?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-current={isActive ? 'page' : undefined}
            >
              <AdminIcon name={tab.icon} className={styles.tabIcon} width={22} height={22} />
              <span className={styles.tabLabel}>{t(tab.labelKey)}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className={moreActive ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={moreOpen}
          aria-controls="admin-more-sheet"
          onClick={() => setMoreOpen(true)}
        >
          <AdminIcon name="more" className={styles.tabIcon} width={22} height={22} />
          <span className={styles.tabLabel}>{t('admin.nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            className={styles.sheetBackdrop}
            aria-label={t('admin.nav.closeMenu')}
            onClick={() => setMoreOpen(false)}
            tabIndex={-1}
          />
          <div
            ref={sheetRef}
            id="admin-more-sheet"
            className={styles.moreSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-more-title"
          >
            <span className={styles.sheetGrabber} aria-hidden="true" />
            <div className={styles.sheetHead}>
              <h2 id="admin-more-title" className={styles.sheetTitle}>
                {t('admin.more.title')}
              </h2>
              <button
                ref={sheetCloseRef}
                type="button"
                className={styles.sheetClose}
                onClick={() => setMoreOpen(false)}
                aria-label={t('admin.nav.closeMenu')}
              >
                <AdminIcon name="close" />
              </button>
            </div>
            <div className={styles.sheetScroll}>
              {renderNav(() => setMoreOpen(false))}
              <div className={styles.sheetAccount}>
                <p className={styles.sheetAccountName}>{identity.displayName}</p>
                <p className={styles.sheetAccountMeta}>{identity.email}</p>
                <p className={styles.sheetAccountMeta}>{roleLabel}</p>
                <form action="/api/admin/session/logout" method="post">
                  <input type="hidden" name="csrf" value={identity.csrfToken} />
                  <button
                    type="submit"
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonWide}`}
                  >
                    <AdminIcon name="logout" />
                    {t('admin.session.signOut')}
                  </button>
                </form>
              </div>
              <Link href="/" target="_blank" rel="noreferrer" className={styles.sheetStorefront}>
                <AdminIcon name="storefront" />
                {t('admin.nav.storefront')}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The three-petal crown from the storefront mark, drawn small for the rail. */
function AdminMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 6c3 5 4.6 9 4.6 13.4 0 3.6-1.5 6.4-4.6 6.4s-4.6-2.8-4.6-6.4C15.4 15 17 11 20 6Z" fill="#C8B6FF" />
      <path d="M8.4 14.6c4.9 1 8.4 3.4 9.6 6.8 1.1 3.3-.4 5.8-3.4 6.6-2.9.9-5.3-.9-5.4-4.4-.1-3.2 1.4-6.4 2.9-7.9Z" fill="#F6B3CC" />
      <path d="M31.6 14.6c-4.9 1-8.4 3.4-9.6 6.8-1.1 3.3.4 5.8 3.4 6.6 2.9.9 5.3-.9 5.4-4.4.1-3.2-1.4-6.4-2.9-7.9Z" fill="#56358C" />
      <rect x="10" y="28" width="20" height="4" rx="2" fill="#F6B3CC" opacity="0.55" />
    </svg>
  );
}
