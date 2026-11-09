'use client';

import { useState } from 'react';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { PopupImageField, type PopupAspect } from '../../../_ui/PopupImageField';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

export type OfferPopupNotice = 'saved' | 'imageInvalid' | 'invalid' | 'conflict' | 'denied';

const NOTICE_KEYS: Record<OfferPopupNotice, TranslationKey> = {
  saved: 'admin.offerPopup.notice.saved',
  imageInvalid: 'admin.offerPopup.notice.imageInvalid',
  invalid: 'admin.offerPopup.notice.invalid',
  conflict: 'admin.offerPopup.notice.conflict',
  denied: 'admin.offerPopup.notice.denied',
};

const ERROR_NOTICES: readonly OfferPopupNotice[] = ['imageInvalid', 'invalid', 'conflict', 'denied'];

/**
 * Settings -> Offer popup.
 *
 * One image, one description, one switch. The image is uploaded or replaced here; the frame is chosen
 * from the uploaded file's own ratio by the server (and previewed locally). An inactive popup is
 * stored but never rendered, which is how the owner turns an offer off without deleting its picture.
 */
export function OfferPopupSettingsView({
  current,
  notice,
  csrfToken,
  altMax,
}: {
  current: { imageKey: string; aspect: PopupAspect; altText: string | null; isActive: boolean } | null;
  notice: OfferPopupNotice | null;
  csrfToken: string;
  altMax: number;
}) {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(current?.isActive ?? false);

  return (
    <>
      <PageHeader title={t('admin.offerPopup.title')} description={t('admin.offerPopup.body')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <form
        className={styles.categoryEditor}
        action="/api/qbpanel/settings/offer-popup"
        method="post"
        encType="multipart/form-data"
      >
        <input type="hidden" name="csrf" value={csrfToken} />

        <header className={styles.formHeader}>
          <div className={styles.formHeaderText}>
            <p className={styles.formSubtitle} aria-live="polite">
              {isActive ? t('admin.offerPopup.statusOn') : t('admin.offerPopup.statusOff')}
            </p>
          </div>
          <div className={styles.formHeaderActions}>
            <SubmitButton label={t('admin.offerPopup.save')} pendingLabel={t('admin.common.working')} />
          </div>
        </header>

        <div className={styles.categoryEditorColumns}>
          <div className={styles.categoryEditorMain}>
            <section className={styles.formCard} aria-labelledby="offer-popup-image">
              <div className={styles.formCardHead}>
                <h2 id="offer-popup-image">{t('admin.offerPopup.sectionImage')}</h2>
                <p>{t('admin.offerPopup.sectionImageBody')}</p>
              </div>

              <PopupImageField
                id="offerPopupImage"
                currentKey={current?.imageKey ?? null}
                currentAspect={current?.aspect ?? null}
              />

              <div className={styles.field}>
                <label htmlFor="offerPopupAlt">
                  {t('admin.offerPopup.altLabel')} <em>{t('common.optional')}</em>
                </label>
                <input
                  className={styles.input}
                  id="offerPopupAlt"
                  name="altText"
                  maxLength={altMax}
                  defaultValue={current?.altText ?? ''}
                />
                <p className={styles.hint}>{t('admin.offerPopup.altHelp')}</p>
              </div>
            </section>
          </div>

          <aside className={styles.categoryEditorAside}>
            <section className={styles.formCard} aria-labelledby="offer-popup-display">
              <div className={styles.formCardHead}>
                <h2 id="offer-popup-display">{t('admin.offerPopup.sectionDisplay')}</h2>
                <p>{t('admin.offerPopup.sectionDisplayBody')}</p>
              </div>

              <input type="hidden" name="isActive" value="false" />
              <label className={styles.switchRow} htmlFor="offerPopupActive">
                <input
                  id="offerPopupActive"
                  name="isActive"
                  type="checkbox"
                  value="true"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                />
                <span className={styles.switchRowText}>
                  <span className={styles.switchRowLabel}>{t('admin.offerPopup.activeLabel')}</span>
                  <span className={styles.hint}>{t('admin.offerPopup.activeHelp')}</span>
                </span>
              </label>

              <p className={styles.outcome} data-tone={isActive ? 'ok' : 'warn'}>
                {isActive ? t('admin.offerPopup.outcomeOn') : t('admin.offerPopup.outcomeOff')}
              </p>
            </section>

            <section className={styles.formCard} aria-labelledby="offer-popup-behaviour">
              <div className={styles.formCardHead}>
                <h2 id="offer-popup-behaviour">{t('admin.offerPopup.behaviourTitle')}</h2>
                <p>{t('admin.offerPopup.behaviourBody')}</p>
              </div>
              <p className={styles.note}>{t('admin.offerPopup.styleNote')}</p>
            </section>
          </aside>
        </div>
      </form>
    </>
  );
}
