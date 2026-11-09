'use client';

import { toBdt } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { PaymentInstructions } from '@/server/settings/payment';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

/**
 * Other settings.
 *
 * Two groups, each with its own form and its own save:
 *
 * 1. **Checkout** - the guest-order switch, a policy rather than a rendered value.
 * 2. **Checkout instructions** - the owner's own words and number for advance payment. This was moved
 *    here from Contact and policies: it is checkout copy, not a fact about reaching the shop, and the
 *    owner asked for one topic by that name. The block is still an **instruction**, never a payment
 *    method - Cash on Delivery remains the only method an order records (ADR 0029).
 *
 * **The switches post their own value and nothing else.** A ticked checkbox posts `true` and an
 * unticked one posts nothing, which each route reads as off (it requires the literal `true`, and the
 * payment route reads the whole value list). A hidden `false` companion beside the box was a real
 * defect once - two controls sharing a name, and `form.get()` taking the first, so "on" was
 * impossible - so do not reintroduce one.
 */
export function OtherSettingsView({
  guestOrders,
  payment,
  paymentMaxLengths,
  csrfToken,
}: {
  guestOrders: boolean;
  payment: PaymentInstructions;
  paymentMaxLengths: { readonly instructions: number; readonly note: number };
  csrfToken: string;
}) {
  const { t } = useTranslation();

  return (
    <>
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

      {/*
        Checkout instructions. The owner's paragraphs, the advance-payment number, whether that number
        is drawn at all, the "Payment, not Send Money" caution, and the subtotal below which the
        delivery charge is expected in advance. Every value is stored in `store_setting` and printed
        verbatim at checkout.
      */}
      <section className={styles.section} aria-labelledby="other-instructions">
        <div className={styles.sectionHead}>
          <h2 id="other-instructions">{t('admin.settings.other.instructionsTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.settings.other.instructionsBody')}</p>

        <form
          className={`${styles.formCard} ${styles.formNarrow}`}
          action="/api/qbpanel/settings/payment"
          method="post"
        >
          <input type="hidden" name="csrf" value={csrfToken} />

          <div className={styles.field}>
            <label htmlFor="instructions">{t('admin.payment.instructionsLabel')}</label>
            <textarea
              className={styles.textarea}
              id="instructions"
              name="instructions"
              rows={6}
              defaultValue={payment.instructions}
              maxLength={paymentMaxLengths.instructions}
            />
            <p className={styles.hint}>{t('admin.payment.instructionsHelp')}</p>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="bkashNumber">{t('admin.payment.bkashLabel')}</label>
              <input
                className={styles.input}
                id="bkashNumber"
                name="bkashNumber"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                defaultValue={payment.bkashNumber ?? ''}
              />
              <p className={styles.hint}>{t('admin.payment.bkashHelp')}</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="advanceThreshold">{t('admin.payment.thresholdLabel')}</label>
              <div className={styles.moneyInput}>
                <span className={styles.moneyPrefix} aria-hidden="true">
                  {t('admin.catalog.currencyMark')}
                </span>
                <input
                  className={styles.input}
                  id="advanceThreshold"
                  name="advanceThreshold"
                  inputMode="decimal"
                  defaultValue={String(toBdt(payment.advanceThresholdMinor))}
                />
              </div>
              <p className={styles.hint}>{t('admin.payment.thresholdHelp')}</p>
            </div>
          </div>

          <label className={styles.switchRow} htmlFor="bkashVisible">
            <input
              id="bkashVisible"
              name="bkashVisible"
              type="checkbox"
              value="true"
              defaultChecked={payment.bkashVisible}
            />
            <span className={styles.switchRowText}>
              <span className={styles.switchRowLabel}>{t('admin.payment.visibleLabel')}</span>
              <span className={styles.hint}>{t('admin.payment.visibleHelp')}</span>
            </span>
          </label>

          <div className={styles.field}>
            <label htmlFor="sendMoneyNote">{t('admin.payment.noteLabel')}</label>
            <input
              className={styles.input}
              id="sendMoneyNote"
              name="sendMoneyNote"
              maxLength={paymentMaxLengths.note}
              defaultValue={payment.sendMoneyNote ?? ''}
            />
            <p className={styles.hint}>{t('admin.payment.noteHelp')}</p>
          </div>

          <div className={styles.settingActions}>
            <SubmitButton
              label={t('admin.payment.save')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </section>
    </>
  );
}
