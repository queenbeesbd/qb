import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import styles from './SeeAllCircle.module.css';

/**
 * The last circle in a discovery rail: the way to the full index.
 *
 * **Why it is a circle and not a link under the row.** The rail is a run of round tiles and the
 * shopper's eye is already travelling along it; ending it with the same shape and a small arrow says
 * "there is more this way" in the row's own language, and it costs no extra height on a page that is
 * already long. It also keeps the section's one route *inside* the row it belongs to, which is where
 * a shopper looking for the eleventh brand is already looking.
 *
 * **It reads as a control, never as a photograph.** The circle is a flat pale field with a 1px edge
 * and a drawn arrow - no image, no letter mark, no tint that would make it look like a department with
 * a missing photograph. The hover moves nothing but the edge colour and nudges the arrow, and both are
 * inside the box, because the rail clips on both axes.
 *
 * The label under it is the same one-line draw the other tiles use, so the row keeps one baseline.
 */
export function SeeAllCircle({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Link className={styles.link} href={href} data-see-all="">
      <span className={styles.circle} aria-hidden="true">
        <svg className={styles.arrow} viewBox="0 0 24 24" width="22" height="22" focusable="false">
          <path
            d="M5 12h13M12.5 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={styles.name}>{t('home.viewAll')}</span>
    </Link>
  );
}
