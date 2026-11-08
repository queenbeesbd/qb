import Link from 'next/link';

import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { withTransaction } from '@/db/client';
import { loadSteadfastSettings, publicStatus } from '@/server/integrations/steadfast';
import { listTelegramRecipients, telegramStatus } from '@/server/integrations/telegram';
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

  const status = telegramStatus();
  const { recipients, steadfast } = await withTransaction(async (tx) => ({
    recipients: await listTelegramRecipients(tx),
    steadfast: publicStatus(await loadSteadfastSettings(tx)),
  }));
  const active = recipients.filter((recipient) => recipient.isActive).length;
  const steadfastReady = steadfast.configured && steadfast.enabled;

  return (
    <>
      <PageHeader
        title={translate('admin.integrations.title')}
      />

      <section className={styles.section} aria-labelledby="integration-list">
        <div className={styles.sectionHead}>
          <h2 id="integration-list">{translate('admin.integrations.listTitle')}</h2>
          <p>{translate('admin.integrations.listBody')}</p>
        </div>

        <ul className={styles.recordList} data-admin-list="">
          <li className={styles.record}>
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
              <StatusPill tone={status.configured && active > 0 ? 'success' : 'neutral'}>
                {!status.configured
                  ? translate('admin.integrations.botMissing')
                  : active === 1
                    ? translate('admin.integrations.rosterBodyOne')
                    : translate('admin.integrations.listBody', { count: active })}
              </StatusPill>
              <div className={styles.recordActions}>
                <Link className={styles.recordLink} href="/qbpanel/settings/integrations/telegram">
                  {translate('admin.integrations.open')}
                </Link>
              </div>
            </div>
          </li>

          <li className={styles.record}>
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
              <div className={styles.recordActions}>
                <Link className={styles.recordLink} href="/qbpanel/settings/integrations/steadfast">
                  {translate('admin.integrations.open')}
                </Link>
              </div>
            </div>
          </li>
        </ul>

        <p className={styles.note}>{translate('admin.integrations.hubNote')}</p>
      </section>
    </>
  );
}
