import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import styles from './SeeAllCard.module.css';

/**
 * The last card in a product row: the way to everything that row claims, beyond the ten it shows.
 *
 * **Card geometry, control material.** The row is a shelf of cards, so the tile takes a card's width,
 * height, border and radius - the rhythm holds. Inside it is the opposite of a card: no photograph, no
 * price, no saving, no name, just an arrow and the row's own claim continued ("All offers", "All best
 * sellers", "All new arrivals"). A tile that borrowed a card's anatomy without its facts would read as
 * a card with everything missing, which is why the content is one centred statement rather than a
 * photo area with a label under it.
 *
 * Each destination exists and really is that claim - `/products?offers=1`, `?sort=best-selling` and
 * `?sort=newest` - which is why the tile is only drawn when the listing holds more than the row shows
 * (`*HaveMore` in `home-selection.ts`). The label is the link's accessible name; the arrow is
 * decoration. Hover and focus stay inside the tile: the carousel clips on both axes.
 */
export function SeeAllCard({
  href,
  labelKey,
}: {
  href: string;
  labelKey: TranslationKey;
}) {
  const { t } = useTranslation();
  return (
    <Link className={styles.tile} href={href} data-see-all="">
      <svg className={styles.arrow} viewBox="0 0 24 24" width="28" height="28" focusable="false" aria-hidden="true">
        <path
          d="M5 12h13M12.5 6l6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.label}>{t(labelKey)}</span>
    </Link>
  );
}
