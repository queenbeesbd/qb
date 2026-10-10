'use client';

import { useTranslation } from '@/i18n/useTranslation';
import styles from './status.module.css';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <h1>{t('error.genericTitle')}</h1>
      <p>{t('error.genericBody')}</p>
      <button type="button" className={styles.action} onClick={reset}>
        {t('common.retry')}
      </button>
    </div>
  );
}
