'use client';

import { useFormStatus } from 'react-dom';

import styles from '../qbpanel.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline';

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: '',
  secondary: styles.buttonSecondary,
  ghost: styles.buttonGhost,
  danger: styles.buttonDanger,
  dangerOutline: styles.buttonDangerOutline,
};

/**
 * A submit button that knows its form is in flight.
 *
 * `useFormStatus` is what makes repeat submissions impossible without inventing a second request
 * path: the button disables itself while the native post is pending, and the spinner is CSS on the
 * button it belongs to, so nothing shifts in the layout.
 */
export function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
  small = false,
  wide = false,
  disabled = false,
  className,
}: {
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  small?: boolean;
  wide?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const classes = [
    styles.button,
    VARIANT_CLASS[variant],
    small ? styles.buttonSmall : '',
    wide ? styles.buttonWide : '',
    pending ? styles.buttonPending : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="submit" className={classes} disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
