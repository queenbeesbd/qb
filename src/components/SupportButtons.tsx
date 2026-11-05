'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { FacebookIcon, WhatsAppIcon } from './icons';
import styles from './SupportButtons.module.css';

/**
 * The shop's two support links, floating at the right edge above the phone tab bar.
 *
 * **An empty link is not rendered.** The addresses are the owner's, set at Settings -> Support links,
 * and a support button that goes nowhere is worse than no button: nothing here invents a page, a phone
 * number or a message. Both links open in a new tab with `rel="noopener noreferrer"`, so an external
 * site cannot reach back into this one through `window.opener`.
 *
 * The marks are drawn as outlines in the site's own ink - not the providers' blues and greens. They are
 * recognisable by shape at 20px, and the row stays inside the shop's palette instead of importing a
 * second one from two other companies.
 */
export function SupportButtons({
  facebookUrl,
  whatsappUrl,
}: {
  facebookUrl: string | null;
  whatsappUrl: string | null;
}) {
  const { t } = useTranslation();
  if (facebookUrl === null && whatsappUrl === null) return null;

  return (
    <div className={styles.rail} data-support-buttons>
      {facebookUrl !== null && (
        <a
          className={styles.button}
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('support.facebook')}
          title={t('support.facebook')}
          data-kind="facebook"
        >
          <FacebookIcon width={20} height={20} />
        </a>
      )}
      {whatsappUrl !== null && (
        <a
          className={styles.button}
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('support.whatsapp')}
          title={t('support.whatsapp')}
          data-kind="whatsapp"
        >
          <WhatsAppIcon width={20} height={20} />
        </a>
      )}
    </div>
  );
}
