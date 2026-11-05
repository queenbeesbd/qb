'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CheckIcon } from '@/components/icons';
import styles from '@/app/account.module.css';

/**
 * The shared frame for the three account forms: sign in, create an account, redeem a one-time code.
 *
 * **Redesigned 2026-10-23.** These pages used to be a narrow single column of labels with no frame at
 * all, which on a 1440px screen left the form marooned in the left third of an empty page. They are now
 * a two-panel composition: a lavender panel that states what the account is for, and a white form panel
 * beside it. Below 880px the panels stack, the aside loses its padding and reads as an intro band.
 *
 * The three points in the aside are facts about this shop, not marketing: orders are cash on delivery
 * (ADR 0015), the delivery charge is quoted before an order is placed (ADR 0016), and the account page
 * lists the customer's own orders. Nothing here promises a service the product does not run.
 */
export function AuthShell({
  children,
  heading,
  lead,
  asideTitle,
  points,
  footer,
}: {
  children: React.ReactNode;
  heading: string;
  lead?: string;
  asideTitle: string;
  points?: readonly string[];
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const asidePoints = points ?? [
    t('account.authPointOrders'),
    t('account.authPointCod'),
    t('account.authPointDelivery'),
  ];

  return (
    <div className={styles.authPage}>
      <div className={styles.authShell}>
        <aside className={styles.authAside}>
          <Link href="/" className={styles.authBrand} aria-label={t('common.brand')}>
            <span className={styles.authBrandMark} aria-hidden="true">
              <img
                src="/brand/logo-round-192.jpeg"
                srcSet="/brand/logo-round-96.jpeg 96w, /brand/logo-round-192.jpeg 192w"
                sizes="48px"
                alt=""
                width={48}
                height={48}
              />
            </span>
          </Link>
          <h2 className={styles.authAsideTitle}>{asideTitle}</h2>
          <ul className={styles.authPoints}>
            {asidePoints.map((point) => (
              <li key={point}>
                <span className={styles.authPointIcon} aria-hidden="true">
                  <CheckIcon width={16} height={16} />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {/*
            The panel is as tall as the form beside it, which leaves the column's lower half empty on the
            taller pages. A way back to the shop is the one thing worth putting there: it is what a
            hesitant visitor wants, and it stops the column reading as a broken layout.
          */}
          <p className={styles.authAsideFoot}>
            <Link href="/products">{t('account.authKeepBrowsing')}</Link>
          </p>
        </aside>

        <section className={styles.authPanel} aria-labelledby="auth-heading">
          <header className={styles.authHeader}>
            <h1 id="auth-heading">{heading}</h1>
            {lead !== undefined && <p className={styles.muted}>{lead}</p>}
          </header>
          {children}
          {footer !== undefined && <div className={styles.authFooter}>{footer}</div>}
        </section>
      </div>
    </div>
  );
}
