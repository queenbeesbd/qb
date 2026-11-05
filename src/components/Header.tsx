'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import { useCart } from '@/features/cart/useCart';
import { CartIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from './icons';
import styles from './Header.module.css';

type Customer = { email: string; displayName: string | null } | null;

/**
 * The storefront header.
 *
 * **Desktop (from 1024px) is unchanged:** one row in reading order - logo, category links, then search
 * and account controls pushed to the far end, all centred vertically on the bar.
 *
 * **A phone gets the shop's three-zone bar** (owner direction, 2026-11-05): the menu control on the
 * left, the logo centred in the bar, the cart on the right. The menu opens a drawer carrying every
 * destination - home, the whole catalog, categories (including each department), brands, cart and
 * account - because a phone header has room for three things and navigation is the one that needs a
 * place to live. The fixed bottom tab bar is unchanged and still the primary navigation: the drawer is
 * the long tail (a specific department, the account page), not a second copy of the tabs.
 *
 * The drawer is a real modal: focus moves into it, Tab is trapped, Escape closes it, the page behind is
 * locked, and focus returns to the control that opened it. A menu a keyboard cannot leave is not a menu.
 *
 * Categories and the customer arrive as server-resolved props, so navigation can never drift from the
 * catalog the storefront actually serves and the account control can never disagree with the session
 * the server read.
 */
export function Header({
  categories,
  customer,
}: {
  /** Every department, for the phone drawer. The desktop row names the shop's main surfaces instead. */
  categories: readonly CatalogCategory[];
  customer: Customer;
}) {
  const { t, pick } = useTranslation();
  const { itemCount } = useCart();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  /** Focus the first destination, trap Tab inside the sheet, and close on Escape. */
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    if (drawer === null) return;

    const focusable = (): HTMLElement[] =>
      [...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
        (element) => element.offsetParent !== null,
      );

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, closeMenu]);

  /** The drawer is a phone surface: a resize past 1024px closes it rather than leaving it orphaned. */
  useEffect(() => {
    if (!menuOpen) return;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (): void => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [menuOpen]);

  const cartLabel = `${t('nav.cart')} (${itemCount})`;
  const accountIdentity = customer === null ? null : (customer.displayName ?? customer.email);
  const accountLabel =
    accountIdentity === null ? t('nav.account') : t('nav.accountSignedInAs', { name: accountIdentity });

  /**
   * A section is current for its own route and everything beneath it.
   *
   * A destination that carries a query (Offers, New In) never claims to be current: the path alone
   * cannot tell which sort a listing is showing, and a link that looked current on every listing would
   * mark three tabs at once.
   */
  const isCurrent = (href: string) => {
    if (href.includes('?')) return false;
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  };

  const searchField = (id: string, variant: 'inline' | 'row') => (
    <form
      className={variant === 'inline' ? styles.search : styles.mobileSearch}
      role="search"
      action="/products"
      method="get"
    >
      <label className="sr-only" htmlFor={id}>
        {t('search.label')}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        placeholder={t('search.placeholder')}
        autoComplete="off"
        maxLength={80}
      />
      <button type="submit" aria-label={t('search.submit')}>
        <SearchIcon width={18} height={18} />
      </button>
    </form>
  );

  const drawerLinks: { href: string; label: string }[] = [
    { href: '/', label: t('nav.home') },
    { href: '/products', label: t('nav.shop') },
    { href: '/categories', label: t('nav.allCategories') },
    ...categories.map((category) => ({
      href: `/categories/${category.slug}`,
      label: pick(category.name) ?? category.slug,
    })),
    { href: '/brands', label: t('nav.brands') },
    { href: '/cart', label: t('nav.cart') },
    { href: '/account', label: t('nav.account') },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.iconButton} ${styles.menuTrigger}`}
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="phone-menu"
          aria-label={t('nav.openMenu')}
        >
          <MenuIcon width={22} height={22} />
        </button>

        <Link href="/" className={styles.brand} aria-label={t('common.brand')}>
          {/*
            The owner's own logo, in a circular box (owner direction, 2026-11-05).

            The box is the rule, not the artwork: whatever square image the shop supplies is cropped to
            the middle of a circle with `object-fit: cover`, so a square or a wide upload fills the mark
            instead of being letterboxed inside it. The generated files come from `npm run assets:brand`
            (96 and 192px), and the accessible name is on the link rather than the image.
          */}
          <span className={styles.brandMark} aria-hidden="true">
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

        {/*
          The desktop row, in the order a shopper moves: where am I (Home), what is everything
          (Shop), how do I narrow it (Categories, Brands), what is cheap now (Offers), what is new
          (New In). The department shortcuts moved into the drawer and the category index, where the
          whole list is visible; six stable destinations read faster than a row whose first four
          words depend on which departments happen to be busiest this month.
        */}
        <nav className={styles.primaryNav} aria-label={t('nav.primary')}>
          <ul className={styles.navList}>
            <li>
              <Link href="/" aria-current={isCurrent('/') ? 'page' : undefined}>
                {t('nav.home')}
              </Link>
            </li>
            <li>
              <Link href="/products" aria-current={isCurrent('/products') ? 'page' : undefined}>
                {t('nav.shop')}
              </Link>
            </li>
            <li>
              <Link href="/categories" aria-current={isCurrent('/categories') ? 'page' : undefined}>
                {t('nav.categories')}
              </Link>
            </li>
            <li>
              <Link href="/brands" aria-current={isCurrent('/brands') ? 'page' : undefined}>
                {t('nav.brands')}
              </Link>
            </li>
            <li>
              <Link href="/products?sort=price-asc">{t('nav.offers')}</Link>
            </li>
            <li>
              <Link href="/products?sort=newest">{t('nav.newIn')}</Link>
            </li>
          </ul>
        </nav>

        <div className={styles.actions}>
          {searchField('site-search', 'inline')}
          <Link
            href="/products#catalog-search"
            className={styles.compactSearch}
            aria-label={t('search.label')}
            title={t('search.label')}
          >
            <SearchIcon />
          </Link>
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

      {searchField('mobile-search', 'row')}

      {menuOpen && (
        <div className={styles.drawerLayer}>
          <button
            type="button"
            className={styles.scrim}
            tabIndex={-1}
            aria-hidden="true"
            onClick={closeMenu}
          />
          <div
            id="phone-menu"
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menuTitle')}
          >
            <div className={styles.drawerHead}>
              <span className={styles.drawerTitle}>{t('nav.menuTitle')}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={closeMenu}
                aria-label={t('nav.closeMenu')}
              >
                <CloseIcon width={20} height={20} />
              </button>
            </div>
            <nav aria-label={t('nav.primary')}>
              <ul className={styles.drawerList}>
                {drawerLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={styles.drawerLink}
                      aria-current={isCurrent(link.href) ? 'page' : undefined}
                      /*
                       * The sheet closes as the destination is chosen, not in an effect watching the
                       * pathname: a sheet that waited for a route change would stay open if the tap
                       * landed on the current page.
                       */
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
