'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../admin.module.css';

export type AnnouncementNotice = 'saved' | 'denied' | 'invalid';

const NOTICE_KEYS: Record<AnnouncementNotice, TranslationKey> = {
  saved: 'admin.announcement.notice.saved',
  denied: 'admin.announcement.notice.denied',
  invalid: 'admin.announcement.notice.invalid',
};

const ERROR_NOTICES: readonly AnnouncementNotice[] = ['denied', 'invalid'];

/**
 * Settings -> Announcement bar.
 *
 * The owner writes the news line that sits under the locked demo notice. Two fields and one save: the
 * text and whether it is shown. An empty message is saved as "nothing", which hides the bar - it is
 * never rendered as a blank strip.
 *
 * The preview notice above it is not editable here on purpose: it is the one line that stops this
 * store being mistaken for a live ordering channel.
 */
export function AnnouncementSettingsView({
  message,
  visible,
  notice,
  csrfToken,
  maxLength,
}: {
  message: string | null;
  visible: boolean;
  notice: AnnouncementNotice | null;
  csrfToken: string;
  maxLength: number;
}) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.settings')}
        title={t('admin.announcement.title')}
        description={t('admin.announcement.body')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-labelledby="announcement-editor">
        <div className={styles.sectionHead}>
          <h2 id="announcement-editor">{t('admin.announcement.editorTitle')}</h2>
        </div>
        <div className={styles.card}>
          <p className={styles.hint}>{t('admin.announcement.previewNote')}</p>
          <form className={styles.form} action="/api/admin/announcement" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('admin.announcement.messageLabel')}</span>
              <textarea
                className={styles.textarea}
                name="message"
                maxLength={maxLength}
                defaultValue={message ?? ''}
                placeholder={t('admin.announcement.messagePlaceholder')}
                rows={3}
              />
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" name="visible" defaultChecked={visible} />
              <span>{t('admin.announcement.visibleLabel')}</span>
            </label>
            <div>
              <SubmitButton
                label={t('admin.announcement.save')}
                pendingLabel={t('admin.common.working')}
              />
            </div>
            <p className={styles.hint}>
              {message === null
                ? t('admin.announcement.emptyState')
                : t('admin.announcement.currentState', { count: message.length, max: maxLength })}
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
