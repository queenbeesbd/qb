'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import { useCart } from '@/features/cart/useCart';
import { CartIcon, CloseIcon, MenuIcon, SearchIcon } from './icons';
import { LanguageToggle } from './LanguageToggle';
import styles from './Header.module.css';

/**
 * Compact responsive header. The mobile drawer traps focus, closes on Escape and
 * returns focus to its trigger so keyboard users are never stranded.
 *
 * Categories arrive as a server-resolved prop, so navigation can never drift
 * from the catalog the storefront actually serves.
 */
export function Header({ categories }: { categories: readonly CatalogCategory[] }) {
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

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.iconButton}
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
            <li>
              <Link href="/account">{t('nav.account')}</Link>
            </li>
          </ul>
        </nav>

        <form className={styles.search} role="search" action="/products" method="get">
          <label className="sr-only" htmlFor="site-search">
            {t('search.label')}
          </label>
          <input
            id="site-search"
            type="search"
            name="q"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            maxLength={80}
          />
          <button type="submit" aria-label={t('search.submit')}>
            <SearchIcon />
          </button>
        </form>

        <div className={styles.actions}>
          <LanguageToggle className={styles.languageButton} variant="compact" />
          <Link href="/cart" className={styles.iconButton} aria-label={cartLabel}>
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
        <div className={styles.drawer} id="site-menu" ref={drawerRef}>
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
              <li>
                <Link href="/account" onClick={closeMenu}>{t('nav.account')}</Link>
              </li>
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
