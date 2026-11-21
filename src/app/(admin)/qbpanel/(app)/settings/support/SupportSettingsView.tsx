'use client';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';

export type SupportNotice = 'saved' | 'denied' | 'invalid';

const NOTICE_KEYS: Record<SupportNotice, TranslationKey> = {
  saved: 'admin.support.notice.saved',
  denied: 'admin.support.notice.denied',
  invalid: 'admin.support.notice.invalid',
};

const ERROR_NOTICES: readonly SupportNotice[] = ['denied', 'invalid'];

/**
 * Settings -> Support links.
 *
 * Two addresses, one form. Each field is optional and a blank one removes its button, which is stated
 * on the page: an empty support button is worse than none, so the shop does not render what it cannot
 * link to. The Messenger field asks for an `m.me` address, because that is the link that opens a chat
 * with the shop; a Facebook page address opens a page to read, which is what this button used to do and
 * what the owner replaced it to stop doing (2026-11-19).
 */
export function SupportSettingsView({
  messengerUrl,
  whatsappUrl,
  notice,
  csrfToken,
  maxLength,
}: {
  messengerUrl: string | null;
  whatsappUrl: string | null;
  notice: SupportNotice | null;
  csrfToken: string;
  maxLength: number;
}) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('admin.support.title')} />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <form className={styles.form} action="/api/qbpanel/support-links" method="post">
        <input type="hidden" name="csrf" value={csrfToken} />

        <section className={styles.formCard} aria-labelledby="support-messenger">
          <div className={styles.formCardHead}>
            <h2 id="support-messenger">{t('admin.support.messengerTitle')}</h2>
          </div>
          <div className={styles.field}>
            <label htmlFor="messengerUrl">{t('admin.support.messengerField')}</label>
            <input
              className={styles.input}
              id="messengerUrl"
              name="messengerUrl"
              type="url"
              inputMode="url"
              placeholder="https://m.me/your-page"
              defaultValue={messengerUrl ?? ''}
              maxLength={maxLength}
            />
            <p className={styles.hint}>{t('admin.support.urlHelp')}</p>
          </div>
        </section>

        <section className={styles.formCard} aria-labelledby="support-whatsapp">
          <div className={styles.formCardHead}>
            <h2 id="support-whatsapp">{t('admin.support.whatsappTitle')}</h2>
          </div>
          <div className={styles.field}>
            <label htmlFor="whatsappUrl">{t('admin.support.whatsappField')}</label>
            <input
              className={styles.input}
              id="whatsappUrl"
              name="whatsappUrl"
              type="url"
              inputMode="url"
              placeholder="https://wa.me/8801XXXXXXXXX"
              defaultValue={whatsappUrl ?? ''}
              maxLength={maxLength}
            />
            <p className={styles.hint}>{t('admin.support.urlHelp')}</p>
          </div>
        </section>

        <div className={styles.formActions}>
          <SubmitButton label={t('admin.support.save')} pendingLabel={t('admin.common.working')} />
        </div>
      </form>
    </>
  );
}
