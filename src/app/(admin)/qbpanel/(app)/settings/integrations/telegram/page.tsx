import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listTelegramRecipients } from '@/server/integrations/telegram';
import { providerCredentialStatus } from '@/server/integrations/provider-credentials';
import { TelegramSettingsView, type TelegramNotice } from './TelegramSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly TelegramNotice[] = [
  'added',
  'updated',
  'activated',
  'paused',
  'testSent',
  'testPartial',
  'testFailed',
  'notConfigured',
  'noRecipients',
  'denied',
  'invalid',
  'saved',
];

function readNotice(value: string | string[] | undefined): TelegramNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as TelegramNotice)
    : null;
}

/**
 * Telegram order notifications.
 *
 * ADR 0047: the bot token may come from the panel or the environment, but this page reads only a
 * **boolean**, never the token: nothing here can leak it, and a screenshot is safe to share.
 */
export default async function TelegramIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;

  const recipients = await withTransaction((tx) => listTelegramRecipients(tx));
  const status = await providerCredentialStatus();

  return (
    <TelegramSettingsView
      configured={status.telegramBotToken.set}
      tokenHint={status.telegramBotToken.hint}
      recipients={recipients.map((recipient) => ({
        id: recipient.id,
        label: recipient.label,
        chatId: recipient.chatId,
        isActive: recipient.isActive,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
