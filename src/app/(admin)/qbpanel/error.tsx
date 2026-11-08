'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { Notice } from './_ui/Notice';
import styles from './qbpanel.module.css';

/**
 * The admin error boundary.
 *
 * It renders no error detail: a stack trace or a database message on an admin page is an information
 * disclosure, and the error is already recorded server-side. `reset` retries the segment, which is
 * the only recovery action that makes sense without a reload.
 */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();

  return (
    <div className={styles.centered}>
      <div className={styles.card}>
        <h1>{t('admin.error.title')}</h1>
        <p className={styles.lede}>{t('admin.error.body')}</p>
        <Notice tone="error">{t('admin.error.body')}</Notice>
        <button type="button" className={styles.button} onClick={reset}>
          {t('common.retry')}
        </button>
      </div>
    </div>
  );
}
