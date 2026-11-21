'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { PROVIDER_KEYS } from '@/lib/provider-keys';
import type { ProviderCredentialStatus } from '@/server/integrations/provider-credentials';
import { AdminIcon } from './icons';
import styles from '../qbpanel.module.css';
import field from './CredentialField.module.css';

/**
 * A write-only provider field (ADR 0047).
 *
 * The server never sends the stored value, only whether one exists and its last four characters. A
 * blank submission keeps what is saved. Removal is a separate, confirmed act because a stored secret
 * cannot be recovered: the Remove control opens a dialog that names the credential and states the
 * consequence, and only its confirm button submits the `clear` value.
 */
export function CredentialField({
  name,
  label,
  status,
  placeholder,
  type = 'password',
}: {
  name: keyof ProviderCredentialStatus;
  label: string;
  status: ProviderCredentialStatus[typeof name];
  placeholder: string;
  type?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    // Capture, so a page handler cannot swallow Escape before the dialog sees it.
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  function confirmRemove(): void {
    const form = triggerRef.current?.closest('form');
    setClearPending(true);
    setOpen(false);
    // The hidden value is rendered from state; submit after React has committed it.
    requestAnimationFrame(() => form?.requestSubmit());
  }

  return (
    <div className={field.field}>
      <label className={field.label} htmlFor={`credential-${name}`}>
        {label}
      </label>
      <input
        id={`credential-${name}`}
        className={field.input}
        name={name}
        type={type}
        autoComplete="off"
        placeholder={placeholder}
      />
      {/*
        Always submitted, but empty unless the confirm dialog was used. The route ignores values that
        are not one of its own setting keys, so an empty entry cannot remove anything.
      */}
      <input type="hidden" name="clear" value={clearPending ? PROVIDER_KEYS[name] : ''} readOnly />
      <div className={field.status}>
        <span className={field.hint}>
          {status.set ? t('admin.providers.stored', { hint: status.hint ?? '' }) : t('admin.providers.notSaved')}
        </span>
        {status.set && (
          <button
            ref={triggerRef}
            type="button"
            className={field.removeButton}
            onClick={() => setOpen(true)}
            aria-label={t('admin.providers.removeLabel', { label })}
          >
            <AdminIcon name="trash" width={14} height={14} />
            {t('admin.providers.remove')}
          </button>
        )}
      </div>

      {open && (
        <div className={styles.dialogBackdrop} onClick={() => setOpen(false)}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className={styles.dialogTitle} id={titleId}>
              {t('admin.providers.removeTitle', { label })}
            </h2>
            <p className={styles.dialogBody} id={bodyId}>
              {t('admin.providers.removeBody', { label })}
            </p>
            <div className={styles.dialogActions}>
              <button ref={cancelRef} type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => setOpen(false)}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className={field.confirmButton} onClick={confirmRemove}>
                {t('admin.providers.removeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
