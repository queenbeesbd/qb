'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './Footer.module.css';

/**
 * Footer.
 *
 * **Short, on purpose (owner feedback, 2026-11-02).** The old footer stacked a brand block and two
 * link columns of up to six entries each - on a phone that was a page and a half of links below the
 * last product, for destinations the bottom bar and the header already carry. What is left is what a
 * footer is actually for: who runs the shop, the three or four routes into the catalog and the
 * account, and the year.
 *
 * **The department list is gone.** It was five links into categories that the category index and the
 * homepage rail both reach, and it grew taller than the page above it. `/categories` is the index;
 * a footer column is not.
 *
 * Everything here is verified information: the shop's own name and line, routes that exist, and the
 * year. No shipping, return or payment promise is published, because the only approved delivery
 * policy is the owner-configured charge shown at checkout.
 */
export function Footer() {
  const { t } = useTranslation();
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
            <li>
              <Link href="/categories">{t('nav.categories')}</Link>
            </li>
            <li>
              <Link href="/brands">{t('nav.brands')}</Link>
            </li>
          </ul>
        </nav>

        <nav className={styles.column} aria-labelledby="footer-account">
          <h2 id="footer-account" className={styles.columnTitle}>
            {t('footer.account')}
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
