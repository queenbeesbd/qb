'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

/**
 * The checkout policy toggle.
 *
 * A switch, not a text field: the owner is choosing between two named states, and the copy states what
 * each one means for the customer.
 *
 * **The box posts its own value and nothing else.** A ticked checkbox posts `true` and an unticked one
 * posts nothing, which the policy reads as off (it requires the literal `true`) - so the hidden
 * `false` companion that used to sit above this box was not merely redundant, it was the defect: two
 * controls carried the same name, `form.get()` returns the first one in the document, and the hidden
 * `false` therefore won every submission. Guest ordering could be switched **off** and never **on**,
 * and the panel still reported "saved". The route now reads the whole value list so any explicit
 * `true` wins; this form posts one value.
 *
 * The saved policy is stated once as a state token plus the consequence of that state, and it
 * describes the **saved** value rather than the box's current tick - the same draft-versus-saved split
 * the announcement editor uses. It is deliberately not a second bordered box: against the switch's own
 * border it read as a third control, and the two edges touched because the panel gave its children no
 * vertical gap at all.
 */
export function OtherSettingsView({
  guestOrders,
  csrfToken,
}: {
  guestOrders: boolean;
  csrfToken: string;
}) {
  const { t } = useTranslation();

  return (
    <section className={styles.section} aria-labelledby="other-checkout">
      <div className={styles.sectionHead}>
        <h2 id="other-checkout">{t('admin.settings.other.checkoutTitle')}</h2>
      </div>
      <p className={styles.hint}>{t('admin.settings.other.checkoutBody')}</p>

      <form
        className={`${styles.formCard} ${styles.formNarrow}`}
        action="/api/qbpanel/settings/checkout"
        method="post"
      >
        <input type="hidden" name="csrf" value={csrfToken} />
        <label className={styles.switchRow} htmlFor="guestOrders">
          <input
            id="guestOrders"
            name="guestOrders"
            type="checkbox"
            value="true"
            defaultChecked={guestOrders}
          />
          <span className={styles.switchRowText}>
            <span className={styles.switchRowLabel}>{t('admin.settings.other.guestLabel')}</span>
            <span className={styles.hint}>{t('admin.settings.other.guestHelp')}</span>
          </span>
        </label>

        <p className={styles.savedState}>
          <span className={`${styles.pill} ${guestOrders ? styles.pillSuccess : styles.pillNeutral}`}>
            {guestOrders
              ? t('admin.settings.other.guestStateOn')
              : t('admin.settings.other.guestStateOff')}
          </span>
          <span className={styles.savedStateNote}>
            {guestOrders ? t('admin.settings.other.guestOn') : t('admin.settings.other.guestOff')}
          </span>
        </p>

        <div className={styles.settingActions}>
          <SubmitButton
            label={t('admin.settings.other.save')}
            pendingLabel={t('admin.common.working')}
          />
        </div>
      </form>
    </section>
  );
}
