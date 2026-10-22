/**
 * Telegram order notifications (Phase 39).
 *
 * **Where the secret lives:** the bot token is read from `TELEGRAM_BOT_TOKEN` in the process
 * environment and nowhere else. It is never stored in the database, never returned to the browser,
 * never written to a log and never committed. A row in `store_setting` would be copied into a backup,
 * an export or a support paste; a deployment variable is not. The admin screen can therefore show
 * *whether* the bot is configured, and never the token itself.
 *
 * **What the owner configures:** destination chat ids, one row per person (`telegram_recipient`). Every
 * *active* row receives the same notification, so two owners, or an owner and a manager, each get their
 * own message without any per-order addressing.
 *
 * **This is a notification, not a record.** A send failure never refuses an order, never rolls one back
 * and never blocks checkout: the order is the authority, Telegram is a channel. Every failure is
 * swallowed after being described, and the call site schedules the send *after* the response so the
 * customer never waits for Telegram.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { telegramRecipient } from '@/db/schema';
import { formatMoney } from '@/lib/money';
import { recordAudit } from '@/server/auth/audit';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { PERMISSIONS } from '@/server/authz/permissions';

export const TELEGRAM_TOKEN_ENV = 'TELEGRAM_BOT_TOKEN';

/** Numeric Telegram user id, or a negative id for a group. Shape only - Telegram decides existence. */
export const CHAT_ID_PATTERN = /^-?[0-9]{5,20}$/;

/** `123456789:AA...` - the token shape BotFather issues. A malformed value is treated as absent. */
const TOKEN_PATTERN = /^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/;

const TELEGRAM_API = 'https://api.telegram.org';
/** A notification is a courtesy: it may not hold the runtime open for long. */
const SEND_TIMEOUT_MS = 4000;

export type TelegramStatus = { readonly configured: boolean };

export type TelegramRecipient = {
  readonly id: number;
  readonly label: string;
  readonly chatId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
};

export type TelegramInput = { readonly label: unknown; readonly chatId: unknown };

export type TelegramSendResult = {
  readonly ok: boolean;
  /** A description safe to show an owner: never the token, never the full URL. */
  readonly detail: string;
};

/**
 * The configured token, or `null`.
 *
 * Read on every use rather than captured at module load, so a deployment that ships the variable is
 * not required to exist at build time, and the integration is simply off when it is missing.
 */
export function readTelegramToken(source: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const raw = source[TELEGRAM_TOKEN_ENV];
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function telegramStatus(source?: Readonly<Record<string, string | undefined>>): TelegramStatus {
  return { configured: readTelegramToken(source) !== null };
}

/** A chat id as stored: trimmed, digits only, optional leading minus. `null` when it is not that shape. */
export function parseChatId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return CHAT_ID_PATTERN.test(value) ? value : null;
}

function parseLabel(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('a recipient needs a name');
  const label = raw.trim();
  if (label.length === 0 || label.length > 80) {
    throw new ValidationError('a recipient name must be 1 to 80 characters');
  }
  return label;
}

export async function listTelegramRecipients(tx: Transaction): Promise<TelegramRecipient[]> {
  return tx
    .select({
      id: telegramRecipient.id,
      label: telegramRecipient.label,
      chatId: telegramRecipient.chatId,
      isActive: telegramRecipient.isActive,
      createdAt: telegramRecipient.createdAt,
    })
    .from(telegramRecipient)
    // Active destinations first, then alphabetical: the list is a roster, not a history.
    .orderBy(sql`${telegramRecipient.isActive} desc, ${telegramRecipient.label}`);
}

export async function addTelegramRecipient(
  tx: Transaction,
  actor: ActorContext,
  input: TelegramInput,
): Promise<{ id: number }> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'telegram_recipient', 0);

  const label = parseLabel(input.label);
  const chatId = parseChatId(input.chatId);
  if (chatId === null) throw new ValidationError('a Telegram chat id is digits only, optionally negative');

  const inserted = await tx
    .insert(telegramRecipient)
    .values({ label, chatId, createdByStaffId: actor.staffUserId, updatedByStaffId: actor.staffUserId })
    .onConflictDoNothing({ target: telegramRecipient.chatId })
    .returning({ id: telegramRecipient.id });

  const id = inserted[0]?.id;
  // The unique index is the authority: the same chat cannot be registered twice, because that would
  // send the owner two identical messages for every order.
  if (id === undefined) throw new ValidationError('that Telegram id is already registered');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'integration.telegram_recipient_added',
    entityType: 'telegram_recipient',
    entityId: id,
    after: { label, chatId },
  });

  return { id };
}

export async function updateTelegramRecipient(
  tx: Transaction,
  actor: ActorContext,
  rawId: unknown,
  input: TelegramInput,
): Promise<void> {
  const id = typeof rawId === 'string' ? Number.parseInt(rawId, 10) : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('a recipient id is required');
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'telegram_recipient', id);

  const label = parseLabel(input.label);
  const chatId = parseChatId(input.chatId);
  if (chatId === null) throw new ValidationError('a Telegram chat id is digits only, optionally negative');

  const before = await tx
    .select({ label: telegramRecipient.label, chatId: telegramRecipient.chatId })
    .from(telegramRecipient)
    .where(sql`${telegramRecipient.id} = ${id}`);
  if (before[0] === undefined) throw new ValidationError('no such recipient');

  // Checked here rather than left to the unique index, so the owner reads a refusal instead of a 500.
  // The index still holds: it is what makes the rule true for anything that does not come through here.
  const clash = await tx
    .select({ id: telegramRecipient.id })
    .from(telegramRecipient)
    .where(sql`${telegramRecipient.chatId} = ${chatId} and ${telegramRecipient.id} <> ${id}`);
  if (clash.length > 0) throw new ValidationError('that Telegram id is already registered');

  await tx
    .update(telegramRecipient)
    .set({ label, chatId, updatedByStaffId: actor.staffUserId, updatedAt: new Date() })
    .where(sql`${telegramRecipient.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'integration.telegram_recipient_updated',
    entityType: 'telegram_recipient',
    entityId: id,
    before: { label: before[0].label, chatId: before[0].chatId },
    after: { label, chatId },
  });
}

export async function setTelegramRecipientActive(
  tx: Transaction,
  actor: ActorContext,
  rawId: unknown,
  active: boolean,
): Promise<void> {
  const id = typeof rawId === 'string' ? Number.parseInt(rawId, 10) : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('a recipient id is required');
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'telegram_recipient', id);

  const updated = await tx
    .update(telegramRecipient)
    .set({ isActive: active, updatedByStaffId: actor.staffUserId, updatedAt: new Date() })
    .where(sql`${telegramRecipient.id} = ${id}`)
    .returning({ id: telegramRecipient.id, label: telegramRecipient.label, chatId: telegramRecipient.chatId });
  const row = updated[0];
  if (row === undefined) throw new ValidationError('no such recipient');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: active ? 'integration.telegram_recipient_activated' : 'integration.telegram_recipient_paused',
    entityType: 'telegram_recipient',
    entityId: row.id,
    after: { label: row.label, chatId: row.chatId, isActive: active },
  });
}

export type OrderNotification = {
  readonly orderNumber: string;
  readonly totalMinor: number;
  readonly itemCount: number;
  readonly districtCode: string | null;
  readonly recipientName: string;
  readonly recipientPhone: string;
};

const DISTRICT_LABEL: Record<string, string> = {
  dhaka: 'Dhaka',
  chattogram: 'Chattogram',
  other: 'Other districts',
};

/**
 * The message an owner reads on their phone.
 *
 * Plain text, no Markdown and no HTML: Telegram's parse modes would need escaping on every value, and an
 * escaped order number looks like a bug. It names what the owner needs to act - the reference, the
 * amount, how many items, which area, who to call - and never invents a delivery promise.
 */
export function composeOrderMessage(order: OrderNotification): string {
  const lines = [
    `New order ${order.orderNumber} · ${formatMoney(order.totalMinor)}`,
    `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'} · ${
      order.districtCode === null ? 'area not recorded' : (DISTRICT_LABEL[order.districtCode] ?? order.districtCode)
    }`,
  ];
  if (order.recipientName.trim() !== '') lines.push(order.recipientName.trim());
  if (order.recipientPhone.trim() !== '') lines.push(order.recipientPhone.trim());
  lines.push('Cash on delivery · awaiting approval');
  return lines.join('\n');
}

/**
 * One `sendMessage` call.
 *
 * The token is placed in the URL because that is the only place Telegram accepts it, and the URL is
 * therefore never logged, never returned and never included in a failure description. A failure carries
 * Telegram's own one-line reason, which says "chat not found" without echoing the credential.
 */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (response.ok) return { ok: true, detail: 'delivered' };

    let description = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { description?: unknown };
      if (typeof body.description === 'string') description = body.description.slice(0, 200);
    } catch {
      // A non-JSON body is described by its status alone; nothing else is read from it.
    }
    return { ok: false, detail: description };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    return { ok: false, detail: name === 'TimeoutError' ? 'Telegram did not answer in time' : 'Telegram is unreachable' };
  }
}

export type NotifyOutcome = {
  readonly attempted: number;
  readonly delivered: number;
  readonly failures: readonly { readonly label: string; readonly detail: string }[];
};

/** Reads every active destination. Separate transaction: sending must never hold one open. */
export async function loadActiveRecipients(): Promise<TelegramRecipient[]> {
  return withTransaction((tx) =>
    tx
      .select({
        id: telegramRecipient.id,
        label: telegramRecipient.label,
        chatId: telegramRecipient.chatId,
        isActive: telegramRecipient.isActive,
        createdAt: telegramRecipient.createdAt,
      })
      .from(telegramRecipient)
      .where(sql`${telegramRecipient.isActive}`)
      .orderBy(telegramRecipient.label),
  );
}

/**
 * Sends one order notification to every active destination.
 *
 * Returns a summary instead of throwing, because the caller is a completed order: the order exists, the
 * money is due, and a chat app being down is not a reason to tell the customer anything different. Each
 * destination is attempted independently, so one bad chat id does not silence the others.
 */
export async function notifyOrderPlaced(
  order: OrderNotification,
  options: { readonly token?: string | null; readonly recipients?: readonly TelegramRecipient[] } = {},
): Promise<NotifyOutcome> {
  const token = options.token === undefined ? readTelegramToken() : options.token;
  if (token === null) return { attempted: 0, delivered: 0, failures: [] };

  let recipients: readonly TelegramRecipient[] = options.recipients ?? [];
  if (options.recipients === undefined) {
    try {
      recipients = await loadActiveRecipients();
    } catch {
      return { attempted: 0, delivered: 0, failures: [] };
    }
  }
  if (recipients.length === 0) return { attempted: 0, delivered: 0, failures: [] };

  const message = composeOrderMessage(order);
  const results = await Promise.all(
    recipients.map(async (recipient) => ({
      label: recipient.label,
      ...(await sendTelegramMessage(token, recipient.chatId, message)),
    })),
  );

  const failures = results.filter((result) => !result.ok).map(({ label, detail }) => ({ label, detail }));
  return { attempted: results.length, delivered: results.length - failures.length, failures };
}
