'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from './status.module.css';

/**
 * The 404 for a URL that matches no route at all.
 *
 * Deliberately self-contained: this boundary sits above both route groups, so it renders outside the
 * storefront layout - and therefore without the cart provider the storefront header needs. Adding
 * storefront chrome here would mean mounting the cart on a page that cannot use it. The storefront's
 * own 404 (`(storefront)/not-found.tsx`) is the one a customer sees for an unknown product or
 * category, and it does carry the full chrome.
 */
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
