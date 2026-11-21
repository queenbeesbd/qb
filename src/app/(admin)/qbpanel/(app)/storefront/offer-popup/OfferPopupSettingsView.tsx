'use client';

import { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { heroImagePath, imageVariantPath } from '@/lib/images';
import { AdminImageInput } from '../../../_ui/AdminImageInput';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
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

export type PopupAspect = 'square' | 'wide';

/**
 * Storefront -> Offer popup.
 *
 * One image, one description, one switch. The image is uploaded or replaced here; the frame is chosen
 * from the uploaded file's own ratio by the server, and previewed locally from the same bytes.
 *
 * **Rebuilt for the phone on 2026-11-21.** The page was 1,622px tall at 390px for three controls, and
 * it said the same fact four times: a subtitle under the title, an `.outcome` line in the Display card,
 * a "How it behaves" card, and the storefront's own behaviour in prose. The one thing the owner
 * actually decides - shown or not - was the third block down, below the upload.
 *
 * The order is now the decision's own order: **the picture, then whether it is shown, then its
 * description.** The frame is stated once, beside the preview it describes, and it is derived from the
 * file rather than asserted in a standing paragraph. The switch is a real control at the control scale
 * with the state it produces as its own label, so there is no separate status sentence to keep in step
 * with it. Nothing about what is stored changed - one row, one image, one switch.
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState<PopupAspect | null>(current?.aspect ?? null);
  // A staged file replaces whatever is stored, and nothing on this screen can put the old one back.
  const replacing = previewUrl !== null && current !== null;

  useEffect(() => {
    if (previewUrl === null) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // The square frame is a 600px catalog variant; the wide frame is a 1600px hero variant. Both come
  // from the stored key and frame, never from a URL in the record.
  const storedSource =
    current === null
      ? null
      : current.aspect === 'wide'
        ? heroImagePath(current.imageKey)
        : imageVariantPath(current.imageKey);
  const src = previewUrl ?? storedSource;
  const aspect = previewAspect ?? current?.aspect ?? 'square';
  const frameNote = aspect === 'wide' ? t('admin.offerPopup.frameWide') : t('admin.offerPopup.frameSquare');

  return (
    <>
      <PageHeader title={t('admin.offerPopup.title')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <form
        className={styles.offerForm}
        action="/api/qbpanel/settings/offer-popup"
        method="post"
        encType="multipart/form-data"
      >
        <input type="hidden" name="csrf" value={csrfToken} />

        {/*
          An action bar with the action, and the one warning that must travel with it.

          The bar carried a status sentence that repeated what the switch below says. What it carries
          now is the fact the owner cannot learn anywhere else at the moment it matters: replacing a
          stored picture is irreversible from this screen. A dialog cannot carry the upload - the
          chosen file lives in the input and a second form would lose it - so the consequence is stated
          beside the control that commits it, while a replacement is staged and before it is saved.
          The entry is a polite status, not an alarm: it appears when there is something to lose.
        */}
        <header className={styles.formHeader}>
          <div className={styles.formHeaderActions}>
            <SubmitButton label={t('admin.offerPopup.save')} pendingLabel={t('admin.common.working')} />
          </div>
          {replacing && (
            <p className={styles.formHeaderNote} role="status">
              {t('admin.offerPopup.replacingWarning')}
            </p>
          )}
        </header>

        <section className={styles.formCard} aria-labelledby="offer-popup-image">
          <div className={styles.formCardHead}>
            <h2 id="offer-popup-image">{t('admin.offerPopup.sectionImage')}</h2>
            <p>{t('admin.offerPopup.imageLede')}</p>
          </div>

          <div className={styles.offerMedia}>
            <div className={styles.offerPreview} data-aspect={aspect} data-empty={src === null ? 'true' : undefined}>
              {src === null ? (
                <span className={styles.catalogImageEmpty}>{t('admin.offerPopup.noImage')}</span>
              ) : (
                <img
                  src={src}
                  alt=""
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth === 0 || naturalHeight === 0) return;
                    const ratio = naturalWidth / naturalHeight;
                    setPreviewAspect(Math.abs(ratio - 1) <= Math.abs(ratio - 16 / 9) ? 'square' : 'wide');
                  }}
                />
              )}
            </div>

            <div className={styles.offerMediaControl}>
              <AdminImageInput
                id="offerPopupImage"
                name="image"
                accept="image/jpeg,image/png,image/webp"
                onPrepared={(file) => setPreviewUrl(file === null ? null : URL.createObjectURL(file))}
              />
              <p className={styles.hint} aria-live="polite">
                {frameNote}
              </p>
            </div>
          </div>
        </section>

        <section className={styles.formCard} aria-labelledby="offer-popup-display">
          <div className={styles.formCardHead}>
            <h2 id="offer-popup-display">{t('admin.offerPopup.sectionDisplay')}</h2>
          </div>

          {/*
            An unticked checkbox posts nothing, and the service reads a missing field as "not shown",
            so the hidden `false` keeps the pair honest in both directions: the box posts `true` when
            ticked, and the hidden input posts `false` when it is not.
          */}
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
              <span className={styles.switchRowLabel}>
                {isActive ? t('admin.offerPopup.switchOn') : t('admin.offerPopup.switchOff')}
              </span>
              <span className={styles.hint}>{t('admin.offerPopup.visibleHint')}</span>
            </span>
          </label>
        </section>

        <section className={styles.formCard} aria-labelledby="offer-popup-description">
          {/*
            The heading **is** the label. It used to be a heading, a help paragraph, and then a second
            visible label saying the same word - three statements of one fact on a phone. The optional
            qualifier lives in the label, which is where it belongs, and the input is named by the
            heading itself so a screen reader still hears it.
          */}
          <div className={styles.formCardHead}>
            <h2 id="offer-popup-description">
              {t('admin.offerPopup.altLabel')} <em>{t('common.optional')}</em>
            </h2>
            <p id="offer-popup-description-help">{t('admin.offerPopup.altHelp')}</p>
          </div>

          <input
            className={styles.input}
            id="offerPopupAlt"
            name="altText"
            maxLength={altMax}
            defaultValue={current?.altText ?? ''}
            placeholder={t('admin.offerPopup.altPlaceholder')}
            aria-labelledby="offer-popup-description"
            aria-describedby="offer-popup-description-help"
          />
        </section>
      </form>
    </>
  );
}
