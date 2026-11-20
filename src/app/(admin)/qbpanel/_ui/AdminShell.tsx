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
import { NativeBackButton } from './NativeBackButton';
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
 * **Desktop** keeps a persistent, grouped rail and a hairline top bar. **Below 1024px** the rail is
 * replaced by two phone surfaces that answer different questions: a fixed bottom bar carries up to four
 * ranked destinations (Overview, Orders, Products, Customers) plus a separate **Menu** control, and the
 * Menu opens a side drawer holding the same grouped navigation the rail renders, the signed-in account,
 * sign out and the storefront link. One information architecture, three placements: only the container
 * changes with the viewport, never the groups, the order or the labels.
 *
 * The drawer is the only modal surface here, so it is the only place that traps focus: opening it moves
 * focus to its close control, Escape closes it, the page behind is locked, a resize past 1023px closes
 * it, and closing returns focus to the Menu control. Sign-out is a native form post, so it works without
 * JavaScript and is CSRF-checked by the same guard as every other mutation.
 *
 * The destinations arrive already filtered by the session's permissions, so no entry can advertise a
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);


  useEffect(() => {
    if (!menuOpen) return;
    const trigger = menuButtonRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    drawerCloseRef.current?.focus();
    /*
     * The owner opens this to reach a destination, so the row for the page they are already on is
     * brought into view: twenty-odd rows in a 100dvh panel otherwise start at the top every time. The
     * body is locked first, so revealing the row can only scroll the drawer.
     */
    drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'center' });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = drawerRef.current;
      if (drawer === null) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
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
      // Return to the control that opened the drawer. Clicking a button does not focus it, so saving
      // `document.activeElement` would restore focus to <body>.
      trigger?.focus();
    };
  }, [menuOpen]);
  const closeForNavigation = (): void => setMenuOpen(false);


  /*
   * The drawer is a phone surface. The rail returns at 1024px, and an open drawer left behind would
   * cover a workspace that already has its own navigation - so a resize past the breakpoint closes it.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (): void => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [menuOpen]);

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
  // The current page lives in the drawer when the bar ranks no destination for it, so Menu carries the
  // current-route mark rather than leaving the bar looking like it is on another tab.
  const menuCurrent = active !== undefined && !primaryHrefs.has(active.href);
  const activeLabel = active === undefined ? t('admin.nav.overview') : t(active.labelKey);

  const renderNav = (onNavigate?: () => void) => (
    <nav className={styles.nav} aria-label={t('admin.nav.label')} data-admin-nav="">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div className={styles.navGroup} key={group} data-admin-nav-group={group}>
            <p className={styles.navGroupLabel} data-admin-nav-label="">
              {t(GROUP_KEYS[group])}
            </p>
            {groupItems.map((item) => {
              const isActive = active?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
                  data-admin-nav-link=""
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
        <NativeBackButton parentHref={parentHref} />

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
        {/*
          One row: the ranked destinations, then the control that opens every other screen. They sit in
          the same white pill now (owner direction, 2026-11-21), so the separation is drawn rather than
          structural - a plain tab for a room the owner walks into, a filled `--admin-lavender-deep`
          pill for the door that opens the rest.
        */}
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
          ref={menuButtonRef}
          type="button"
          className={menuCurrent ? `${styles.menuPlate} ${styles.menuPlateCurrent}` : styles.menuPlate}
          aria-current={menuCurrent ? 'page' : undefined}
          aria-expanded={menuOpen}
          aria-controls="admin-menu-drawer"
          data-admin-menu-trigger=""
          onClick={() => setMenuOpen(true)}
        >
          <AdminIcon name="menu" className={styles.menuPlateIcon} width={20} height={20} />
          <span className={styles.menuPlateLabel}>{t('nav.menu')}</span>
        </button>
      </nav>

      {menuOpen && (
        <>
          <button
            type="button"
            className={styles.sheetBackdrop}
            aria-label={t('admin.nav.closeMenu')}
            onClick={() => setMenuOpen(false)}
            tabIndex={-1}
          />
          <div
            ref={drawerRef}
            id="admin-menu-drawer"
            className={styles.menuDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-menu-title"
            data-admin-nav-drawer=""
          >
            <div className={styles.sheetHead}>
              <h2 id="admin-menu-title" className={styles.sheetTitle}>
                {t('admin.more.title')}
              </h2>
              <button
                ref={drawerCloseRef}
                type="button"
                className={styles.sheetClose}
                onClick={() => setMenuOpen(false)}
                aria-label={t('admin.nav.closeMenu')}
              >
                <AdminIcon name="close" />
              </button>
            </div>
            <div className={styles.sheetScroll}>
              {/*
                The same identity the rail's brand row and the account popover carry: the owner's logo,
                the role-named surface, and who is signed in. It is what makes the drawer a place rather
                than a list of links.
              */}
              <div className={styles.drawerIdentity}>
                <span className={styles.brandMark} aria-hidden="true">
                  <AdminBrandMark />
                </span>
                <div className={styles.drawerIdentityText}>
                  <span className={styles.brandName}>QueenBee&apos;s</span>
                  <span className={styles.brandArea}>{surfaceLabel}</span>
                </div>
              </div>
              {renderNav(closeForNavigation)}
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
