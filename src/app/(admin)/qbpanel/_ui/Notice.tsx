'use client';

import styles from '../qbpanel.module.css';
import { AdminIcon, type AdminIconName } from './icons';

export type NoticeTone = 'success' | 'error' | 'info' | 'warning';

const TONE_CLASS: Record<NoticeTone, string | undefined> = {
  success: styles.noticeSuccess,
  error: styles.noticeError,
  info: styles.noticeInfo,
  warning: styles.noticeWarning,
};

const TONE_ICON: Record<NoticeTone, AdminIconName> = {
  success: 'check',
  error: 'alert',
  info: 'clock',
  warning: 'alert',
};

/**
 * One feedback region for every admin action.
 *
 * Every notice is announced: success through a polite status, a refusal through an alert. The
 * message is the whole point - a notice code is mapped to a sentence by the page that owns it, so
 * the owner never has to infer what a redirect parameter meant.
 */
export function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  return (
    <div
      className={`${styles.notice} ${TONE_CLASS[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <AdminIcon name={TONE_ICON[tone]} />
      <span>{children}</span>
    </div>
  );
}
