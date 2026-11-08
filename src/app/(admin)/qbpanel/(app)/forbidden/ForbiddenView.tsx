'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../../qbpanel.module.css';

/**
 * The refusal surface for a page the session may not view.
 *
 * It deliberately reads as "not found" rather than "forbidden": telling a visitor that a route exists
 * but is denied is itself information, and the design's rule for another principal's resource is a
 * 404 (`docs/security.md` 13.1 rule 2). The message states both possibilities without confirming
 * which one applies.
 */
export function ForbiddenView() {
  const { t } = useTranslation();

  return (
    <div className={styles.emptyState}>
      <h1 className={styles.emptyTitle}>{t('admin.forbidden.title')}</h1>
      <p className={styles.emptyBody}>{t('admin.forbidden.body')}</p>
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/qbpanel">
        {t('admin.forbidden.home')}
      </Link>
    </div>
  );
}
