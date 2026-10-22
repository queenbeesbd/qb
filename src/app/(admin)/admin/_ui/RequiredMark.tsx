'use client';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../admin.module.css';

/**
 * The required marker for a field label: a red asterisk for the eye, and the word "Required" for a
 * screen reader.
 *
 * The marker used to be small muted text reading "Required", which the owner reported as hard to see
 * when scanning a form. A symbol is faster to scan; the word is not dropped, only made invisible, so the
 * field is still labelled rather than merely decorated. The asterisk itself is hidden from assistive
 * technology, which would otherwise read it as "star".
 */
export function RequiredMark() {
  const { t } = useTranslation();
  return (
    <>
      <span className={styles.requiredMark} aria-hidden="true">
        *
      </span>
      <span className="sr-only">{t('common.required')}</span>
    </>
  );
}
