'use client';

import type { CSSProperties } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { AnnouncementVariant } from '@/lib/types';
import styles from './AnnouncementBar.module.css';

export type AnnouncementItem = {
  readonly id: string;
  readonly variant: AnnouncementVariant;
  readonly message: string;
};

/**
 * Roughly eight characters a second: fast enough to feel like a ticker, slow enough to read the line
 * as it passes. The duration scales with the message so a long notice does not scroll faster than a
 * short one - a fixed duration is the classic marquee mistake.
 */
const CHARS_PER_SECOND = 8;

/**
 * One pass across the strip should cover a desktop viewport, so a short line does not travel once and
 * then leave the screen empty for twice as long as it took to read. The message is repeated inside the
 * pass until it is long enough - a ticker repeating a short line is honest; a blank strip every cycle
 * is not. Only the first copy is exposed to assistive technology.
 */
const TARGET_PASS_CHARS = 200;
const MAX_COPIES = 12;

function passCopies(items: readonly AnnouncementItem[]): number {
  const characters = items.reduce((total, item) => total + item.message.length, 0);
  if (characters === 0) return 1;
  return Math.min(MAX_COPIES, Math.max(1, Math.ceil(TARGET_PASS_CHARS / characters)));
}

function tickerSeconds(items: readonly AnnouncementItem[], copies: number): number {
  const characters = items.reduce((total, item) => total + item.message.length, 0) * copies;
  return Math.min(60, Math.max(14, Math.round(characters / CHARS_PER_SECOND)));
}

/**
 * The announcement strip above the header.
 *
 * Presentation only: the items are composed on the server, where the owner's line is read from the
 * database. The bar renders exactly what it is given, so a saved message that is switched off simply
 * is not passed in.
 *
 * The line now **scrolls**, like a news ticker: it enters from the right and travels left, and repeats
 * without a seam. That is a presentation choice with three constraints kept on purpose:
 *
 * 1. **Two identical groups, never a measured width.** The track is two copies of the same content and
 *    travels exactly -50% of itself, so the loop is seamless at any node width without JavaScript.
 *    The separator lives on each item rather than in a flex `gap`, because a gap would make the two
 *    copies unequal and the seam visible.
 * 2. **The second copy is hidden from assistive technology.** It exists for the eye only; the message
 *    is announced once, and the strip keeps its `aria-label`.
 * 3. **Reduced motion is a real state, not a preference to override.** With `prefers-reduced-motion`
 *    the animation stops, the duplicate is removed and the strip becomes the quiet static line it was
 *    before: moving text is unreadable for some people, and there is nothing here worth that cost.
 *
 * No badge, no background: the strip reads as the shop's own line, and it is absent entirely when
 * there is nothing to say.
 */
export function AnnouncementBar({ items }: { items: readonly AnnouncementItem[] }) {
  const { t } = useTranslation();

  if (items.length === 0) return null;

  const copies = passCopies(items);
  const style = { '--ticker-duration': `${tickerSeconds(items, copies)}s` } as CSSProperties;

  /*
   * `silent` covers the whole duplicate pass; `deaf` marks the repeats inside the first pass. The
   * message is announced once, and the eye still sees a continuous line.
   */
  const group = (silent: boolean) => (
    <div className={styles.group} data-duplicate={silent ? 'true' : undefined} aria-hidden={silent || undefined}>
      {Array.from({ length: copies }, (_, pass) =>
        items.map((announcement) => (
          <p
            key={`${announcement.id}-${pass}`}
            className={styles.item}
            data-variant={announcement.variant}
            data-repeat={!silent && pass > 0 ? 'true' : undefined}
            aria-hidden={!silent && pass > 0 ? true : undefined}
          >
            {announcement.message}
          </p>
        )),
      )}
    </div>
  );

  return (
    <aside className={styles.bar} aria-label={t('announcement.regionLabel')} data-announcement-bar>
      <div className={styles.viewport}>
        <div className={styles.track} style={style}>
          {group(false)}
          {group(true)}
        </div>
      </div>
    </aside>
  );
}
