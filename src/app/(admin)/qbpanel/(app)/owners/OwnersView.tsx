'use client';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { ConfirmSubmit } from '../../_ui/ConfirmSubmit';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { StatusPill } from '../../_ui/StatusPill';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type OwnerRow = {
  id: number;
  email: string;
  displayName: string;
  status: string;
  disabledAt: string | null;
  lastSeenAt: string | null;
  hasCredential: boolean;
};

export type OwnerNotice =
  | 'created'
  | 'tokenIssued'
  | 'disabled'
  | 'enabled'
  | 'denied'
  | 'conflict'
  | 'exists'
  | 'invalid';

const NOTICE_KEYS: Record<OwnerNotice, TranslationKey> = {
  created: 'admin.owners.notice.created',
  tokenIssued: 'admin.owners.notice.tokenIssued',
  disabled: 'admin.owners.notice.disabled',
  enabled: 'admin.owners.notice.enabled',
  denied: 'admin.owners.notice.denied',
  conflict: 'admin.owners.notice.conflict',
  exists: 'admin.owners.notice.exists',
  invalid: 'admin.owners.notice.invalid',
};

const ERROR_NOTICES: readonly OwnerNotice[] = ['denied', 'conflict', 'exists', 'invalid'];

/**
 * Owner accounts.
 *
 * Every control is a plain form post to a route handler that re-checks the permission, the CSRF token
 * and the same-origin header server-side, so the interface is a convenience and never the control.
 *
 * There is deliberately no role picker: a new account is an owner, and that is the only kind of account
 * this screen can create. Disabling another owner is confirmed with its consequence written out.
 */
export function OwnersView({
  owners,
  currentStaffUserId,
  canManage,
  notice,
  issuedToken,
  csrfToken,
}: {
  owners: readonly OwnerRow[];
  currentStaffUserId: number;
  canManage: boolean;
  notice: OwnerNotice | null;
  issuedToken: { token: string; expiresAt: string } | null;
  csrfToken: string;
}) {
  const { t } = useTranslation();
  const format = (iso: string): string =>
    new Intl.DateTimeFormat(INTL_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);

  return (
    <>
      <PageHeader title={t('admin.owners.title')} description={t('admin.owners.body')} />

      {notice !== null && (
        <Notice tone={noticeIsError ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      {/* Shown exactly once, and only to the browser that performed the action. Kept before any form
          so the one-time token is the first opaque value in the document. */}
      {issuedToken !== null && (
        <div className={styles.tokenBox}>
          <strong>{t('admin.owners.tokenTitle')}</strong>
          <p className={styles.note}>{t('admin.owners.tokenBody')}</p>
          <p className={styles.tokenValue}>{issuedToken.token}</p>
          <p className={styles.hint}>
            {t('admin.owners.tokenExpires')}: {format(issuedToken.expiresAt)}
          </p>
        </div>
      )}

      <section className={styles.section} aria-label={t('admin.owners.title')}>

        {owners.length === 0 ? (
          <EmptyState title={t('admin.owners.emptyTitle')} body={t('admin.owners.emptyBody')} icon="owners" />
        ) : (
          <ul className={styles.recordList}>
            {owners.map((owner) => {
              const isSelf = owner.id === currentStaffUserId;
              const active = owner.status === 'active';
              return (
                <li className={styles.record} key={owner.id}>
                  <span className={styles.recordThumb} aria-hidden="true">
                    {owner.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>
                      {owner.displayName}{' '}
                      {isSelf && <StatusPill tone="info">{t('admin.owners.you')}</StatusPill>}
                    </span>
                    <span className={styles.recordMeta}>
                      <span>{owner.email}</span>
                      <span>
                        {owner.lastSeenAt === null
                          ? t('admin.owners.never')
                          : t('admin.owners.lastSeenValue', { time: format(owner.lastSeenAt) })}
                      </span>
                      {!owner.hasCredential && <span className={styles.tagWarn}>{t('admin.owners.credentialNotSet')}</span>}
                    </span>
                  </div>
                  <div className={styles.recordSide}>
                    <StatusPill tone={active ? 'success' : 'danger'}>
                      {active ? t('admin.owners.statusActive') : t('admin.owners.statusDisabled')}
                    </StatusPill>
                    {canManage && (
                      <div className={styles.recordActions}>
                        <form action="/api/qbpanel/owners/credential" method="post">
                          <input type="hidden" name="csrf" value={csrfToken} />
                          <input type="hidden" name="staffUserId" value={owner.id} />
                          <SubmitButton
                            label={t('admin.owners.issueToken')}
                            pendingLabel={t('admin.common.working')}
                            variant="secondary"
                            small
                          />
                        </form>
                        {/* Self-disable is refused by the service, so the control is not offered. */}
                        {!isSelf && (
                          <ConfirmSubmit
                            action="/api/qbpanel/owners/status"
                            csrfToken={csrfToken}
                            fields={{ staffUserId: owner.id, operation: active ? 'disable' : 'enable' }}
                            triggerLabel={active ? t('admin.owners.disable') : t('admin.owners.enable')}
                            triggerVariant={active ? 'dangerOutline' : 'secondary'}
                            title={active ? t('admin.owners.disable') : t('admin.owners.enable')}
                            body={active ? t('admin.owners.disableBody') : t('admin.owners.enableBody')}
                            confirmLabel={active ? t('admin.owners.disable') : t('admin.owners.enable')}
                            cancelLabel={t('admin.common.cancel')}
                            pendingLabel={t('admin.common.working')}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ul className={styles.dividerList}>
          <li className={styles.dividerItem}>
            <span className={styles.note}>{t('admin.owners.selfNote')}</span>
          </li>
          <li className={styles.dividerItem}>
            <span className={styles.note}>{t('admin.owners.lastOwnerNote')}</span>
          </li>
          <li className={styles.dividerItem}>
            <span className={styles.note}>{t('admin.owners.noSelfRegistration')}</span>
          </li>
        </ul>
      </section>

      {canManage && (
        <section className={styles.section} aria-labelledby="create-owner-heading">
          <div className={styles.sectionHead}>
            <h2 id="create-owner-heading">{t('admin.owners.createTitle')}</h2>
            <p>{t('admin.owners.createBody')}</p>
          </div>
          <form className={`${styles.panel} ${styles.form} ${styles.formNarrow}`} action="/api/qbpanel/owners" method="post">
            <input type="hidden" name="csrf" value={csrfToken} />
            <div className={styles.field}>
              <label htmlFor="displayName">{t('admin.owners.displayName')}</label>
              <input className={styles.input} id="displayName" name="displayName" required maxLength={80} />
            </div>
            <div className={styles.field}>
              <label htmlFor="email">{t('admin.owners.email')}</label>
              <input className={styles.input} id="email" name="email" type="email" required maxLength={254} />
            </div>
            <div className={styles.formActions}>
              <SubmitButton label={t('admin.owners.createSubmit')} pendingLabel={t('admin.common.working')} />
            </div>
          </form>
        </section>
      )}
    </>
  );
}
