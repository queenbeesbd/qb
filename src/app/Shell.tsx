'use client';

import { AnnouncementBar } from '@/components/AnnouncementBar';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import styles from './Shell.module.css';

/**
 * Shared page chrome. The announcement strip renders on every route above the
 * header, so the demonstration can never be mistaken for a live ordering
 * channel.
 *
 * The catalog categories are passed down from the server layout to the header
 * and footer, so the navigation is derived from the same catalog snapshot the
 * pages render.
 */
export function Shell({
  categories,
  children,
}: {
  categories: readonly CatalogCategory[];
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        <SkipLabel />
      </a>
      <AnnouncementBar />
      <Header categories={categories} />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      <Footer categories={categories} />
    </>
  );
}

function SkipLabel() {
  const { t } = useTranslation();
  return <>{t('common.skipToContent')}</>;
}
