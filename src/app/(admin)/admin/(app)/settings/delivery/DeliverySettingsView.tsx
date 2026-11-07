'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { overrideAreas } from '@/lib/delivery-areas';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { RequiredMark } from '../../../_ui/RequiredMark';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../admin.module.css';

export type DeliveryNotice =
  | 'defaultSaved'
  | 'districtSaved'
  | 'districtDeactivated'
  | 'conditionalSaved'
  | 'repeatDeliverySaved'
  | 'repeatDiscountSaved'
  | 'denied'
  | 'conflict'
  | 'invalid';

/** The optional rules (ADR 0029), as the page reads them. */
export type DeliveryPricingRules = {
  conditional: {
    enabled: boolean;
    minSubtotalMinor: number | null;
    dhakaMinor: number | null;
    chattogramMinor: number | null;
    othersMinor: number | null;
  };
  repeat: { enabled: boolean; chattogramMinor: number | null; othersMinor: number | null };
  repeatDiscount: { enabled: boolean; percent: number | null; minSubtotalMinor: number | null };
};

export type OverrideRow = {
  id: number;
  districtCode: string;
  amountMinor: number;
  isActive: boolean;
  updatedAt: string;
};

const NOTICE_KEYS: Record<DeliveryNotice, TranslationKey> = {
  defaultSaved: 'admin.delivery.notice.defaultSaved',
  districtSaved: 'admin.delivery.notice.districtSaved',
  districtDeactivated: 'admin.delivery.notice.districtDeactivated',
  conditionalSaved: 'admin.delivery.notice.conditionalSaved',
  repeatDeliverySaved: 'admin.delivery.notice.repeatDeliverySaved',
  repeatDiscountSaved: 'admin.delivery.notice.repeatDiscountSaved',
  denied: 'admin.delivery.notice.denied',
  conflict: 'admin.delivery.notice.conflict',
  invalid: 'admin.delivery.notice.invalid',
};

const ERROR_NOTICES: readonly DeliveryNotice[] = ['denied', 'conflict', 'invalid'];

/**
 * Taka, without a currency symbol: this is the value the owner types back into the form.
 *
 * A whole amount stays whole, so the field reads "80" and not "80.00" - the poisha are still stored,
 * they are simply not digits the owner never typed.
 */
function taka(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/**
 * Delivery charges.
 *
 * Three customer choices, two configurable overrides: Dhaka and Chattogram may each have their own
 * charge, while **Other districts** always uses the required default. Removing an override returns that
 * area to the default; orders already placed keep the charge they were given.
 *
 * Each area is one row - what it is, what it costs, and the action that saves it - so the charges can
 * be read down one column and every Save lands on the same line. The default is the first row because
 * it is the one that must exist: without it checkout refuses to place an order, and the row says so
 * rather than leaving the owner to infer it from a warning further up the page.
 */
export function DeliverySettingsView({
  defaultMinor,
  overrides,
  pricing,
  notice,
  csrfToken,
}: {
  defaultMinor: number | null;
  overrides: readonly OverrideRow[];
  pricing: DeliveryPricingRules;
  notice: DeliveryNotice | null;
  csrfToken: string;
}) {
  const { t, price } = useTranslation();
  const byArea = new Map(overrides.map((row) => [row.districtCode, row]));
  const defaultArea = t('admin.delivery.defaultAreaName');

  /** What this area costs a customer, stated on the row instead of inferred from two places. */
  function stateFor(row: OverrideRow | undefined): React.ReactNode {
    if (row !== undefined && row.isActive) {
      return <span className={`${styles.pill} ${styles.pillInfo}`}>{t('admin.delivery.ownCharge')}</span>;
    }
    if (defaultMinor === null) {
      return (
        <span className={`${styles.pill} ${styles.pillWarning}`}>
          {t('admin.delivery.usingDefaultUnset')}
        </span>
      );
    }
    return t('admin.delivery.usingDefaultOf', { amount: price(defaultMinor) });
  }

  return (
    <>
      <PageHeader
        title={t('admin.delivery.title')}
        description={t('admin.delivery.body')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      {defaultMinor === null && (
        <Notice tone="warning">{t('admin.delivery.defaultMissing')}</Notice>
      )}

      <section className={styles.section} aria-labelledby="delivery-default">
        <div className={styles.sectionHead}>
          <h2 id="delivery-default">{t('admin.delivery.defaultTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.defaultBody')}</p>

        <div className={styles.settingRows}>
          <div className={styles.settingRow}>
            <form className={styles.settingRowForm} action="/api/admin/delivery" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="default" />
              <div className={styles.settingIdentity}>
                <span className={styles.settingName}>
                  {defaultArea} <RequiredMark />
                </span>
                <span className={styles.settingState}>
                  {defaultMinor === null ? (
                    <span className={`${styles.pill} ${styles.pillWarning}`}>
                      {t('admin.delivery.checkoutBlocked')}
                    </span>
                  ) : (
                    <span className={`${styles.pill} ${styles.pillNeutral}`}>
                      {t('admin.delivery.defaultRequired')}
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.settingMoney}>
                <label className="sr-only" htmlFor="delivery-default-amount">
                  {t('admin.delivery.chargeFieldLabel', { area: defaultArea })}
                </label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id="delivery-default-amount"
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={defaultMinor === null ? '' : taka(defaultMinor)}
                  />
                </div>
              </div>
              <SubmitButton
                label={t('admin.delivery.saveDefault')}
                pendingLabel={t('admin.common.working')}
              />
            </form>
            <div className={styles.settingRemove} aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="delivery-overrides">
        <div className={styles.sectionHead}>
          <h2 id="delivery-overrides">{t('admin.delivery.overridesTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.overridesBody')}</p>

        <div className={styles.settingRows}>
          {overrideAreas().map((area) => {
            const row = byArea.get(area.code);
            const active = row?.isActive === true && row !== undefined;
            return (
              <div className={styles.settingRow} key={area.code}>
                <form className={styles.settingRowForm} action="/api/admin/delivery" method="post">
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="operation" value="saveDistrict" />
                  <input type="hidden" name="districtCode" value={area.code} />
                  <div className={styles.settingIdentity}>
                    <span className={styles.settingName}>{area.name}</span>
                    <span className={styles.settingState}>{stateFor(row)}</span>
                  </div>
                  <div className={styles.settingMoney}>
                    <label className="sr-only" htmlFor={`delivery-amount-${area.code}`}>
                      {t('admin.delivery.chargeFieldLabel', { area: area.name })}
                    </label>
                    <div className={styles.moneyInput}>
                      <span className={styles.moneyPrefix} aria-hidden="true">
                        {t('admin.catalog.currencyMark')}
                      </span>
                      <input
                        className={styles.input}
                        id={`delivery-amount-${area.code}`}
                        name="amount"
                        inputMode="decimal"
                        required
                        defaultValue={active ? taka(row.amountMinor) : ''}
                      />
                    </div>
                  </div>
                  <SubmitButton
                    label={active ? t('admin.delivery.save') : t('admin.delivery.setOverride')}
                    pendingLabel={t('admin.common.working')}
                  />
                </form>
                {/*
                  The remove slot is always present, even when there is nothing to remove: it is
                  what keeps every row the same width, so the amount field and the Save button do
                  not shift depending on whether that district has its own charge.
                */}
                <div className={styles.settingRemove}>
                  {active ? (
                    <ConfirmSubmit
                      action="/api/admin/delivery"
                      csrfToken={csrfToken}
                      fields={{ operation: 'deactivateDistrict', districtCode: area.code }}
                      triggerLabel={t('admin.delivery.deactivate')}
                      triggerVariant="dangerOutline"
                      title={t('admin.delivery.deactivateTitle', { district: area.name })}
                      body={t('admin.delivery.deactivateBody')}
                      confirmLabel={t('admin.delivery.deactivateConfirm')}
                      cancelLabel={t('admin.common.cancel')}
                      pendingLabel={t('admin.common.working')}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/*
        Conditional delivery: a lower charge once the goods subtotal reaches a minimum. The areas match
        the default rule's three choices, because that is the whole area model - a fourth field would be
        a price for nowhere.
      */}
      <section className={styles.section} aria-labelledby="delivery-conditional">
        <div className={styles.sectionHead}>
          <h2 id="delivery-conditional">{t('admin.delivery.conditionalTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.conditionalBody')}</p>

        <form className={styles.formCard} action="/api/admin/delivery" method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="conditional" />

          <label className={styles.switchRow} htmlFor="conditionalEnabled">
            <input
              id="conditionalEnabled"
              name="enabled"
              type="checkbox"
              value="true"
              defaultChecked={pricing.conditional.enabled}
            />
            <span className={styles.switchRowText}>
              <span className={styles.switchRowLabel}>{t('admin.delivery.conditionalEnable')}</span>
              <span className={styles.hint}>{t('admin.delivery.conditionalEnableHelp')}</span>
            </span>
          </label>

          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            <div className={styles.field}>
              <label htmlFor="conditionalMinSubtotal">{t('admin.delivery.conditionalMinimum')}</label>
              <div className={styles.moneyInput}>
                <span className={styles.moneyPrefix} aria-hidden="true">
                  {t('admin.catalog.currencyMark')}
                </span>
                <input
                  className={styles.input}
                  id="conditionalMinSubtotal"
                  name="minSubtotal"
                  inputMode="decimal"
                  defaultValue={
                    pricing.conditional.minSubtotalMinor === null
                      ? ''
                      : taka(pricing.conditional.minSubtotalMinor)
                  }
                />
              </div>
            </div>

            {(
              [
                ['dhaka', 'admin.delivery.areaDhaka', pricing.conditional.dhakaMinor],
                ['chattogram', 'admin.delivery.areaChattogram', pricing.conditional.chattogramMinor],
                ['others', 'admin.delivery.areaOthers', pricing.conditional.othersMinor],
              ] as const
            ).map(([name, labelKey, value]) => (
              <div className={styles.field} key={name}>
                <label htmlFor={`conditional-${name}`}>{t(labelKey)}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id={`conditional-${name}`}
                    name={name}
                    inputMode="decimal"
                    defaultValue={value === null ? '' : taka(value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className={styles.hint}>{t('admin.delivery.conditionalMinimumHelp')}</p>

          <div className={styles.settingActions}>
            <SubmitButton
              label={t('admin.delivery.conditionalSave')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </section>

      {/*
        Repeat-customer delivery: two rates, not three. Chattogram has its own, and Dhaka plus every
        other district share the second - the benefit is deliberately simpler than the conditional rule
        whose place it takes.
      */}
      <section className={styles.section} aria-labelledby="delivery-repeat">
        <div className={styles.sectionHead}>
          <h2 id="delivery-repeat">{t('admin.delivery.repeatTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.repeatBody')}</p>

        <form className={styles.formCard} action="/api/admin/delivery" method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="repeatDelivery" />

          <label className={styles.switchRow} htmlFor="repeatEnabled">
            <input
              id="repeatEnabled"
              name="enabled"
              type="checkbox"
              value="true"
              defaultChecked={pricing.repeat.enabled}
            />
            <span className={styles.switchRowText}>
              <span className={styles.switchRowLabel}>{t('admin.delivery.repeatEnable')}</span>
              <span className={styles.hint}>{t('admin.delivery.repeatEnableHelp')}</span>
            </span>
          </label>

          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            {(
              [
                ['chattogram', 'admin.delivery.areaChattogram', pricing.repeat.chattogramMinor],
                ['others', 'admin.delivery.repeatAreaOthers', pricing.repeat.othersMinor],
              ] as const
            ).map(([name, labelKey, value]) => (
              <div className={styles.field} key={name}>
                <label htmlFor={`repeat-${name}`}>{t(labelKey)}</label>
                <div className={styles.moneyInput}>
                  <span className={styles.moneyPrefix} aria-hidden="true">
                    {t('admin.catalog.currencyMark')}
                  </span>
                  <input
                    className={styles.input}
                    id={`repeat-${name}`}
                    name={name}
                    inputMode="decimal"
                    defaultValue={value === null ? '' : taka(value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className={styles.settingActions}>
            <SubmitButton
              label={t('admin.delivery.repeatSave')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </section>

      {/*
        Repeat-customer discount: a percentage off the goods, above a minimum subtotal. It is a separate
        rule from the delivery benefit and applies alongside whichever delivery charge was resolved.
      */}
      <section className={styles.section} aria-labelledby="delivery-repeat-discount">
        <div className={styles.sectionHead}>
          <h2 id="delivery-repeat-discount">{t('admin.delivery.discountTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.discountBody')}</p>

        <form className={styles.formCard} action="/api/admin/delivery" method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="repeatDiscount" />

          <label className={styles.switchRow} htmlFor="repeatDiscountEnabled">
            <input
              id="repeatDiscountEnabled"
              name="enabled"
              type="checkbox"
              value="true"
              defaultChecked={pricing.repeatDiscount.enabled}
            />
            <span className={styles.switchRowText}>
              <span className={styles.switchRowLabel}>{t('admin.delivery.discountEnable')}</span>
              <span className={styles.hint}>{t('admin.delivery.discountEnableHelp')}</span>
            </span>
          </label>

          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            <div className={styles.field}>
              <label htmlFor="repeatDiscountPercent">{t('admin.delivery.discountPercent')}</label>
              <div className={styles.moneyInput}>
                <span className={styles.moneyPrefix} aria-hidden="true">
                  %
                </span>
                <input
                  className={styles.input}
                  id="repeatDiscountPercent"
                  name="percent"
                  inputMode="numeric"
                  maxLength={3}
                  defaultValue={
                    pricing.repeatDiscount.percent === null ? '' : String(pricing.repeatDiscount.percent)
                  }
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="repeatDiscountMinSubtotal">{t('admin.delivery.discountMinimum')}</label>
              <div className={styles.moneyInput}>
                <span className={styles.moneyPrefix} aria-hidden="true">
                  {t('admin.catalog.currencyMark')}
                </span>
                <input
                  className={styles.input}
                  id="repeatDiscountMinSubtotal"
                  name="minSubtotal"
                  inputMode="decimal"
                  defaultValue={
                    pricing.repeatDiscount.minSubtotalMinor === null
                      ? ''
                      : taka(pricing.repeatDiscount.minSubtotalMinor)
                  }
                />
              </div>
            </div>
          </div>

          <p className={styles.hint}>{t('admin.delivery.discountHelp')}</p>

          <div className={styles.settingActions}>
            <SubmitButton
              label={t('admin.delivery.discountSave')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </section>
    </>
  );
}
