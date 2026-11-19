import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from '../qbpanel.module.css';
import { AdminIcon, type AdminIconName } from './icons';

export type MetricTone = 'green' | 'blue' | 'violet' | 'amber' | 'rose' | 'teal' | 'warning';

/**
 * One dashboard figure.
 *
 * The label, value and note are deliberately one vertical column. The previous analytics cards put
 * them directly into the tile's two-column grid, so the value landed beside the label and the note
 * beside the value - at narrow widths the three pieces printed on top of each other. The icon owns
 * the left column; everything that is read owns the right one.
 *
 * The tone is a visual grouping, not a status. `warning` is the only semantic tone and is reserved
 * for work waiting on the owner.
 *
 * **A figure that has somewhere to go is a link** (owner direction, 2026-11-20). "Waiting on a call"
 * counted the orders waiting for a phone call and then left the owner to find them; a number that
 * states work waiting on a person should open it. `href` draws the whole tile as the link's target -
 * a real `<a>`, so it is one tab stop, it has a visible focus ring, and it works without JavaScript.
 * The dashboards' other figures keep the plain `<article>`: a figure with no destination is not a
 * link, and an arrow on it would promise navigation that does not exist.
 */
export function MetricCard({
  tone,
  icon,
  label,
  value,
  note,
  spark,
  href,
  linkLabel,
}: {
  tone: MetricTone;
  icon: AdminIconName;
  label: ReactNode;
  value: ReactNode;
  note: ReactNode;
  spark?: ReactNode;
  /** Where the figure leads, when it leads anywhere. */
  href?: string;
  /** The accessible name of the link, because the tile's own text is a collection of labels. */
  linkLabel?: string;
}) {
  const className = [styles.kpi, tone === 'warning' ? styles.kpiHot : '', href === undefined ? '' : styles.kpiLink]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className={styles.kpiIcon} aria-hidden="true">
        <AdminIcon name={icon} width={18} height={18} />
      </span>
      <div className={styles.kpiBody}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiNote}>{note}</span>
        {spark !== undefined && <span className={styles.kpiSpark}>{spark}</span>}
      </div>
      {href !== undefined && (
        <span className={styles.kpiArrow} aria-hidden="true">
          <AdminIcon name="arrowRight" width={16} height={16} />
        </span>
      )}
    </>
  );

  if (href !== undefined) {
    return (
      <article data-tone={tone}>
        <Link className={className} href={href} aria-label={linkLabel}>
          {body}
        </Link>
      </article>
    );
  }

  return (
    <article className={className} data-tone={tone}>
      {body}
    </article>
  );
}
