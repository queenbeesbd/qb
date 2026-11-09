'use client';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import type { StoreContact } from '@/server/settings/contact';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

export type ContactNotice = 'saved' | 'denied' | 'invalid';

const NOTICE_KEYS: Record<ContactNotice, TranslationKey> = {
  saved: 'admin.contact.notice.saved',
  denied: 'admin.contact.notice.denied',
  invalid: 'admin.contact.notice.invalid',
};

const ERROR_NOTICES: readonly ContactNotice[] = ['denied', 'invalid'];

/**
 * Settings -> Contact and policies.
 *
 * Two groups: the facts a customer needs to reach the shop (phone, hours, address), and the policy text
 * the owner is willing to publish. Nothing is prefilled and nothing is suggested - an empty field means
 * the shop does not publish it, and the storefront says so instead of showing a placeholder.
 *
 * The checkout payment instructions were moved out of this page to **Settings -> Other settings ->
 * Checkout instructions**; they are checkout copy, not a fact about reaching the shop.
 */
export function ContactSettingsView({
  contact,
  notice,
  csrfToken,
  maxLengths,
}: {
  contact: StoreContact;
  notice: ContactNotice | null;
  csrfToken: string;
  maxLengths: { readonly phone: number; readonly hours: number; readonly address: number; readonly policy: number };
}) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('admin.contact.title')} description={t('admin.contact.body')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <form className={styles.form} action="/api/qbpanel/settings/contact" method="post">
        <input type="hidden" name="csrf" value={csrfToken} />

        <section className={styles.formCard} aria-labelledby="contact-facts">
          <div className={styles.formCardHead}>
            <h2 id="contact-facts">{t('admin.contact.factsTitle')}</h2>
            <p>{t('admin.contact.factsBody')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="phone">{t('admin.contact.phone')}</label>
            <input
              className={styles.input}
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              defaultValue={contact.phone ?? ''}
              maxLength={maxLengths.phone}
              placeholder="+880 1XXXXXXXXX"
            />
            <p className={styles.hint}>{t('admin.contact.phoneHelp')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="hours">{t('admin.contact.hours')}</label>
            <input
              className={styles.input}
              id="hours"
              name="hours"
              type="text"
              defaultValue={contact.hours ?? ''}
              maxLength={maxLengths.hours}
              placeholder={t('admin.contact.hoursPlaceholder')}
            />
            <p className={styles.hint}>{t('admin.contact.hoursHelp')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="address">{t('admin.contact.address')}</label>
            <textarea
              className={styles.textarea}
              id="address"
              name="address"
              rows={2}
              defaultValue={contact.address ?? ''}
              maxLength={maxLengths.address}
            />
            <p className={styles.hint}>{t('admin.contact.addressHelp')}</p>
          </div>
        </section>

        <section className={styles.formCard} aria-labelledby="contact-policies">
          <div className={styles.formCardHead}>
            <h2 id="contact-policies">{t('admin.contact.policiesTitle')}</h2>
            <p>{t('admin.contact.policiesBody')}</p>
          </div>

          {(
            [
              { name: 'delivery', labelKey: 'admin.contact.delivery', value: contact.delivery },
              { name: 'returns', labelKey: 'admin.contact.returns', value: contact.returns },
              { name: 'privacy', labelKey: 'admin.contact.privacy', value: contact.privacy },
              { name: 'terms', labelKey: 'admin.contact.terms', value: contact.terms },
            ] as const
          ).map((field) => (
            <div className={styles.field} key={field.name}>
              <label htmlFor={field.name}>{t(field.labelKey)}</label>
              <textarea
                className={styles.textarea}
                id={field.name}
                name={field.name}
                rows={4}
                defaultValue={field.value ?? ''}
                maxLength={maxLengths.policy}
              />
              <p className={styles.hint}>{t('admin.contact.policyHelp')}</p>
            </div>
          ))}
        </section>

        <div className={styles.formActions}>
          <SubmitButton label={t('admin.contact.save')} pendingLabel={t('admin.common.working')} />
        </div>
      </form>
    </>
  );
}
