'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { EmptyState } from '../../../../_ui/EmptyState';
import { Notice } from '../../../../_ui/Notice';
import { PageHeader } from '../../../../_ui/PageHeader';
import { RequiredMark } from '../../../../_ui/RequiredMark';
import { StatusPill } from '../../../../_ui/StatusPill';
import { SubmitButton } from '../../../../_ui/SubmitButton';
import styles from '../../../../admin.module.css';

export type TelegramRecipientRow = {
  readonly id: number;
  readonly label: string;
  readonly chatId: string;
  readonly isActive: boolean;
};

export type TelegramNotice =
  | 'added'
  | 'updated'
  | 'activated'
  | 'paused'
  | 'testSent'
  | 'testPartial'
  | 'testFailed'
  | 'notConfigured'
  | 'noRecipients'
  | 'denied'
  | 'invalid';

export const TELEGRAM_NOTICE_KEYS: Record<TelegramNotice, TranslationKey> = {
  added: 'admin.integrations.notice.added',
  updated: 'admin.integrations.notice.updated',
  activated: 'admin.integrations.notice.activated',
  paused: 'admin.integrations.notice.paused',
  testSent: 'admin.integrations.notice.testSent',
  testPartial: 'admin.integrations.notice.testPartial',
  testFailed: 'admin.integrations.notice.testFailed',
  notConfigured: 'admin.integrations.notice.notConfigured',
  noRecipients: 'admin.integrations.notice.noRecipients',
  denied: 'admin.integrations.notice.denied',
  invalid: 'admin.integrations.notice.invalid',
};

const ERROR_NOTICES: readonly TelegramNotice[] = [
  'denied',
  'invalid',
  'notConfigured',
  'noRecipients',
  'testFailed',
  'testPartial',
];

/**
 * Telegram order notifications.
 *
 * The screen is a roster, not a settings form: one row per destination, each of which can be paused
 * without losing the id. The bot itself is configured in the deployment environment, so the card at the
 * top states whether it is present and never shows it - a token on a screen is a token in a screenshot.
 *
 * The test button exists because Telegram's failure mode is silence: a chat id is only usable once that
 * person has pressed Start in a conversation with the bot, and until they have, every send fails quietly.
 */
export function TelegramSettingsView({
  configured,
  recipients,
  notice,
  csrfToken,
}: {
  configured: boolean;
  recipients: readonly TelegramRecipientRow[];
  notice: TelegramNotice | null;
  csrfToken: string;
}) {
  const { t } = useTranslation();
  const noticeIsError = notice !== null && ERROR_NOTICES.includes(notice);
  const activeCount = recipients.filter((recipient) => recipient.isActive).length;

  return (
    <>
      <PageHeader
        title={t('admin.integrations.telegramTitle')}
        description={t('admin.integrations.telegramBody')}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin/settings/integrations">
            {t('admin.integrations.backToHub')}
          </Link>
        }
      />

      {notice !== null && <Notice tone={noticeIsError ? 'error' : 'success'}>{t(TELEGRAM_NOTICE_KEYS[notice])}</Notice>}

      {/* ---- the bot itself ---- */}
      <section className={styles.section} aria-labelledby="telegram-bot">
        <div className={styles.sectionHead}>
          <h2 id="telegram-bot">{t('admin.integrations.botTitle')}</h2>
          <p>{t('admin.integrations.botBody')}</p>
        </div>
        <div className={styles.panel}>
          <div className={styles.formActions}>
            <StatusPill tone={configured ? 'success' : 'neutral'}>
              {configured ? t('admin.integrations.botConfigured') : t('admin.integrations.botMissing')}
            </StatusPill>
            <form action="/api/admin/integrations/telegram" method="post">
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="test" />
              <SubmitButton
                label={t('admin.integrations.sendTest')}
                pendingLabel={t('admin.common.working')}
                variant="secondary"
              />
            </form>
          </div>
          <p className={styles.note}>{t('admin.integrations.botNote')}</p>
        </div>
      </section>

      {/* ---- add a destination ---- */}
      <section className={styles.section} aria-labelledby="telegram-add">
        <div className={styles.sectionHead}>
          <h2 id="telegram-add">{t('admin.integrations.addTitle')}</h2>
          <p>{t('admin.integrations.addBody')}</p>
        </div>
        <form className={styles.panel} action="/api/admin/integrations/telegram" method="post">
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value="add" />
          <div className={`${styles.formGrid} ${styles.formGridStart}`}>
            <div className={styles.field}>
              <label htmlFor="telegramLabel">
                {t('admin.integrations.field.label')} <RequiredMark />
              </label>
              <input
                className={styles.input}
                id="telegramLabel"
                name="label"
                required
                maxLength={80}
                placeholder={t('admin.integrations.field.labelPlaceholder')}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="telegramChatId">
                {t('admin.integrations.field.chatId')} <RequiredMark />
              </label>
              <input
                className={styles.input}
                id="telegramChatId"
                name="chatId"
                required
                inputMode="numeric"
                maxLength={21}
                placeholder={t('admin.integrations.field.chatIdPlaceholder')}
              />
              <p className={styles.hint}>{t('admin.integrations.field.chatIdHelp')}</p>
            </div>
          </div>
          <div className={styles.formActions}>
            <SubmitButton
              label={t('admin.integrations.add')}
              pendingLabel={t('admin.common.working')}
            />
          </div>
        </form>
      </section>

      {/* ---- the roster ---- */}
      <section className={styles.section} aria-labelledby="telegram-list">
        <div className={styles.sectionHead}>
          <h2 id="telegram-list">{t('admin.integrations.rosterTitle')}</h2>
          <p>
            {activeCount === 1
              ? t('admin.integrations.rosterBodyOne')
              : t('admin.integrations.rosterBody', { count: activeCount })}
          </p>
        </div>

        {recipients.length === 0 ? (
          <EmptyState
            icon="bell"
            title={t('admin.integrations.emptyTitle')}
            body={t('admin.integrations.emptyBody')}
            action={null}
          />
        ) : (
          <ul className={styles.recordList} data-admin-list="">
            {recipients.map((recipient) => (
              <li className={styles.record} key={recipient.id}>
                <span className={styles.recordThumb} aria-hidden="true">
                  {recipient.label.slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{recipient.label}</span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{recipient.chatId}</span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <StatusPill tone={recipient.isActive ? 'success' : 'neutral'}>
                    {recipient.isActive
                      ? t('admin.integrations.active')
                      : t('admin.integrations.paused')}
                  </StatusPill>
                  <div className={styles.recordActions}>
                    <form action="/api/admin/integrations/telegram" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="setActive" />
                      <input type="hidden" name="recipientId" value={recipient.id} />
                      <input type="hidden" name="active" value={recipient.isActive ? 'false' : 'true'} />
                      <SubmitButton
                        label={
                          recipient.isActive
                            ? t('admin.integrations.pause')
                            : t('admin.integrations.resume')
                        }
                        pendingLabel={t('admin.common.working')}
                        variant="ghost"
                      />
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {recipients.length > 0 && (
          <p className={styles.hint}>{t('admin.integrations.editHint')}</p>
        )}
      </section>

      {/* ---- edit one destination ---- */}
      {recipients.length > 0 && (
        <section className={styles.section} aria-labelledby="telegram-edit">
          <div className={styles.sectionHead}>
            <h2 id="telegram-edit">{t('admin.integrations.editTitle')}</h2>
            <p>{t('admin.integrations.editBody')}</p>
          </div>
          {recipients.map((recipient) => (
            <form
              className={styles.panel}
              key={recipient.id}
              action="/api/admin/integrations/telegram"
              method="post"
            >
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="operation" value="update" />
              <input type="hidden" name="recipientId" value={recipient.id} />
              <div className={`${styles.formGrid} ${styles.formGridStart}`}>
                <div className={styles.field}>
                  <label htmlFor={`label-${recipient.id}`}>{t('admin.integrations.field.label')}</label>
                  <input
                    className={styles.input}
                    id={`label-${recipient.id}`}
                    name="label"
                    required
                    maxLength={80}
                    defaultValue={recipient.label}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`chat-${recipient.id}`}>{t('admin.integrations.field.chatId')}</label>
                  <input
                    className={styles.input}
                    id={`chat-${recipient.id}`}
                    name="chatId"
                    required
                    inputMode="numeric"
                    maxLength={21}
                    defaultValue={recipient.chatId}
                  />
                </div>
              </div>
              <div className={styles.formActions}>
                <SubmitButton label={t('admin.integrations.save')} pendingLabel={t('admin.common.working')} />
              </div>
            </form>
          ))}
        </section>
      )}
    </>
  );
}