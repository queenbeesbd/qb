import styles from '../qbpanel.module.css';
import { AdminIcon, type AdminIconName } from './icons';

/**
 * An empty state that says what is empty and what happens next. A bare "No data" is a dead end;
 * silence is worse.
 */
export function EmptyState({
  title,
  body,
  icon = 'check',
  action,
}: {
  title: string;
  body: string;
  icon?: AdminIconName;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <AdminIcon name={icon} />
      </span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyBody}>{body}</p>
      {action}
    </div>
  );
}
