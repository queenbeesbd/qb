'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { MessengerIcon, WhatsAppIcon } from './icons';
import styles from './SupportButtons.module.css';

/**
 * The shop's two support links, floating at the right edge above the phone tab bar.
 *
 * **An empty link is not rendered.** The addresses are the owner's, set at Settings -> Support links,
 * and a support button that goes nowhere is worse than no button: nothing here invents a page, a phone
 * number or a message. Both links open in a new tab with `rel="noopener noreferrer"`, so an external
 * site cannot reach back into this one through `window.opener`.
 *
 * **Both destinations are chat apps, and the buttons say so in colour** (owner direction,
 * 2026-11-19). WhatsApp keeps its green and Facebook became **Messenger** in Messenger blue, because
 * the question these two icons answer is "which app do I reach the shop on", and the colour answers it
 * before the glyph is read at 20px. The mark itself is drawn in ink on both discs - the same answer the
 * product page's WhatsApp button already gives, and the only one a customer with low vision can read.
 */
export function SupportButtons({
  messengerUrl,
  whatsappUrl,
}: {
  messengerUrl: string | null;
  whatsappUrl: string | null;
}) {
  const { t } = useTranslation();
  if (messengerUrl === null && whatsappUrl === null) return null;

  return (
    <div className={styles.rail} data-support-buttons>
      {messengerUrl !== null && (
        <a
          className={styles.button}
          href={messengerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('support.messenger')}
          title={t('support.messenger')}
          data-kind="messenger"
        >
          <MessengerIcon width={20} height={20} />
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
