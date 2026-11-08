'use client';

import { useState } from 'react';

import { AnnouncementBar, type AnnouncementItem } from '@/components/AnnouncementBar';
import { activeAnnouncements } from '@/data/announcements';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

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
 * The owner writes the storefront's news line. Two fields and one save: the text and whether it is
 * shown. An empty message is saved as "nothing", which hides the bar - it is never rendered as a blank
 * strip.
 *
 * The page shows the strip before it asks for the words, and it shows it by rendering the storefront's
 * own component with the same composition the layout uses: the owner's line only when it is non-empty
 * and switched on. A preview drawn with different markup would drift from the real bar and quietly
 * promise something the storefront does not do; this one cannot.
 *
 * The draft is local state so the preview and the counter answer while the owner types. The fields
 * themselves stay uncontrolled - the value submitted is the value in the input, not a copy of it.
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
  const [draft, setDraft] = useState(message ?? '');
  const [draftVisible, setDraftVisible] = useState(visible);

  const savedLive = visible && message !== null;
  const remaining = maxLength - draft.length;
  const previewItems: AnnouncementItem[] = activeAnnouncements().map((item) => ({
    id: item.id,
    variant: item.variant,
    message: item.message,
  }));
  if (draftVisible && draft.trim() !== '') {
    previewItems.push({ id: 'owner-message', variant: 'info', message: draft });
  }

  return (
    <>
      <PageHeader
        title={t('admin.announcement.title')}
        description={t('admin.announcement.body')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <div className={styles.announcementGrid}>
        <section className={styles.section} aria-labelledby="announcement-editor">
          <div className={styles.sectionHead}>
            <h2 id="announcement-editor">{t('admin.announcement.editorTitle')}</h2>
          </div>

          <form className={styles.formCard} action="/api/qbpanel/announcement" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />

            <div className={styles.field}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.fieldLabel} htmlFor="announcement-message">
                  {t('admin.announcement.messageLabel')}
                </label>
                <span className={remaining < 40 ? styles.counterWarn : styles.counter}>
                  {t('admin.announcement.counter', { count: draft.length, max: maxLength })}
                </span>
              </div>
              <textarea
                className={styles.textarea}
                id="announcement-message"
                name="message"
                maxLength={maxLength}
                defaultValue={message ?? ''}
                placeholder={t('admin.announcement.messagePlaceholder')}
                aria-describedby="announcement-state"
                rows={3}
                onChange={(event) => setDraft(event.target.value)}
              />
              <p className={styles.hint} id="announcement-state">
                {message === null
                  ? t('admin.announcement.emptyState')
                  : t('admin.announcement.currentState', { count: message.length, max: maxLength })}
              </p>
            </div>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                name="visible"
                defaultChecked={visible}
                onChange={(event) => setDraftVisible(event.target.checked)}
              />
              <span className={styles.switchRowText}>
                <span className={styles.switchRowLabel}>{t('admin.announcement.visibleLabel')}</span>
                <span className={styles.hint}>{t('admin.announcement.visibleHint')}</span>
              </span>
            </label>

            <div className={styles.settingActions}>
              <SubmitButton
                label={t('admin.announcement.save')}
                pendingLabel={t('admin.common.working')}
              />
              {/*
                This pill describes the **saved** state, so it sits beside the action that changes
                it rather than in the preview: the preview is a draft, and labelling it with the
                saved state would make the frame disagree with what it shows.
              */}
              <span
                className={`${styles.pill} ${savedLive ? styles.pillSuccess : styles.pillNeutral}`}
              >
                {savedLive
                  ? t('admin.announcement.statusLive')
                  : t('admin.announcement.statusHidden')}
              </span>
            </div>
          </form>
        </section>

        <section
          className={`${styles.section} ${styles.announcementPreviewSection}`}
          aria-labelledby="announcement-preview"
        >
          <div className={styles.sectionHead}>
            <h2 id="announcement-preview">{t('admin.announcement.previewTitle')}</h2>
          </div>

          <figure className={styles.announcementPreview}>
            <div className={styles.announcementPreviewLabel}>
              <span className={styles.announcementPreviewEyebrow}>
                {t('admin.announcement.previewLabel')}
              </span>
            </div>
            <AnnouncementBar items={previewItems} />
            <figcaption className={styles.announcementPreviewCaption}>
              {t('admin.announcement.previewNote')}
            </figcaption>
          </figure>
        </section>
      </div>
    </>
  );
}
