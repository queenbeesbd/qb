'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/features/cart/useCart';
import { CartIcon, GridIcon, HomeIcon, TagIcon, UserIcon } from './icons';
import styles from './StorefrontTabBar.module.css';

/**
 * The storefront's phone navigation.
 *
 * **One navigation model on small screens (owner decision, 2026-10-23).** The header drawer was removed
 * and these five destinations took its place: Home, Shop, Categories, Cart and Account. The owner asked
 * for the same bottom-bar pattern the admin shell uses, and a fixed bar is the right one for a shop -
 * the thumb reaches it, the current section is always visible, and the cart count is never more than a
 * glance away.
 *
 * Five tabs rather than four-plus-More: every destination is a real, distinct surface, so a "More"
 * sheet would hold nothing but a second copy of these links. Categories exists as a route for the same
 * reason - without it, category discovery on a phone would have no home once the drawer was gone.
 *
 * The bar is presentational chrome: it renders the same links at every scroll position and is hidden
 * entirely from 1024px up, where the header's own navigation takes over.
 */
export function StorefrontTabBar() {
  const { t } = useTranslation();
  const { itemCount } = useCart();
  const pathname = usePathname();

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const tabs = [
    { href: '/', label: t('nav.home'), icon: <HomeIcon width={22} height={22} /> },
    { href: '/products', label: t('nav.tabShop'), icon: <GridIcon width={22} height={22} /> },
    { href: '/categories', label: t('nav.categories'), icon: <TagIcon width={22} height={22} /> },
    { href: '/cart', label: t('nav.cart'), icon: <CartIcon width={22} height={22} />, badge: itemCount },
    { href: '/account', label: t('nav.tabAccount'), icon: <UserIcon width={22} height={22} /> },
  ];

  return (
    <nav className={styles.bar} aria-label={t('nav.primary')} data-storefront-tabbar>
      <ul className={styles.list}>
        {tabs.map((tab) => {
          const current = isCurrent(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={styles.tab}
                aria-current={current ? 'page' : undefined}
                aria-label={
                  tab.badge !== undefined && tab.badge > 0
                    ? `${tab.label} (${tab.badge})`
                    : undefined
                }
              >
                <span className={styles.icon} aria-hidden="true">
                  {tab.icon}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={styles.badge}>{tab.badge}</span>
                  )}
                </span>
                <span className={styles.label}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
