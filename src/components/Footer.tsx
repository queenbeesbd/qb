'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import styles from './Footer.module.css';

/**
 * Footer contains only verified information: the shop's own catalog, the account surfaces that exist,
 * and the year. No shipping, return or payment promise is published, because the only approved
 * delivery policy is the owner-configured charge shown at checkout.
 *
 * The demonstration notice that used to sit here was removed with the rest of the demo wording
 * (owner decision, 2026-10-23).
 *
 * Categories arrive as a server-resolved prop so the shop column always matches
 * the catalog the storefront serves.
 */
export function Footer({ categories }: { categories: readonly CatalogCategory[] }) {
  const { t, pick } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <span className={styles.brandName}>{t('common.brand')}</span>
          <p className={styles.tagline}>{t('footer.tagline')}</p>
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
            <li>
              <Link href="/account">{t('nav.account')}</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className={styles.bottomBar}>
        <p>
          © {year} {t('common.brand')}
        </p>
      </div>
    </footer>
  );
}
