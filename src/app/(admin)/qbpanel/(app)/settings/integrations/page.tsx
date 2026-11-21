import Link from 'next/link';

import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { withTransaction } from '@/db/client';
import { loadSteadfastSettings, publicStatus } from '@/server/integrations/steadfast';
import { listTelegramRecipients } from '@/server/integrations/telegram';
import { providerCredentialStatus } from '@/server/integrations/provider-credentials';
import { AdminIcon } from '../../../_ui/icons';
import { PageHeader } from '../../../_ui/PageHeader';
import { StatusPill } from '../../../_ui/StatusPill';
import styles from '../../../qbpanel.module.css';

export const dynamic = 'force-dynamic';

/**
 * Integrations.
 *
 * A hub, not a settings form: each integration is a destination for information the shop already holds
 * - where order notifications go, and where a confirmed parcel is sent. It is its own screen so the
 * sidebar grows once, not once per provider, and so a future integration is added beside these instead
 * of inside them.
 *
 * Requires `settings.write` (a destination receives customer details, which is a settings-level act).
 */
export default async function IntegrationsPage() {
  await requireAdminPage(PERMISSIONS.settingsWrite);

  const providers = await providerCredentialStatus();
  const botReady = providers.telegramBotToken.set;
  const mailReady = providers.resendApiKey.set && providers.resendFrom.set;
  const smsReady = providers.smsApiKey.set && providers.smsSenderId.set;
  const { recipients, steadfast } = await withTransaction(async (tx) => ({
    recipients: await listTelegramRecipients(tx),
    steadfast: publicStatus(await loadSteadfastSettings(tx)),
  }));
  const active = recipients.filter((recipient) => recipient.isActive).length;
  const steadfastReady = steadfast.configured && steadfast.enabled;

  return (
    <>
      <PageHeader title={translate('admin.integrations.title')} />

      <section className={styles.section} aria-labelledby="integration-list">
        <div className={styles.sectionHead}>
          <h2 id="integration-list">{translate('admin.integrations.listTitle')}</h2>
        </div>

        <ul className={styles.recordList} data-admin-list="">
          <li className={`${styles.record} ${styles.recordWithOverlay}`}>
            {/* The row opens the integration; there is no separate "Open" control to aim at. */}
            <Link
              className={styles.recordOverlay}
              href="/qbpanel/settings/integrations/telegram"
              aria-label={`${translate('admin.integrations.open')} ${translate('admin.integrations.telegramTitle')}`}
            />
            <span className={styles.recordThumb} aria-hidden="true">
              <AdminIcon name="bell" width={18} height={18} />
            </span>
            <div className={styles.recordMain}>
              <span className={styles.recordTitle}>{translate('admin.integrations.telegramTitle')}</span>
              <span className={styles.recordMeta}>
                <span>{translate('admin.integrations.telegramSummary')}</span>
              </span>
            </div>
            <div className={styles.recordSide}>
              <StatusPill tone={botReady && active > 0 ? 'success' : 'neutral'}>
                {!botReady
                  ? translate('admin.integrations.botMissing')
                  : active === 1
                    ? translate('admin.integrations.rosterBodyOne')
                    : translate('admin.integrations.listBody', { count: active })}
              </StatusPill>
            </div>
          </li>

          <li className={`${styles.record} ${styles.recordWithOverlay}`}>
            <Link
              className={styles.recordOverlay}
              href="/qbpanel/settings/integrations/sms"
              aria-label={`${translate('admin.integrations.open')} ${translate('admin.integrations.smsTitle')}`}
            />
            <span className={styles.recordThumb} aria-hidden="true">
              <AdminIcon name="phone" width={18} height={18} />
            </span>
            <div className={styles.recordMain}>
              <span className={styles.recordTitle}>{translate('admin.integrations.smsTitle')}</span>
              <span className={styles.recordMeta}>
                <span>{translate('admin.integrations.smsSummary')}</span>
              </span>
            </div>
            <div className={styles.recordSide}>
              <StatusPill tone={smsReady ? 'success' : 'neutral'}>
                {smsReady
                  ? translate('admin.integrations.smsReady')
                  : translate('admin.integrations.smsNotReady')}
              </StatusPill>
            </div>
          </li>

          <li className={`${styles.record} ${styles.recordWithOverlay}`}>
            <Link
              className={styles.recordOverlay}
              href="/qbpanel/settings/integrations/steadfast"
              aria-label={`${translate('admin.integrations.open')} ${translate('admin.integrations.steadfastTitle')}`}
            />
            <span className={styles.recordThumb} aria-hidden="true">
              <AdminIcon name="package" width={18} height={18} />
            </span>
            <div className={styles.recordMain}>
              <span className={styles.recordTitle}>{translate('admin.integrations.steadfastTitle')}</span>
              <span className={styles.recordMeta}>
                <span>{translate('admin.integrations.steadfastSummary')}</span>
              </span>
            </div>
            <div className={styles.recordSide}>
              <StatusPill tone={steadfastReady ? 'success' : 'neutral'}>
                {steadfastReady
                  ? translate('admin.integrations.steadfastReady')
                  : translate('admin.integrations.steadfastNotReady')}
              </StatusPill>
            </div>
          </li>
          <li className={`${styles.record} ${styles.recordWithOverlay}`}>
            <Link
              className={styles.recordOverlay}
              href="/qbpanel/settings/integrations/email"
              aria-label={`${translate('admin.integrations.open')} ${translate('admin.integrations.emailTitle')}`}
            />
            <span className={styles.recordThumb} aria-hidden="true">
              <AdminIcon name="mail" width={18} height={18} />
            </span>
            <div className={styles.recordMain}>
              <span className={styles.recordTitle}>{translate('admin.integrations.emailTitle')}</span>
              <span className={styles.recordMeta}>
                <span>{translate('admin.integrations.emailSummary')}</span>
              </span>
            </div>
            <div className={styles.recordSide}>
              <StatusPill tone={mailReady ? 'success' : 'warning'}>
                {mailReady
                  ? translate('admin.integrations.emailReady')
                  : translate('admin.integrations.emailNotReady')}
              </StatusPill>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}
