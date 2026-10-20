'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from '../admin.module.css';
import { SubmitButton, type ButtonVariant } from './SubmitButton';

/**
 * A destructive action behind a deliberate confirmation.
 *
 * The form stays a real form post to the same route; this component only intercepts the first
 * submit. The dialog is centred (it is not anchored to a trigger), focuses the cancel action when
 * it opens, closes on Escape, traps Tab, and restores focus to the trigger. The optional reason
 * field lives inside the form, so it is submitted with the action and validated by the browser and
 * the server, never by this component.
 */
export function ConfirmSubmit({
  action,
  csrfToken,
  fields,
  triggerLabel,
  triggerVariant = 'dangerOutline',
  // Default to the standard control height. A destructive trigger sat at 34px while the
  // approve button next to it was 40px, which read as two different classes of action
  // (Phase 24 A-01/A-04).
  small = false,
  disabled = false,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  reason,
  className,
}: {
  action: string;
  csrfToken: string;
  fields: Record<string, string | number>;
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  small?: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  reason?: { label: string; placeholder: string; minLength: number; maxLength: number; required: boolean };
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bypass = useRef(false);
  const [open, setOpen] = useState(false);
  const uid = useId();

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, a[href]',
      );
      if (focusable.length === 0) return;
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
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <form
      ref={formRef}
      action={action}
      method="post"
      className={className}
      onSubmit={(event) => {
        if (bypass.current) {
          bypass.current = false;
          return;
        }
        event.preventDefault();
        setOpen(true);
      }}
    >
      <input type="hidden" name="csrf" value={csrfToken} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        label={triggerLabel}
        pendingLabel={pendingLabel}
        variant={triggerVariant}
        small={small}
        disabled={disabled}
      />

      {open && (
        <div className={styles.dialogBackdrop}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-title`}
            aria-describedby={`${uid}-body`}
          >
            <h2 className={styles.dialogTitle} id={`${uid}-title`}>
              {title}
            </h2>
            <p className={styles.dialogBody} id={`${uid}-body`}>
              {body}
            </p>
            {reason !== undefined && (
              <div className={styles.field}>
                <label htmlFor={`${uid}-reason`}>{reason.label}</label>
                <textarea
                  id={`${uid}-reason`}
                  name="reason"
                  className={styles.textarea}
                  placeholder={reason.placeholder}
                  minLength={reason.minLength}
                  maxLength={reason.maxLength}
                  required={reason.required}
                />
              </div>
            )}
            <div className={styles.dialogActions}>
              <button
                ref={cancelRef}
                type="button"
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => setOpen(false)}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => {
                  bypass.current = true;
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
