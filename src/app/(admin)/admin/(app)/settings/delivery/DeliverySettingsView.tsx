'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { overrideAreas } from '@/lib/delivery-areas';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
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

/** Taka, without a currency symbol: this is the value the owner types back into the form. */
function taka(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Delivery charges.
 *
 * Three customer choices, two configurable overrides: Dhaka and Chattogram may each have their own
 * charge, while **Other districts** always uses the required default. Removing an override returns that
 * area to the default; orders already placed keep the charge they were given.
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

  return (
    <>
      <PageHeader
        eyebrow={t('admin.nav.group.settings')}
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
        <div className={styles.card}>
          <p className={styles.hint}>{t('admin.delivery.defaultBody')}</p>
          <p className={styles.factValue}>
            {defaultMinor === null ? t('admin.delivery.unconfigured') : price(defaultMinor)}
          </p>
          <form className={styles.inlineForm} action="/api/admin/delivery" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="default" />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('admin.delivery.amountLabel')}</span>
              <input
                className={styles.input}
                name="amount"
                inputMode="decimal"
                required
                defaultValue={defaultMinor === null ? '' : taka(defaultMinor)}
                placeholder="80"
              />
            </label>
            <SubmitButton
              label={t('admin.delivery.saveDefault')}
              pendingLabel={t('admin.common.working')}
            />
          </form>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="delivery-overrides">
        <div className={styles.sectionHead}>
          <h2 id="delivery-overrides">{t('admin.delivery.overridesTitle')}</h2>
        </div>
        <p className={styles.hint}>{t('admin.delivery.overridesBody')}</p>

        <div className={styles.formGrid}>
          {overrideAreas().map((area) => {
            const row = byArea.get(area.code);
            const active = row?.isActive === true;
            const name = area.name;
            const fallback =
              defaultMinor === null ? '' : ' — ' + price(defaultMinor);
            return (
              <div className={styles.card} key={area.code}>
                <h3>{t('admin.delivery.overrideTitle', { area: name })}</h3>
                <p className={styles.hint}>{t('admin.delivery.overrideBody')}</p>
                <p>
                  {active && row !== undefined
                    ? price(row.amountMinor)
                    : t('admin.delivery.usingDefault') + fallback}
                </p>
                <form className={styles.inlineForm} action="/api/admin/delivery" method="post">
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="operation" value="saveDistrict" />
                  <input type="hidden" name="districtCode" value={area.code} />
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('admin.delivery.amountLabel')}</span>
                    <input
                      className={styles.input}
                      name="amount"
                      inputMode="decimal"
                      required
                      defaultValue={active && row !== undefined ? taka(row.amountMinor) : ''}
                      placeholder="120"
                    />
                  </label>
                  <SubmitButton
                    label={active ? t('admin.delivery.save') : t('admin.delivery.setOverride')}
                    pendingLabel={t('admin.common.working')}
                  />
                </form>
                {active && row !== undefined ? (
                  <ConfirmSubmit
                    action="/api/admin/delivery"
                    csrfToken={csrfToken}
                    fields={{ operation: 'deactivateDistrict', districtCode: area.code }}
                    triggerLabel={t('admin.delivery.deactivate')}
                    triggerVariant="dangerOutline"
                    title={t('admin.delivery.deactivateTitle', { district: name })}
                    body={t('admin.delivery.deactivateBody')}
                    confirmLabel={t('admin.delivery.deactivateConfirm')}
                    cancelLabel={t('admin.common.cancel')}
                    pendingLabel={t('admin.common.working')}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
