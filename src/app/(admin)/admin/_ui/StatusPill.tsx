import styles from '../admin.module.css';

export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<PillTone, string | undefined> = {
  neutral: styles.pillNeutral,
  info: styles.pillInfo,
  success: styles.pillSuccess,
  warning: styles.pillWarning,
  danger: styles.pillDanger,
};

/**
 * Status text with a semantic tone. The text is the status; the colour reinforces it. No admin
 * surface may communicate a state by colour alone.
 */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`${styles.pill} ${TONE_CLASS[tone]}`}>
      <span className={styles.pillDot} aria-hidden="true" />
      {children}
    </span>
  );
}
