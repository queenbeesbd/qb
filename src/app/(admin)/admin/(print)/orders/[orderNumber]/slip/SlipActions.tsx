'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from './slip.module.css';

/**
 * The two things a person does with a slip: print it, or go back to the order.
 *
 * The button prints because it was **clicked**; nothing prints on load, so opening the address in a
 * new tab is never a surprise dialog. Both controls are screen-only and never reach the paper.
 */
export function SlipActions({ orderHref }: { orderHref: string }) {
  const { t } = useTranslation();

  return (
    <div className={styles.actions}>
      <Link className={styles.actionLink} href={orderHref}>
        {t('admin.slip.backToOrder')}
      </Link>
      <button type="button" className={styles.actionButton} onClick={() => window.print()}>
        {t('admin.slip.printButton')}
      </button>
    </div>
  );
}
