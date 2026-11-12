'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../qbpanel.module.css';
import { AdminIcon } from './icons';
import type { AdminNavGroup, AdminNavItem } from './nav';
import { ColdStartBackGuard } from './ColdStartBackGuard';
import { panelParent } from './panel-up';

export type AdminIdentity = {
  readonly displayName: string;
  readonly email: string;
  readonly roleCodes: readonly string[];
  readonly csrfToken: string;
};

const GROUP_ORDER: readonly AdminNavGroup[] = [
  'overview',
  'commerce',
  'storefront',
  'customers',
  'settings',
  'system',
];

const GROUP_KEYS: Record<AdminNavGroup, TranslationKey> = {
  overview: 'admin.nav.group.overview',
  commerce: 'admin.nav.group.commerce',
  storefront: 'admin.nav.group.storefront',
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

  /*
   * The current destination is the **most specific** match, not the first one in the list.
   *
   * `/qbpanel/catalog/brands` starts with `/qbpanel/catalog/`, so a plain `find` returned Products for
   * every brand route and lit the wrong rail item. An exact match wins outright; otherwise the longest
   * prefix wins, which is what makes a nested destination beat its parent.
   */
  const active =
    items.find((item) => pathname === item.href) ??
    items
      .filter((item) => item.href !== '/qbpanel' && pathname.startsWith(item.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0];

  const roleLabel =
    identity.roleCodes.length === 0
      ? t('admin.session.noRoles')
      : identity.roleCodes
          .map((code) => (code === 'owner' ? t('admin.session.roleOwner') : code))
          .join(', ');

  /*
   * The surface names the role it belongs to (owner direction, 2026-11-12): with a moderator account the
   * shell said "Owner admin" for everyone, which was a false label on a screen that no longer belongs to
   * one role.
   */
  const surfaceLabel = identity.roleCodes.includes('owner')
    ? t('admin.title')
    : t('admin.titleModerator');

  /*
   * The page's own parent, not the browser's previous entry (owner report, 2026-11-12). A panel opened
   * from a bookmark, a link or the Android shell has no history behind it, and "back" then left the site
   * or closed the app. This is a route fact, so it is the same on every surface.
   */
  const parentHref = panelParent(pathname);

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
            <Link href="/qbpanel" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true">
                <AdminBrandMark />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandName}>QueenBee&apos;s</span>
                <span className={styles.brandArea}>{surfaceLabel}</span>
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

        <ColdStartBackGuard parentHref={parentHref} />
      <div className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.topbarInner}>
              <Link href="/qbpanel" className={`${styles.brand} ${styles.mobileBrand}`} aria-label={t('admin.nav.overview')}>
                <span className={styles.brandMark} aria-hidden="true">
                  <AdminBrandMark />
                </span>
              </Link>
              {/*
                A real link to the parent route, drawn on every page except the overview. It is what
                the browser's back button is not allowed to be: always present, always in-app, and never
                dependent on where the owner came from.
              */}
              {parentHref !== null && (
                <Link
                  className={styles.topbarBack}
                  href={parentHref}
                  aria-label={t('admin.nav.back')}
                  data-admin-back=""
                >
                  <AdminIcon name="arrowLeft" width={16} height={16} />
                </Link>
              )}
              <nav className={styles.breadcrumb} aria-label={t('admin.breadcrumbLabel')}>
                <span className={styles.breadcrumbRoot}>{surfaceLabel}</span>
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
                  <form action="/api/qbpanel/session/logout" method="post">
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
                <form action="/api/qbpanel/session/logout" method="post">
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

/**
 * The owner's own logo, in the same circular box the storefront header draws.
 *
 * The rail carried a hand-drawn crown until 2026-11-07 - the last surface still showing the retired
 * mark. The real logo is the identity everywhere: a square upload centre-cropped to a circle, so the
 * rail and the storefront cannot drift apart. The accessible name is on the link, not the image.
 */
function AdminBrandMark() {
  return (
    <img
      src="/brand/logo-round-192.jpeg"
      srcSet="/brand/logo-round-96.jpeg 96w, /brand/logo-round-192.jpeg 192w"
      sizes="40px"
      alt=""
      width={40}
      height={40}
    />
  );
}
