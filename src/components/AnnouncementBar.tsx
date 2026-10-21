'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import type { AnnouncementVariant } from '@/lib/types';
import styles from './AnnouncementBar.module.css';

const BADGE_KEY: Record<AnnouncementVariant, TranslationKey> = {
  demo: 'announcement.badge.demo',
  info: 'announcement.badge.info',
};

export type AnnouncementItem = {
  readonly id: string;
  readonly variant: AnnouncementVariant;
  readonly message: string;
};

/**
 * Slim announcement strip above the header.
 *
 * Presentation only: the items are composed on the server, where the locked preview notice lives and
 * where the owner's own line is read from the database. Keeping that composition out of the bar is
 * what stops the editable setting from ever replacing the preview notice beside it.
 *
 * The strip is deliberately visually subordinate to the main navigation: smaller type, a tinted
 * background and no motion.
 */
export function AnnouncementBar({ items }: { items: readonly AnnouncementItem[] }) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <aside className={styles.bar} aria-label={t('announcement.regionLabel')}>
      <div className={styles.inner}>
        {items.map((announcement) => (
          <p key={announcement.id} className={styles.item} data-variant={announcement.variant}>
            <span className={styles.badge}>{t(BADGE_KEY[announcement.variant])}</span>
            <span className={styles.message}>{announcement.message}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}
