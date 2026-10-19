'use client';

import styles from '../admin.module.css';

/**
 * The one page header shape: optional eyebrow (a real location, not decoration), title, one
 * sentence of context, and at most a primary action group. The rule below it is what separates
 * chrome from work without wrapping the page in another card.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.pageTitle}>{title}</h1>
        {description !== undefined && <p className={styles.pageLede}>{description}</p>}
      </div>
      {actions !== undefined && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}
