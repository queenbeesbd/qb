'use client';

import { AnnouncementBar, type AnnouncementItem } from '@/components/AnnouncementBar';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { StorefrontTabBar } from '@/components/StorefrontTabBar';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import styles from './Shell.module.css';

/**
 * Shared page chrome: the announcement strip, the header, the page, the footer, and the phone tab bar.
 *
 * Navigation is one model per size, never two at once: from 1024px up the header carries the category
 * navigation, and below it the fixed bottom bar does. The catalogue categories are passed down from the
 * server layout to both the header and the footer, so navigation is derived from the same catalog
 * snapshot the pages render.
 */
export function Shell({
  categories,
  departments,
  customer,
  announcements,
  children,
}: {
  categories: readonly CatalogCategory[];
  /**
   * The four departments the header shows. The footer keeps the full list, so nothing is unreachable:
   * the header is a shortcut into the shop's busiest departments, not the index.
   */
  departments: readonly CatalogCategory[];
  /** Resolved on the server once per request; never re-derived in the browser. */
  customer: { email: string; displayName: string | null } | null;
  /**
   * Composed on the server: the owner's saved line, when it is switched on. The bar itself does not
   * decide policy.
   */
  announcements: readonly AnnouncementItem[];
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        <SkipLabel />
      </a>
      <AnnouncementBar items={announcements} />
      <Header
        categories={departments}
        customer={customer}
        moreCategories={categories.length > departments.length}
      />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      <Footer categories={categories} />
      {/*
        The tab bar is fixed, so it would cover the last row of the footer. This spacer reserves exactly
        its height (including the device inset) and is removed at the width where the bar is hidden.
      */}
      <div className={styles.tabBarSpace} aria-hidden="true" />
      <StorefrontTabBar />
    </>
  );
}

function SkipLabel() {
  const { t } = useTranslation();
  return <>{t('common.skipToContent')}</>;
}
