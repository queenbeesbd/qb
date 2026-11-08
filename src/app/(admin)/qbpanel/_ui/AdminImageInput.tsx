'use client';

import { useState, type ChangeEvent } from 'react';

import { UploadIcon } from '@/components/icons';

import { useTranslation } from '@/i18n/useTranslation';

import styles from '../qbpanel.module.css';
import { prepareImageFile } from './image-prep';

/**
 * The file input every admin upload form uses (owner direction, 2026-11-05).
 *
 * A phone photograph is routinely 5-12 MB and the request body ceiling is 4.5 MB, so a plain input
 * refused exactly the files the owner wants to upload. This prepares the file **in the browser**
 * before the form posts: it is decoded, scaled so the long edge is at most 1600px, and re-encoded as
 * WebP. A 5 MB JPEG arrives at the server as a few hundred kilobytes and the server still makes the
 * real WebP variants it stores; this step only makes the request fit.
 *
 * It degrades honestly. If the browser cannot decode the file (HEIC from an iPhone is the usual case),
 * or the re-encode is not smaller, the original file is submitted and the server's own cap and
 * validation still apply. Nothing about the image is trusted from the client: the server re-derives
 * the key, dimensions, type and size.
 */
export function AdminImageInput({
  id,
  name = 'file',
  accept = 'image/jpeg,image/png,image/webp',
  required = false,
}: {
  id: string;
  name?: string;
  accept?: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [chosen, setChosen] = useState<{ name: string; bytes: number } | null>(null);

  async function prepare(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    const originalName = file.name;
    setChosen({ name: originalName, bytes: file.size });

    // Small enough to post as-is, and no decode cost for the common case.
    if (file.size <= 2 * 1024 * 1024) return;

    setPreparing(true);
    try {
      const prepared = await prepareImageFile(file);
      if (prepared !== file) {
        const transfer = new DataTransfer();
        transfer.items.add(prepared);
        input.files = transfer.files;
        setChosen({ name: originalName, bytes: prepared.size });
      }
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className={styles.filePicker}>
      {/*
        The native control is visually hidden, never removed: the label below opens it, keyboard focus
        still reaches it, and the form posts the same `file` field it always did.
      */}
      <input
        className={styles.fileInput}
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        onChange={(event) => void prepare(event)}
        aria-busy={preparing}
      />
      <label className={styles.fileButton} htmlFor={id}>
        <UploadIcon width={16} height={16} />
        {t('admin.upload.choose')}
      </label>
      <span className={styles.fileName} data-empty={chosen === null} aria-live="polite">
        {preparing
          ? t('admin.upload.preparing')
          : chosen === null
            ? t('admin.upload.noFile')
            : `${chosen.name} · ${formatBytes(chosen.bytes)}`}
      </span>
    </div>
  );
}

/** A file size a person can read, rounded to one decimal above a kilobyte. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
