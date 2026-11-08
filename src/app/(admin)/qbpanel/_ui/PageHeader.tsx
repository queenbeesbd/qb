'use client';

import styles from '../qbpanel.module.css';

/**
 * The one page header shape: title, one sentence of context, and at most a primary action group.
 * The rule below it is what separates chrome from work without wrapping the page in another card.
 *
 * There is deliberately no eyebrow. A label above the heading repeats the breadcrumb and adds a
 * smaller, quieter title for the same page - the heading is allowed to carry its own weight.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description !== undefined && <p className={styles.pageLede}>{description}</p>}
      </div>
      {actions !== undefined && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}
