'use client';

import Link from 'next/link';
import { categories } from '@/data/categories';
import { demoCatalogMeta } from '@/data/catalog';
import { formatDate } from '@/lib/format';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './Footer.module.css';

/**
 * Footer contains only verified information. The demo notice is always present
 * so the storefront can never be mistaken for a live ordering channel, and no
 * shipping, return or payment promise is published because no merchant policy
 * has been approved yet.
 */
export function Footer() {
  const { t, pick, locale } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <span className={styles.brandName}>{t('common.brand')}</span>
          <p className={styles.demoNote}>{t('footer.demoNote')}</p>
          <p className={styles.meta}>
            {t('footer.catalogNote', { date: formatDate(demoCatalogMeta.capturedAt, locale) })}
          </p>
        </div>

        <nav className={styles.column} aria-labelledby="footer-shop">
          <h2 id="footer-shop" className={styles.columnTitle}>
            {t('footer.shop')}
          </h2>
          <ul>
            <li>
              <Link href="/products">{t('footer.allProducts')}</Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/categories/${category.slug}`}>{pick(category.name)}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className={styles.column} aria-labelledby="footer-support">
          <h2 id="footer-support" className={styles.columnTitle}>
            {t('footer.support')}
          </h2>
          <ul>
            <li>
              <Link href="/cart">{t('nav.cart')}</Link>
            </li>
            <li>
              <Link href="/checkout">{t('checkout.title')}</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className={styles.bottomBar}>
        <p>{t('footer.rights')}</p>
        <p>
          © {year} {t('common.brand')}
        </p>
      </div>
    </footer>
  );
}
