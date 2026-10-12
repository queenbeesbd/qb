'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from '../admin.module.css';

export type AdminNavItem = { href: string; labelKey: TranslationKey };

/**
 * Admin navigation.
 *
 * The item list is built on the **server** from the session's effective permission set, so this
 * component cannot show a destination the request would refuse. That is presentation only: the
 * protection is the server-side check on the route itself, and a link removed here would still be
 * refused there.
 */
export function AdminNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className={styles.nav} aria-label={t('admin.nav.label')}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
            aria-current={active ? 'page' : undefined}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
