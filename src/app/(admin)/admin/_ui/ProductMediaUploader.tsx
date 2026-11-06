'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

import { MAX_PRODUCT_IMAGES, UPLOAD_ACCEPT } from '@/lib/upload-limits';
import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import { prepareImageFile } from './image-prep';
import styles from '../admin.module.css';

/** One photograph chosen but not yet saved, with the object URL its thumbnail reads. */
export type ProductUploadImage = {
  readonly id: string;
  readonly file: File;
  readonly url: string;
  readonly name: string;
};

export type PreparedProductImage = { file: File; name: string };

/**
 * The product editor's media picker.
 *
 * A product photograph is chosen **with the product**, not after it. The owner drags files in or
 * opens the picker, sees them before saving, orders them, and removes a mistake; the form posts all
 * of them under one `images` field, and the server creates the product and attaches them in one
 * request. That is the ordinary shape of an e-commerce admin panel, and it removes the dead end the
 * create screen used to present ("save the product, then come back and add photographs").
 *
 * The files themselves are what is posted - this component holds no authoritative state. The hidden
 * input's `files` are rebuilt from the chosen list in order, so the order the owner sees is the
 * order the gallery stores.
 */
export function ProductMediaUploader({
  id,
  images,
  onAdd,
  onRemove,
  onMove,
  maxImages = MAX_PRODUCT_IMAGES,
}: {
  id: string;
  images: readonly ProductUploadImage[];
  onAdd: (files: PreparedProductImage[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  maxImages?: number;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The hidden input is the actual form field. React cannot hold a `FileList`, so the chosen files
   * are written back to the input whenever the list changes. This is the one DOM mutation the
   * component performs, and it is what makes removal and reordering affect the submission.
   */
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const transfer = new DataTransfer();
    for (const image of images) transfer.items.add(image.file);
    input.files = transfer.files;
  }, [images]);

  async function accept(list: FileList | null): Promise<void> {
    if (list === null || list.length === 0) return;
    setError(null);

    const incoming = [...list];
    // A file whose type the browser cannot name is still posted; the server decodes the bytes and
    // refuses anything that is not an image. Only a file the browser *knows* is not an image is
    // stopped here, so the owner is not sent on a pointless round trip.
    const notImages = incoming.filter((file) => file.type !== '' && !file.type.startsWith('image/'));
    if (notImages.length > 0) {
      setError(t('admin.catalog.mediaNotImage', { name: notImages[0]?.name ?? '' }));
      return;
    }

    const room = Math.max(0, maxImages - images.length);
    if (incoming.length > room) {
      setError(t('admin.catalog.mediaTooMany', { max: maxImages }));
      return;
    }

    setPreparing(true);
    try {
      const prepared = await Promise.all(
        incoming.map(async (file) => ({ file: await prepareImageFile(file), name: file.name })),
      );
      onAdd(prepared);
    } catch {
      setError(t('admin.catalog.mediaUnreadable'));
    } finally {
      setPreparing(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    void accept(event.dataTransfer.files);
  }

  return (
    <div className={styles.mediaPicker}>
      {/*
        The input stays in the form and stays focusable: it is visually hidden, not removed, so a
        keyboard user can reach it while the visible button remains the obvious target.
      */}
      <input
        ref={inputRef}
        className={styles.fileInput}
        id={id}
        type="file"
        name="images"
        accept={UPLOAD_ACCEPT}
        multiple
        onChange={(event) => {
          void accept(event.currentTarget.files);
          // Allow choosing the same file again after removing it.
          event.currentTarget.value = '';
        }}
      />

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
          // `dragleave` also fires when moving between children; only a leave of the zone counts.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <span className={styles.mediaDropIcon} aria-hidden="true">
          <AdminIcon name="image" width={24} height={24} />
        </span>
        <p className={styles.mediaDropTitle}>{t('admin.catalog.mediaDropTitle')}</p>
        <p className={styles.hint}>{t('admin.catalog.mediaDropHelp', { max: maxImages })}</p>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSecondary}`}
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
        >
          <AdminIcon name="plus" width={16} height={16} />
          {preparing ? t('admin.upload.preparing') : t('admin.catalog.mediaChoose')}
        </button>
      </div>

      {error !== null && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className={styles.note}>{t('admin.catalog.mediaEmpty')}</p>
      ) : (
        <ul className={styles.mediaSelection}>
          {images.map((image, index) => (
            <li className={styles.mediaTile} key={image.id}>
              <span className={styles.mediaTileFrame}>
                {/* The preview is the browser's own object URL for the chosen file, not an upload. */}
                <img src={image.url} alt="" />
              </span>
              {index === 0 && (
                <span className={styles.mediaTileCover}>{t('admin.catalog.mediaCover')}</span>
              )}
              <span className={styles.mediaTileName} title={image.name}>
                {image.name}
              </span>
              <div className={styles.mediaTileActions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}
                  onClick={() => onMove(image.id, -1)}
                  disabled={index === 0}
                  aria-label={t('admin.catalog.mediaMoveEarlier', { name: image.name })}
                >
                  <AdminIcon name="arrowUp" width={14} height={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}
                  onClick={() => onMove(image.id, 1)}
                  disabled={index === images.length - 1}
                  aria-label={t('admin.catalog.mediaMoveLater', { name: image.name })}
                >
                  <AdminIcon name="arrowDown" width={14} height={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonGhost} ${styles.buttonSmall}`}
                  onClick={() => onRemove(image.id)}
                  aria-label={t('admin.catalog.mediaRemove', { name: image.name })}
                >
                  <AdminIcon name="close" width={14} height={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
