import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listTelegramRecipients, telegramStatus } from '@/server/integrations/telegram';
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
 * The bot token is resolved from the environment, so the page reads a **boolean**, never the token:
 * nothing on this screen can leak it, and a screenshot of the screen is safe to share.
 */
export default async function TelegramIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;

  const recipients = await withTransaction((tx) => listTelegramRecipients(tx));
  const status = telegramStatus();

  return (
    <TelegramSettingsView
      configured={status.configured}
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
