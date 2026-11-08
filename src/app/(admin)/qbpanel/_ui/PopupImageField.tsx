'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { heroImagePath, imageVariantPath } from '@/lib/images';
import { UPLOAD_ACCEPT } from '@/lib/upload-limits';
import { AdminIcon } from './icons';
import { prepareImageFile } from './image-prep';
import styles from '../qbpanel.module.css';

export type PopupAspect = 'square' | 'wide';

/**
 * The offer popup's image.
 *
 * The frame is not a control: the server compares the uploaded file's ratio with 1:1 and 16:9 and
 * stores the closer one. The preview does the same locally on the image's `load`, so the owner sees
 * which frame will be kept before saving. The current image is read through the same path helper the
 * storefront uses, so a square and a 16:9 popup preview their real file.
 */
export function PopupImageField({
  id,
  currentKey,
  currentAspect,
}: {
  id: string;
  currentKey: string | null;
  currentAspect: PopupAspect | null;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState<PopupAspect | null>(currentAspect);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (previewUrl === null) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function accept(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setError(null);
    if (file.type !== '' && !file.type.startsWith('image/')) {
      setError(t('admin.imageField.invalid'));
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareImageFile(file);
      const transfer = new DataTransfer();
      transfer.items.add(prepared);
      if (inputRef.current !== null) inputRef.current.files = transfer.files;
      setName(file.name);
      setPreviewUrl(URL.createObjectURL(prepared));
    } catch {
      setError(t('admin.imageField.invalid'));
    } finally {
      setPreparing(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    void accept(event.dataTransfer.files[0]);
  }

  const currentSource =
    currentKey === null || currentAspect === null
      ? null
      : currentAspect === 'wide'
        ? heroImagePath(currentKey)
        : imageVariantPath(currentKey);
  const src = previewUrl ?? currentSource;
  const aspect = previewAspect ?? currentAspect ?? 'square';

  return (
    <div className={styles.popupImageField}>
      <input
        ref={inputRef}
        className={styles.fileInput}
        id={id}
        type="file"
        name="image"
        accept={UPLOAD_ACCEPT}
        onChange={(event) => {
          void accept(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      <div className={styles.popupImagePreview} data-aspect={aspect} data-empty={src === null ? 'true' : undefined}>
        {src === null ? (
          <span className={styles.catalogImageEmpty}>{t('admin.offerPopup.noImage')}</span>
        ) : (
          // The square path is a 600px catalog variant; the wide path is a 1600px hero variant. Both
          // come from the key and the stored frame, never from a URL in the record.
          <img
            src={src}
            alt=""
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth === 0 || naturalHeight === 0) return;
              const ratio = naturalWidth / naturalHeight;
              setPreviewAspect(
                Math.abs(ratio - 1) <= Math.abs(ratio - 16 / 9) ? 'square' : 'wide',
              );
            }}
          />
        )}
      </div>

      <div className={styles.popupImageControl}>
        <div
          className={styles.mediaDrop}
          data-dragging={dragging}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={onDrop}
        >
          <span className={styles.mediaDropIcon} aria-hidden="true">
            <AdminIcon name="image" width={22} height={22} />
          </span>
          <p className={styles.mediaDropTitle}>{t('admin.offerPopup.dropTitle')}</p>
          <p className={styles.hint}>{t('admin.offerPopup.dropHelp')}</p>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => inputRef.current?.click()}
            disabled={preparing}
          >
            <AdminIcon name="plus" width={16} height={16} />
            {preparing ? t('admin.upload.preparing') : t('admin.offerPopup.choose')}
          </button>
        </div>

        {name !== null && <p className={styles.note}>{t('admin.imageField.chosen', { name })}</p>}
        {error !== null && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <p className={styles.hint}>
          {aspect === 'wide'
            ? t('admin.offerPopup.frameWide')
            : t('admin.offerPopup.frameSquare')}
        </p>
      </div>
    </div>
  );
}
