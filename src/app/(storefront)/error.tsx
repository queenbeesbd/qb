'use client';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../status.module.css';

/**
 * Storefront error boundary.
 *
 * It renders no error detail - a stack trace or a database message on a public
 * page is an information disclosure, and the error is already recorded
 * server-side. It never falls back to the fixture catalog: a failed catalog read
 * is reported as a failure, because serving captured vendor data as this store's
 * own catalog would be a false claim. `reset` retries the segment, the only
 * recovery action that makes sense without a reload.
 */
export default function StorefrontError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <h1>{t('error.catalogTitle')}</h1>
      <p>{t('error.catalogBody')}</p>
      <button type="button" className={styles.action} onClick={reset}>
        {t('common.retry')}
      </button>
    </div>
  );
}
