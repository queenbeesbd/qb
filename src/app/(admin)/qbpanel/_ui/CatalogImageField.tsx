'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { imageVariantPath } from '@/lib/images';
import { UPLOAD_ACCEPT } from '@/lib/upload-limits';
import { AdminIcon } from './icons';
import { prepareImageFile } from './image-prep';
import styles from '../qbpanel.module.css';

/**
 * One photograph for a category or a brand, chosen **with the record**.
 *
 * The category and brand editors used to save the record first and attach a photograph in a second
 * form. This control is the same shape as the product picker: a real drop zone, a local upload that
 * is prepared in the browser, a preview before saving, and an optional choice from the shop's own
 * inventory. The parent form is `multipart/form-data`; the server stores the file and writes the row
 * and its image in one transaction.
 *
 * `imageKey` is the existing-inventory choice. An empty value means "keep what is there" (or "no
 * photo" on create); removing is its own explicit checkbox so a save cannot clear a photograph by
 * omission.
 */
export function CatalogImageField({
  id,
  currentKey,
  assetKeys,
  shape = 'square',
}: {
  id: string;
  currentKey: string | null;
  assetKeys: readonly string[];
  /** The storefront draws a category photograph in a square and a brand mark in a circle. */
  shape?: 'square' | 'circle';
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A chosen file's object URL lives only while it is the preview; every replacement revokes the old.
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
      setSelectedName(file.name);
      setPreviewKey('');
      setRemove(false);
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

  function chooseExisting(key: string): void {
    setPreviewKey(key);
    setSelectedName(null);
    setRemove(false);
    setPreviewUrl(null);
    if (inputRef.current !== null) inputRef.current.value = '';
  }

  const key = previewKey === '' ? currentKey : previewKey;
  const visibleUrl = previewUrl ?? (remove || key === null ? null : imageVariantPath(key));

  return (
    <div className={styles.catalogImageField}>
      <div
        className={styles.catalogImagePreview}
        data-shape={shape}
        data-empty={visibleUrl === null ? 'true' : undefined}
      >
        {visibleUrl === null ? (
          <span className={styles.catalogImageEmpty}>
            {remove ? t('admin.imageField.willRemove') : t('admin.imageField.none')}
          </span>
        ) : (
          // The path is derived from a server-validated key (or a local object URL), never a URL from
          // the record; a chosen file is a preview of bytes the server has not seen yet.
          <img src={visibleUrl} alt="" />
        )}
      </div>

      <div className={styles.catalogImageControl}>
        <input
          ref={inputRef}
          className={styles.fileInput}
          id={id}
          type="file"
          name="image"
          accept={UPLOAD_ACCEPT}
          onChange={(event) => {
            void accept(event.currentTarget.files?.[0]);
            // Allow choosing the same file again after another selection.
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
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={onDrop}
        >
          <span className={styles.mediaDropIcon} aria-hidden="true">
            <AdminIcon name="image" width={22} height={22} />
          </span>
          <p className={styles.mediaDropTitle}>{t('admin.imageField.dropTitle')}</p>
          <p className={styles.hint}>{t('admin.imageField.dropHelp')}</p>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => inputRef.current?.click()}
            disabled={preparing}
          >
            <AdminIcon name="plus" width={16} height={16} />
            {preparing ? t('admin.upload.preparing') : t('admin.imageField.upload')}
          </button>
        </div>

        {selectedName !== null && (
          <p className={styles.note}>{t('admin.imageField.chosen', { name: selectedName })}</p>
        )}
        {error !== null && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.field}>
          <label htmlFor={`${id}-existing`}>{t('admin.imageField.choose')}</label>
          <select
            className={styles.select}
            id={`${id}-existing`}
            name="imageKey"
            value={previewKey}
            onChange={(event) => chooseExisting(event.target.value)}
          >
            <option value="">{currentKey === null ? t('admin.imageField.none') : t('admin.imageField.keep')}</option>
            {assetKeys.map((asset) => (
              <option value={asset} key={asset}>
                {asset}
              </option>
            ))}
          </select>
        </div>

        {currentKey !== null && previewUrl === null && (
          <label className={styles.catalogImageRemove} htmlFor={`${id}-remove`}>
            <input
              id={`${id}-remove`}
              type="checkbox"
              name="removeImage"
              value="true"
              checked={remove}
              onChange={(event) => {
                setRemove(event.target.checked);
                setPreviewKey('');
              }}
            />
            <span>{t('admin.imageField.remove')}</span>
          </label>
        )}
      </div>
    </div>
  );
}
