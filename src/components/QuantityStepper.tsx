'use client';

import { MinusIcon, PlusIcon } from './icons';
import styles from './QuantityStepper.module.css';

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** Field id so an external <label> can point at the input. */
  id?: string;
};

/**
 * Accessible quantity control. The numeric input remains editable for keyboard
 * and screen reader users, and typed input is bounded by the parent handler.
 */
function makeClamp(min: number, max: number) {
  return (value: number) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  };
}

/**
 * Accessible quantity control. Typed input is clamped into [min, max] before it
 * reaches the parent, so no component downstream can receive an out-of-range
 * quantity from this field.
 */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  decreaseLabel,
  increaseLabel,
  id,
}: Props) {
  const clamp = makeClamp(min, max);

  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={decreaseLabel}
      >
        <MinusIcon width={16} height={16} />
      </button>
      <input
        id={id}
        className={styles.input}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => {
          onChange(clamp(Number.parseInt(event.target.value, 10)));
        }}
        onBlur={(event) => {
          onChange(clamp(Number.parseInt(event.target.value, 10)));
        }}
      />
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={increaseLabel}
      >
        <PlusIcon width={16} height={16} />
      </button>
    </div>
  );
}
