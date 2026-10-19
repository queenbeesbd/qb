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

const GROUP_ORDER: readonly AdminNavGroup[] = ['overview', 'commerce', 'customers', 'system'];

const GROUP_KEYS: Record<AdminNavGroup, TranslationKey> = {
  overview: 'admin.nav.group.overview',
  commerce: 'admin.nav.group.commerce',
  customers: 'admin.nav.group.customers',
  system: 'admin.nav.group.system',
};

/**
 * The authenticated application shell.
 *
 * Desktop: a persistent rail and a hairline top bar. Below 1024px the rail becomes a drawer,
 * opened from the top bar. The drawer is the only modal surface here, so it is the only place that
 * traps focus: opening it moves focus to the close control, Escape closes it, and closing returns
 * focus to the trigger. Sign-out is a native form post, so it works without JavaScript and is
 * CSRF-checked by the same guard as every other mutation.
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
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
      // Return to the control that opened the drawer, whichever input opened it. Clicking a button
      // does not focus it, so saving `document.activeElement` would restore focus to <body>.
      trigger?.focus();
    };
  }, [open]);

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

  const nav = (
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
                  onClick={() => setOpen(false)}
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
      <div className={styles.shell}>
        <div
          ref={dialogRef}
          id="admin-navigation"
          className={open ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
          role={open ? 'dialog' : undefined}
          aria-modal={open ? true : undefined}
          aria-label={open ? t('admin.nav.label') : undefined}
        >
          <div className={styles.drawerHeader}>
            <Link href="/admin" className={styles.brand} onClick={() => setOpen(false)}>
              <span className={styles.brandMark} aria-hidden="true">
                <AdminMark />
              </span>
              <span className={styles.brandText}>
                <span className={styles.brandName}>QueenBee&apos;s</span>
                <span className={styles.brandArea}>{t('admin.title')}</span>
              </span>
            </Link>
            <button
              ref={closeRef}
              type="button"
              className={`${styles.drawerClose} ${styles.mobileOnly}`}
              onClick={() => setOpen(false)}
              aria-label={t('admin.nav.closeMenu')}
            >
              <AdminIcon name="close" />
            </button>
          </div>
          {nav}
          <div className={styles.sidebarFoot}>
            <Link href="/" target="_blank" rel="noreferrer">
              <AdminIcon name="storefront" />
              {t('admin.nav.storefront')}
            </Link>
          </div>
        </div>

        {open && (
          <button
            type="button"
            className={styles.backdrop}
            aria-label={t('admin.nav.closeMenu')}
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
        )}

        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.topbarInner}>
              <button
                ref={triggerRef}
                type="button"
                className={`${styles.iconButton} ${styles.menuButton}`}
                aria-expanded={open}
                aria-controls="admin-navigation"
                aria-label={t('admin.nav.openMenu')}
                onClick={() => setOpen(true)}
              >
                <AdminIcon name="menu" />
              </button>
              <nav className={styles.breadcrumb} aria-label={t('admin.breadcrumbLabel')}>
                <span className={styles.breadcrumbRoot}>{t('admin.title')}</span>
                <span className={styles.breadcrumbSeparator} aria-hidden="true">
                  /
                </span>
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {active === undefined ? t('admin.nav.overview') : t(active.labelKey)}
                </span>
              </nav>
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
    </div>
  );
}

/** The three-petal crown from the storefront mark, drawn small for the rail. */
function AdminMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 6c3 5 4.6 9 4.6 13.4 0 3.6-1.5 6.4-4.6 6.4s-4.6-2.8-4.6-6.4C15.4 15 17 11 20 6Z" fill="#A680FF" />
      <path d="M8.4 14.6c4.9 1 8.4 3.4 9.6 6.8 1.1 3.3-.4 5.8-3.4 6.6-2.9.9-5.3-.9-5.4-4.4-.1-3.2 1.4-6.4 2.9-7.9Z" fill="#F6B3CC" />
      <path d="M31.6 14.6c-4.9 1-8.4 3.4-9.6 6.8-1.1 3.3.4 5.8 3.4 6.6 2.9.9 5.3-.9 5.4-4.4.1-3.2-1.4-6.4-2.9-7.9Z" fill="#56358C" />
      <rect x="10" y="28" width="20" height="4" rx="2" fill="#F6B3CC" opacity="0.55" />
    </svg>
  );
}
