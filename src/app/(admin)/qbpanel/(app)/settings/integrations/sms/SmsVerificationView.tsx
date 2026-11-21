'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { PROVIDER_CREDENTIALS_SAVE_PATH } from '@/server/auth/constants';
import type { ProviderCredentialStatus } from '@/server/integrations/provider-credentials';
import { CredentialField } from '../../../../_ui/CredentialField';
import { Notice } from '../../../../_ui/Notice';
import { PageHeader } from '../../../../_ui/PageHeader';
import { SubmitButton } from '../../../../_ui/SubmitButton';
import styles from '../../../../qbpanel.module.css';

export type ProviderNotice = 'saved' | 'invalid' | 'denied';

const NOTICE_KEYS: Record<ProviderNotice, TranslationKey> = {
  saved: 'admin.providers.notice.saved',
  invalid: 'admin.providers.notice.invalid',
  denied: 'admin.providers.notice.denied',
};

/**
 * ADR 0047: BulkSMS credentials live with the channel they power. Codes are sent only for account
 * registration and recovery, never for orders or marketing.
 */
export function SmsVerificationView({
  status,
  notice,
  csrfToken,
}: {
  status: ProviderCredentialStatus;
  notice: ProviderNotice | null;
  csrfToken: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader
        title={t('admin.integrations.smsTitle')}
        description={t('admin.providers.sms.body')}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/qbpanel/settings/integrations">
            {t('admin.integrations.backToHub')}
          </Link>
        }
      />
      {notice !== null && (
        <Notice tone={notice === 'saved' ? 'success' : 'error'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-labelledby="sms-credentials">
        <div className={styles.sectionHead}>
          <h2 id="sms-credentials">{t('admin.providers.sms.title')}</h2>
        </div>
        <form className={styles.formCard} action={PROVIDER_CREDENTIALS_SAVE_PATH} method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="section" value="sms" />
          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            <CredentialField
              name="smsApiKey"
              label={t('admin.providers.sms.apiKey')}
              status={status.smsApiKey}
              placeholder={t('admin.providers.placeholder')}
            />
            <CredentialField
              name="smsSenderId"
              label={t('admin.providers.sms.senderId')}
              status={status.smsSenderId}
              placeholder={t('admin.providers.placeholder')}
              type="text"
            />
          </div>
          <p className={styles.hint}>{t('admin.providers.envFallback')}</p>
          <div className={styles.formActions}>
            <SubmitButton label={t('admin.providers.save')} pendingLabel={t('admin.common.working')} />
          </div>
        </form>
      </section>
    </>
  );
}
