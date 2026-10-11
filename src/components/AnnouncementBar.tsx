'use client';

import { activeAnnouncements } from '@/data/announcements';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import type { AnnouncementVariant } from '@/lib/types';
import styles from './AnnouncementBar.module.css';

const BADGE_KEY: Record<AnnouncementVariant, TranslationKey> = {
  demo: 'announcement.badge.demo',
  info: 'announcement.badge.info',
};

/**
 * Slim announcement strip above the header. Content comes from the typed local
 * announcement configuration, so it is never a string hardcoded into the header
 * and a later authorised phase can populate it from a merchant source.
 *
 * The strip is deliberately visually subordinate to the main navigation:
 * smaller type, a tinted background and no motion.
 */
export function AnnouncementBar() {
  const { t, locale } = useTranslation();
  const items = activeAnnouncements();

  if (items.length === 0) return null;

  return (
    <aside className={styles.bar} aria-label={t('announcement.regionLabel')}>
      <div className={styles.inner}>
        {items.map((announcement) => (
          <p key={announcement.id} className={styles.item} data-variant={announcement.variant}>
            <span className={styles.badge}>{t(BADGE_KEY[announcement.variant])}</span>
            <span className={styles.message}>{announcement.message[locale]}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}
