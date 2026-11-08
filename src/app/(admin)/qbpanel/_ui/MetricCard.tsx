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
 */
export function MetricCard({
  tone,
  icon,
  label,
  value,
  note,
  spark,
}: {
  tone: MetricTone;
  icon: AdminIconName;
  label: ReactNode;
  value: ReactNode;
  note: ReactNode;
  spark?: ReactNode;
}) {
  return (
    <article className={tone === 'warning' ? `${styles.kpi} ${styles.kpiHot}` : styles.kpi} data-tone={tone}>
      <span className={styles.kpiIcon} aria-hidden="true">
        <AdminIcon name={icon} width={18} height={18} />
      </span>
      <div className={styles.kpiBody}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiNote}>{note}</span>
        {spark !== undefined && <span className={styles.kpiSpark}>{spark}</span>}
      </div>
    </article>
  );
}
