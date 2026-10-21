'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import { useCart } from '@/features/cart/useCart';
import { CartIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from './icons';
import styles from './Header.module.css';

type Customer = { email: string; displayName: string | null } | null;

/**
 * Compact responsive header. The mobile drawer traps focus, closes on Escape and
 * returns focus to its trigger so keyboard users are never stranded.
 *
 * The header is laid out in **three gantries** rather than one elastic grid, because a
 * single row cannot hold brand, seven navigation links, a search field and three actions
 * at 1024px without the search collapsing to an untypeable sliver (measured 15px in
 * Bangla before this change):
 *
 *   A  < 1024px          brand row (drawer trigger, brand, actions)
 *                          + a full-width search row beneath it
 *   B  1024-1199px       brand row (brand, actions + search trigger)
 *                          + a second row with the category navigation and the search
 *   C  >= 1200px         one row: brand, navigation, search, actions
 *
 * Search is a real field, not an icon, at every width where it is shown, and the narrow
 * layout trade is explicit: below 1200px it costs a second header row instead of
 * shrinking the field below a usable size.
 *
 * Categories and the customer arrive as server-resolved props, so navigation can never
 * drift from the catalog the storefront actually serves and the account control can never
 * disagree with the session the server read.
 */
export function Header({
  categories,
  customer,
}: {
  categories: readonly CatalogCategory[];
  customer: Customer;
}) {
  const { t, pick } = useTranslation();
  const { itemCount } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Any route change closes the drawer, including browser back/forward. This
   * uses React's documented "adjust state during render" pattern (a state
   * variable, not a ref) so no extra effect render is scheduled.
   */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusables = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const cartLabel = `${t('nav.cart')} (${itemCount})`;
  /**
   * The account control states which of the two honest states it is in: signed out
   * ("My account") or signed in ("My account: <name or email>"). Nothing else about the
   * customer is exposed here - no id, no session detail - and it is the same link to the
   * same account page in both states, which is what makes it safe to show at a glance.
   */
  const accountIdentity = customer === null ? null : (customer.displayName ?? customer.email);
  const accountLabel =
    accountIdentity === null ? t('nav.account') : t('nav.accountSignedInAs', { name: accountIdentity });

  const searchForm = (idPrefix: string, variant: 'inline' | 'row' | 'drawer') => (
    <form
      className={
        variant === 'inline' ? styles.search : variant === 'row' ? styles.searchRow : styles.drawerSearch
      }
      role="search"
      action="/products"
      method="get"
    >
      <label className="sr-only" htmlFor={`${idPrefix}-search`}>
        {t('search.label')}
      </label>
      <input
        id={`${idPrefix}-search`}
        type="search"
        name="q"
        {...(variant === 'drawer'
          ? {}
          : {
              value: term,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => setTerm(event.target.value),
            })}
        placeholder={t('search.placeholder')}
        autoComplete="off"
        maxLength={80}
      />
      <button type="submit" aria-label={t('search.submit')}>
        <SearchIcon width={18} height={18} />
      </button>
    </form>
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          ref={triggerRef}
          className={styles.menuTrigger}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <Link href="/" className={styles.brand} aria-label={t('common.brand')}>
          <img src="/brand/logo.svg" alt={t('common.brand')} width={173} height={40} />
        </Link>

        <nav className={styles.primaryNav} aria-label={t('nav.categories')}>
          <ul className={styles.navList}>
            <li>
              <Link href="/products">{t('nav.shop')}</Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/categories/${category.slug}`}>{pick(category.name)}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.searches}>
          {searchForm('site', 'row')}
          {searchForm('inline', 'inline')}
        </div>

        <div className={styles.actions}>
          <Link
            href="/account"
            className={`${styles.iconButton} ${styles.accountButton}`}
            aria-label={accountLabel}
            title={accountLabel}
            data-signed-in={customer === null ? 'false' : 'true'}
            aria-current={pathname === '/account' ? 'page' : undefined}
          >
            <UserIcon />
            {customer !== null && <span className={styles.accountDot} aria-hidden="true" />}
          </Link>
          <Link href="/cart" className={styles.iconButton} aria-label={cartLabel} title={cartLabel}>
            <CartIcon />
            {itemCount > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div className={styles.drawer} id="site-menu" ref={drawerRef} role="dialog" aria-label={t('nav.menu')}>
          <div className={styles.drawerInner}>
            <form className={styles.drawerSearch} role="search" action="/products" method="get">
              <label className="sr-only" htmlFor="drawer-search">
                {t('search.label')}
              </label>
              <input
                id="drawer-search"
                type="search"
                name="q"
                placeholder={t('search.placeholder')}
                autoComplete="off"
                maxLength={80}
              />
              <button type="submit">{t('search.submit')}</button>
            </form>

            <ul className={styles.drawerList}>
              <li>
                <Link href="/products" onClick={closeMenu}>{t('nav.shop')}</Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`} onClick={closeMenu}>
                    {pick(category.name)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/checkout" onClick={closeMenu}>{t('cart.checkout')}</Link>
              </li>
            </ul>

            {/*
              The account link lives in the header action cluster at every width, so the
              drawer does not repeat it as a ninth item. It keeps the account section at the
              end instead, where the signed-in identity is stated in full.
            */}
            <div className={styles.drawerAccount}>
              <Link href="/account" onClick={closeMenu} className={styles.drawerAccountLink}>
                <UserIcon width={18} height={18} />
                <span>{accountLabel}</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
