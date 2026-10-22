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
  | 'denied'
  | 'conflict'
  | 'invalid';

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
  notice,
  csrfToken,
}: {
  defaultMinor: number | null;
  overrides: readonly OverrideRow[];
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
    </>
  );
}
