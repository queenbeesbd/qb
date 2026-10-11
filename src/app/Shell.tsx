'use client';

import { AnnouncementBar } from '@/components/AnnouncementBar';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './Shell.module.css';

/**
 * Shared page chrome. The announcement strip renders on every route above the
 * header, so the demonstration can never be mistaken for a live ordering
 * channel.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        <SkipLabel />
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}

function SkipLabel() {
  const { t } = useTranslation();
  return <>{t('common.skipToContent')}</>;
}
