/**
 * POST /api/qbpanel/integrations/telegram - register, edit, pause, remove or test a Telegram destination.
 *
 * Five operations share one route because they share one permission (`settings.write`) and one form
 * vocabulary, exactly like the promotion-code route. Only a **notice code** travels back on the
 * redirect: never a chat id, never the bot token, never a description of Telegram's error.
 *
 * `remove` is the one destructive operation. It is offered behind a confirmation in the interface and
 * refused without a session or a CSRF token like every other mutation; the service deletes the row and
 * writes the only surviving description of it to the audit trail.
 *
 * The `test` operation is the point of the screen: a chat id that is typed correctly but has never
 * started a conversation with the bot silently receives nothing, and there is no way to notice that
 * until an order arrives. Sending a test message turns that into an answer the owner can see.
 */

import { withTransaction } from '@/db/client';
import { TELEGRAM_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import {
  addTelegramRecipient,
  loadActiveRecipients,
  readTelegramToken,
  removeTelegramRecipient,
  sendTelegramMessage,
  setTelegramRecipientActive,
  updateTelegramRecipient,
} from '@/server/integrations/telegram';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['add', 'update', 'setActive', 'remove', 'test'] as const;

function backTo(notice: string): Response {
  return redirectTo(`${TELEGRAM_SETTINGS_PATH}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo('denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) return backTo('invalid');

  try {
    if (operation === 'add') {
      await withTransaction((tx) =>
        addTelegramRecipient(tx, actor, { label: form.get('label'), chatId: form.get('chatId') }),
      );
      return backTo('added');
    }

    if (operation === 'update') {
      await withTransaction((tx) =>
        updateTelegramRecipient(tx, actor, form.get('recipientId'), {
          label: form.get('label'),
          chatId: form.get('chatId'),
        }),
      );
      return backTo('updated');
    }

    if (operation === 'setActive') {
      const active = form.get('active') === 'true';
      await withTransaction((tx) => setTelegramRecipientActive(tx, actor, form.get('recipientId'), active));
      return backTo(active ? 'activated' : 'paused');
    }

    if (operation === 'remove') {
      const removed = await withTransaction((tx) => removeTelegramRecipient(tx, actor, form.get('recipientId')));
      // A row that is already gone is answered as such: two owners, or a stale page, is not an error.
      return backTo(removed ? 'removed' : 'missing');
    }

    // ---- test: one message to every active destination ----
    const token = readTelegramToken();
    if (token === null) return backTo('notConfigured');

    const recipients = await loadActiveRecipients();
    if (recipients.length === 0) return backTo('noRecipients');

    const results = await Promise.all(
      recipients.map((recipient) =>
        sendTelegramMessage(
          token,
          recipient.chatId,
          "QueenBee's test message - order notifications reach this chat.",
        ),
      ),
    );
    const delivered = results.filter((result) => result.ok).length;
    if (delivered === results.length) return backTo('testSent');
    return backTo(delivered === 0 ? 'testFailed' : 'testPartial');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
