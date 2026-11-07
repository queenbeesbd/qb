'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { ConfirmSubmit } from '../../../../_ui/ConfirmSubmit';
import { Notice } from '../../../../_ui/Notice';
import { PageHeader } from '../../../../_ui/PageHeader';
import { StatusPill } from '../../../../_ui/StatusPill';
import { SubmitButton } from '../../../../_ui/SubmitButton';
import styles from '../../../../admin.module.css';

export type SteadfastNotice =
  | 'saved'
  | 'cleared'
  | 'tested'
  | 'testFailed'
  | 'notConfigured'
  | 'denied'
  | 'invalid';

export const STEADFAST_NOTICE_KEYS: Record<SteadfastNotice, TranslationKey> = {
  saved: 'admin.steadfast.notice.saved',
  cleared: 'admin.steadfast.notice.cleared',
  tested: 'admin.steadfast.notice.tested',
  testFailed: 'admin.steadfast.notice.testFailed',
  notConfigured: 'admin.steadfast.notice.notConfigured',
  denied: 'admin.steadfast.notice.denied',
  invalid: 'admin.steadfast.notice.invalid',
};

const ERROR_NOTICES: readonly SteadfastNotice[] = ['testFailed', 'notConfigured', 'denied', 'invalid'];

/**
 * Settings -> Integrations -> SteadFast.
 *
 * The account is **two keys and one switch**. The saved keys are shown as `••••` plus their last four
 * characters, never as values: the owner can recognise which key is stored without the screen becoming
 * a place a credential can be copied from. An empty field keeps the saved value, so switching booking
 * on or rotating one key never requires retyping the other.
 *
 * Removing the account is a separate, confirmed action rather than an empty save, because a stray
 * submission must never disconnect the courier. The confirmation states that booking stops and that
 * parcels already sent keep their consignment.
 */
export function SteadfastSettingsView({
  configured,
  enabled,
  apiKeyHint,
  secretKeyHint,
  notice,
  csrfToken,
}: {
  configured: boolean;
  enabled: boolean;
  apiKeyHint: string | null;
  secretKeyHint: string | null;
  notice: SteadfastNotice | null;
  csrfToken: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader
        title={t('admin.steadfast.title')}
        description={t('admin.steadfast.body')}
        actions={
          <Link className={styles.recordLink} href="/admin/settings/integrations">
            {t('admin.integrations.backToHub')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(STEADFAST_NOTICE_KEYS[notice])}
        </Notice>
      )}

      <section className={styles.section} aria-labelledby="steadfast-state">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="steadfast-state">{t('admin.steadfast.stateTitle')}</h2>
            <p>{t('admin.steadfast.stateBody')}</p>
          </div>
        </div>

        <p className={styles.savedState}>
          <StatusPill tone={configured ? 'success' : 'neutral'}>
            {configured ? t('admin.steadfast.keysSaved') : t('admin.steadfast.keysMissing')}
          </StatusPill>
          <StatusPill tone={enabled && configured ? 'success' : 'warning'}>
            {enabled && configured
              ? t('admin.steadfast.bookingOn')
              : t('admin.steadfast.bookingOff')}
          </StatusPill>
          {apiKeyHint !== null && (
            <span className={styles.savedStateNote}>
              {t('admin.steadfast.apiKeySaved', { hint: apiKeyHint })}
            </span>
          )}
          {secretKeyHint !== null && (
            <span className={styles.savedStateNote}>
              {t('admin.steadfast.secretKeySaved', { hint: secretKeyHint })}
            </span>
          )}
        </p>

        <p className={styles.note}>{t('admin.steadfast.stateNote')}</p>
      </section>

      <section className={styles.section} aria-labelledby="steadfast-account">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="steadfast-account">{t('admin.steadfast.accountTitle')}</h2>
            <p>{t('admin.steadfast.accountBody')}</p>
          </div>
        </div>

        <form className={`${styles.formCard} ${styles.formNarrow}`} action="/api/admin/integrations/steadfast" method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="save" />

          <div className={styles.field}>
            <label htmlFor="apiKey">{t('admin.steadfast.apiKeyLabel')}</label>
            <input
              className={styles.input}
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              placeholder={apiKeyHint ?? ''}
            />
            <p className={styles.hint}>{t('admin.steadfast.keyHelp')}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="secretKey">{t('admin.steadfast.secretKeyLabel')}</label>
            <input
              className={styles.input}
              id="secretKey"
              name="secretKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              placeholder={secretKeyHint ?? ''}
            />
            <p className={styles.hint}>{t('admin.steadfast.secretKeyHelp')}</p>
          </div>

          <label className={styles.switchRow} htmlFor="enabled">
            <input
              id="enabled"
              name="enabled"
              type="checkbox"
              value="true"
              defaultChecked={enabled}
              disabled={!configured}
            />
            <span className={styles.switchRowText}>
              <span className={styles.switchRowLabel}>{t('admin.steadfast.enableLabel')}</span>
              <span className={styles.hint}>{t('admin.steadfast.enableHelp')}</span>
            </span>
          </label>

          <div className={styles.settingActions}>
            <SubmitButton label={t('admin.steadfast.save')} pendingLabel={t('admin.common.working')} />
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="steadfast-test">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="steadfast-test">{t('admin.steadfast.testTitle')}</h2>
            <p>{t('admin.steadfast.testBody')}</p>
          </div>
        </div>

        <div className={styles.settingActions}>
          <form action="/api/admin/integrations/steadfast" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="operation" value="test" />
            <SubmitButton
              label={t('admin.steadfast.test')}
              pendingLabel={t('admin.common.working')}
              variant="secondary"
              disabled={!configured}
            />
          </form>

          {configured && (
            <ConfirmSubmit
              action="/api/admin/integrations/steadfast"
              csrfToken={csrfToken}
              fields={{ operation: 'clear' }}
              triggerLabel={t('admin.steadfast.clear')}
              title={t('admin.steadfast.clearTitle')}
              body={t('admin.steadfast.clearBody')}
              confirmLabel={t('admin.steadfast.clearConfirm')}
              cancelLabel={t('common.close')}
              pendingLabel={t('admin.common.working')}
            />
          )}
        </div>
      </section>
    </>
  );
}
