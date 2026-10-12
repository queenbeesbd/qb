'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '../status.module.css';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link className={styles.action} href="/">
        {t('notFound.home')}
      </Link>
    </div>
  );
}
