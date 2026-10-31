'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import { useCart } from '@/features/cart/useCart';
import { CartIcon, SearchIcon, UserIcon } from './icons';
import styles from './Header.module.css';

type Customer = { email: string; displayName: string | null } | null;

/**
 * The storefront header.
 *
 * **One row, navigation beside the brand (2026-10-23 redesign).** On desktop the header runs in reading
 * order: the logo, the category navigation immediately after it, then the search field and account
 * controls pushed to the far end. The links are **centred vertically** on the bar - each is a 40px
 * control, so the row reads as one axis rather than as text sitting on a baseline. They keep their own
 * horizontal padding and a filled soft background on hover and on the current section, so the row has
 * rhythm instead of six words crowded against the logo.
 *
 * **The mobile drawer is gone.** Below 1024px the navigation moved to the fixed bottom tab bar
 * (`StorefrontTabBar`), which is the pattern the owner asked for and the one the admin shell already
 * uses. A hamburger and a bottom bar are two navigation models for one screen; the drawer was removed
 * rather than kept beside it. What remains in the mobile header is the brand, the account and cart
 * controls, and a full-width search field - the three things a shopper reaches for before the tabs.
 *
 * Categories and the customer arrive as server-resolved props, so navigation can never drift from the
 * catalog the storefront actually serves and the account control can never disagree with the session
 * the server read.
 */
export function Header({
  categories,
  customer,
  moreCategories = false,
}: {
  categories: readonly CatalogCategory[];
  customer: Customer;
  /**
   * True when the shop holds more departments than the header shows. The row then ends with a link to
   * the index, so a department that is not among the four is one click away rather than missing.
   */
  moreCategories?: boolean;
}) {
  const { t, pick } = useTranslation();
  const { itemCount } = useCart();
  const pathname = usePathname();

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

  /** A section is current for its own route and everything beneath it. */
  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

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

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={t('common.brand')}>
          <img src="/brand/logo.svg" alt={t('common.brand')} width={173} height={40} />
        </Link>

        <nav className={styles.primaryNav} aria-label={t('nav.categories')}>
          <ul className={styles.navList}>
            <li>
              <Link href="/products" aria-current={isCurrent('/products') ? 'page' : undefined}>
                {t('nav.shop')}
              </Link>
            </li>
            {categories.map((category) => {
              const href = `/categories/${category.slug}`;
              return (
                <li key={category.id}>
                  <Link href={href} aria-current={isCurrent(href) ? 'page' : undefined}>
                    {pick(category.name)}
                  </Link>
                </li>
              );
            })}
            {moreCategories && (
              <li>
                <Link href="/categories" aria-current={isCurrent('/categories') ? 'page' : undefined}>
                  {t('nav.allCategories')}
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className={styles.actions}>
          {searchField('site-search', 'inline')}
          {/*
            Between 1024px and 1199px there is no room for a typeable field beside the centred
            navigation, so the control is a link into the catalog's own search rather than a squeezed
            input. It targets the field itself (`#catalog-search`), so a tap puts the caret in the input
            instead of dropping the shopper at the top of the listing to find it again. The full field
            returns at 1200px.
          */}
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
    </header>
  );
}
