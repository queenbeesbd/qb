'use client';

import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './Shell.module.css';

/**
 * Shared page chrome. The demo notice is rendered on every route so the demo
 * can never be mistaken for a live ordering channel, and it doubles as the
 * skip-link target region boundary.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Chrome>{children}</Chrome>
  );
}

function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        <SkipLabel />
      </a>
      <Header />
      <DemoNotice />
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

function DemoNotice() {
  const { t } = useTranslation();
  return (
    <div className={styles.demoBar} role="note">
      <div className={styles.demoBarInner}>
        <span className={styles.demoBadge}>{t('common.demoBadge')}</span>
        <p>{t('common.demoNotice')}</p>
      </div>
    </div>
  );
}
