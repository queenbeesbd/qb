'use client';

import { useTranslation } from '@/i18n/useTranslation';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../admin.module.css';

/**
 * The checkout policy toggle.
 *
 * A switch, not a text field: the owner is choosing between two named states, and the copy states what
 * each one means for the customer. The hidden `false` field is what makes unticking work at all - an
 * unticked checkbox posts nothing, and "nothing" must not read as "on".
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
        <p>{t('admin.settings.other.checkoutBody')}</p>
      </div>

      <form className={styles.panel} action="/api/admin/settings/checkout" method="post">
        <input type="hidden" name="csrf" value={csrfToken} />
        <input type="hidden" name="guestOrders" value="false" />
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

        <p className={styles.outcome} data-tone={guestOrders ? 'warn' : 'ok'}>
          {guestOrders ? t('admin.settings.other.guestOn') : t('admin.settings.other.guestOff')}
        </p>

        <div className={styles.formActions}>
          <SubmitButton label={t('admin.settings.other.save')} pendingLabel={t('admin.common.working')} />
        </div>
      </form>
    </section>
  );
}
