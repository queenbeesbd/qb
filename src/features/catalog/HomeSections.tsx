'use client';

import Link from 'next/link';
import { categories } from '@/data/categories';
import { demoCatalogMeta, products } from '@/data/catalog';
import { discountAmount } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { useTranslation } from '@/i18n/useTranslation';
import { CategoryIcon, InfoIcon } from '@/components/icons';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import styles from '@/app/home.module.css';

/**
 * Homepage composition. Sections are limited to those the verified data can
 * actually support; "recently added" is deliberately not rendered as a product
 * list because the storefront publishes no reliable date field.
 */
export function HomeView() {
  const { t, pick, locale } = useTranslation();

  const deals = products
    .filter((product) => discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null)
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
        discountAmount(a.priceMinor, a.compareAtPriceMinor)!,
    );

  const featured = products.filter((product) => product.featured);
  const hasDatedProducts = products.some((product) => product.addedAt !== null);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t('home.heroEyebrow')}</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            {t('home.heroTitle')}
          </h1>
          <p className={styles.heroBody}>{t('home.heroBody')}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/products">
              {t('home.heroPrimary')}
            </Link>
            <a className={styles.secondaryAction} href="#categories">
              {t('home.heroSecondary')}
            </a>
          </div>
        </div>
        <div className={styles.heroAside} aria-hidden="true">
          <span className={styles.heroMark}>
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="56" fill="var(--color-accent-soft)" />
              <path
                d="M60 22c9.4 0 17.1 6.4 19.6 15h12.7l-8.8 9 8.8 9H79.6a20.4 20.4 0 0 1-39.2 0H27.7l8.8-9-8.8-9h12.7C42.9 28.4 50.6 22 60 22Z"
                fill="var(--color-action)"
              />
              <path d="M41 51h38a20.4 20.4 0 0 1-19 14 20.4 20.4 0 0 1-19-14Z" fill="var(--color-secondary)" />
              <path d="M49.5 68h21L60 92Z" fill="var(--color-action)" />
            </svg>
          </span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="categories-title" id="categories">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="categories-title">{t('home.categoriesTitle')}</h2>
            <p className={styles.sectionBody}>{t('home.categoriesBody')}</p>
          </div>
          <Link className={styles.viewAll} href="/products">
            {t('home.viewAll')}
          </Link>
        </header>
        <ul className={styles.categoryGrid}>
          {categories.map((category) => (
            <li key={category.id}>
              <Link className={styles.categoryCard} href={`/categories/${category.slug}`}>
                <span className={styles.categoryIcon}>
                  <CategoryIcon name={category.icon} width={26} height={26} />
                </span>
                <span className={styles.categoryText}>
                  <span className={styles.categoryName}>{pick(category.name)}</span>
                  <span className={styles.categoryBlurb}>{pick(category.blurb)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="featured-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="featured-title">{t('home.featuredTitle')}</h2>
            <p className={styles.sectionBody}>{t('home.featuredBody')}</p>
          </div>
          <Link className={styles.viewAll} href="/products">
            {t('home.viewAll')}
          </Link>
        </header>
        <ProductGrid>
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductGrid>
      </section>

      <section className={styles.section} aria-labelledby="deals-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="deals-title">{t('home.dealsTitle')}</h2>
            <p className={styles.sectionBody}>{t('home.dealsBody')}</p>
          </div>
        </header>
        {deals.length > 0 ? (
          <ProductGrid>
            {deals.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductGrid>
        ) : (
          <EmptyNote title={t('home.dealsEmptyTitle')} body={t('home.dealsEmptyBody')} />
        )}
      </section>

      <section className={styles.section} aria-labelledby="new-title">
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="new-title">{t('home.newTitle')}</h2>
            <p className={styles.sectionBody}>
              {t('footer.catalogNote', { date: formatDate(demoCatalogMeta.capturedAt, locale) })}
            </p>
          </div>
        </header>
        {hasDatedProducts ? null : (
          <EmptyNote title={t('home.newUnavailableTitle')} body={t('home.newUnavailableBody')} />
        )}
      </section>
    </div>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyNote}>
      <InfoIcon width={22} height={22} />
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        <p className={styles.emptyBody}>{body}</p>
      </div>
    </div>
  );
}
