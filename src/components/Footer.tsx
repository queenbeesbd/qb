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
/** How many departments the footer's shop column lists before deferring to the index. */
const FOOTER_CATEGORY_LIMIT = 5;

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
            {/*
              Five departments, then the index. The imported catalog holds fifteen, and a footer
              column that lists all of them grew taller than the page above it - a directory is not
              navigation, so the column stays a shortcut and the index handles the rest.
            */}
            {categories.slice(0, FOOTER_CATEGORY_LIMIT).map((category) => (
              <li key={category.id}>
                <Link href={`/categories/${category.slug}`}>{pick(category.name)}</Link>
              </li>
            ))}
            {categories.length > FOOTER_CATEGORY_LIMIT && (
              <li>
                <Link href="/categories">{t('nav.allCategories')}</Link>
              </li>
            )}
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
