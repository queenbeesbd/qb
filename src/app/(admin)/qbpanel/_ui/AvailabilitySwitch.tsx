'use client';

import { useFormStatus } from 'react-dom';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../qbpanel.module.css';

/**
 * The In Stock / Out of Stock control (D19).
 *
 * It posts the same server-checked endpoint as before - this component removes friction, not
 * authority. The body is the next state, and the button is a real switch: `aria-checked` states the
 * current state while the visible text names it, so the control is not colour-only. A pending
 * submit disables it and shows a spinner in place, so the row cannot be toggled twice.
 */
export function AvailabilitySwitch({
  productId,
  productName,
  availability,
  csrfToken,
  canManage,
}: {
  productId: number;
  productName: string;
  availability: string;
  csrfToken: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const inStock = availability === 'in_stock';

  return (
    <form action="/api/qbpanel/catalog/availability" method="post" className={styles.switchForm}>
      <input type="hidden" name="csrf" value={csrfToken} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="availability" value={inStock ? 'out_of_stock' : 'in_stock'} />
      <SwitchButton
        on={inStock}
        disabled={!canManage}
        label={inStock ? t('admin.catalog.inStock') : t('admin.catalog.outOfStock')}
        ariaLabel={t('admin.catalog.availabilitySwitch', { product: productName })}
        pendingLabel={t('admin.common.working')}
      />
    </form>
  );
}

function SwitchButton({
  on,
  disabled,
  label,
  ariaLabel,
  pendingLabel,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  ariaLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled || pending}
      className={on ? `${styles.switch} ${styles.switchOn}` : styles.switch}
    >
      <span className={styles.switchKnob} aria-hidden="true" />
      <span>{pending ? pendingLabel : label}</span>
    </button>
  );
}
