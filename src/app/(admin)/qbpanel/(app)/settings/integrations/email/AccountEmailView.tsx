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
 * ADR 0047: the Resend credentials and the origin used in account mail live with the mail integration.
 * The page receives only presence and masked hints; no value is ever serialized into the response.
 */
export function AccountEmailView({
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
        title={t('admin.integrations.emailTitle')}
        description={t('admin.providers.email.body')}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/qbpanel/settings/integrations">
            {t('admin.integrations.backToHub')}
          </Link>
        }
      />
      {notice !== null && (
        <Notice tone={notice === 'saved' ? 'success' : 'error'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <section className={styles.section} aria-labelledby="email-credentials">
        <div className={styles.sectionHead}>
          <h2 id="email-credentials">{t('admin.providers.email.title')}</h2>
        </div>
        <form className={styles.formCard} action={PROVIDER_CREDENTIALS_SAVE_PATH} method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="section" value="email" />
          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            <CredentialField
              name="resendApiKey"
              label={t('admin.providers.email.apiKey')}
              status={status.resendApiKey}
              placeholder={t('admin.providers.placeholder')}
            />
            <CredentialField
              name="resendFrom"
              label={t('admin.providers.email.from')}
              status={status.resendFrom}
              placeholder={t('admin.providers.placeholder')}
              type="text"
            />
            <CredentialField
              name="baseUrl"
              label={t('admin.providers.site.baseUrl')}
              status={status.baseUrl}
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
