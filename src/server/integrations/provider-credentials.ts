/**
 * ADR 0047 - owner-managed provider credentials.
 *
 * Resend, BulkSMSBD and the Telegram bot are provider accounts the owner can rotate. Their values are
 * entered on Settings -> Integrations, stored in `store_setting`, and read here on every use. The old
 * environment variables remain a fallback so an existing deployment keeps working until the owner
 * replaces them; a saved panel value wins.
 *
 * Nothing here returns a value to the browser. `credentialStatus` carries only presence and a four-
 * character hint, and the audit row carries the same shape - never the secret itself.
 */

import { eq, inArray, sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { PERMISSIONS } from '@/server/authz/permissions';
import { recordAudit } from '@/server/auth/audit';
import { maskCredential } from './steadfast';
import { PROVIDER_KEYS, type ProviderField, type ProviderKey } from '@/lib/provider-keys';

export { PROVIDER_KEYS } from '@/lib/provider-keys';

export type ProviderCredentials = Record<ProviderField, string | null>;

export type ProviderCredentialInput = {
  [K in ProviderField]?: unknown;
} & { readonly clear?: readonly string[] };

export type ProviderCredentialStatus = {
  [K in ProviderField]: { readonly set: boolean; readonly hint: string | null };
};

const FIELDS = Object.keys(PROVIDER_KEYS) as readonly ProviderField[];
const VALUE_KEYS = Object.values(PROVIDER_KEYS) as readonly ProviderKey[];

const PATTERNS: Record<ProviderField, RegExp> = {
  telegramBotToken: /^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/,
  resendApiKey: /^re_[A-Za-z0-9_-]{8,200}$/,
  resendFrom: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/,
  baseUrl: /^https?:\/\/[^\s]+$/,
  smsApiKey: /^[A-Za-z0-9_-]{4,128}$/,
  smsSenderId: /^[A-Za-z0-9_-]{2,30}$/,
};

const LABELS: Record<ProviderField, string> = {
  telegramBotToken: 'Telegram bot token',
  resendApiKey: 'Resend API key',
  resendFrom: 'Resend sender address',
  baseUrl: 'Store web address',
  smsApiKey: 'BulkSMS API key',
  smsSenderId: 'BulkSMS sender ID',
};

/** Where an old deployment still holds the same value. The panel value wins over these. */
const ENV_KEYS: Record<ProviderField, string> = {
  telegramBotToken: 'TELEGRAM_BOT_TOKEN',
  resendApiKey: 'RESEND_API_KEY',
  resendFrom: 'EMAIL_FROM',
  baseUrl: 'APP_BASE_URL',
  smsApiKey: 'BULKSMS_API_KEY',
  smsSenderId: 'BULKSMS_SENDER_ID',
};

function asText(value: unknown): string | null {
  /*
    A jsonb string containing only digits comes back through the pg driver as a JS number in this
    stack: pg parses the JSON to `"8809..."` and the jsonb column parses it again to 8809... . Sender
    ids and phone-shaped values are exactly that shape, so accept numbers as text rather than reporting
    a saved credential as absent.
  */
  const text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseProviderValue(field: ProviderField, raw: unknown): string {
  const value = asText(raw);
  if (value === null) throw new ValidationError(`${LABELS[field]} is required`);
  if (!PATTERNS[field].test(value)) {
    throw new ValidationError(`${LABELS[field]} is not in the expected shape`);
  }
  if (field === 'baseUrl') {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
    } catch {
      throw new ValidationError('the store web address must be a full https address');
    }
  }
  return value;
}

async function readRows(tx: Transaction): Promise<Partial<Record<ProviderKey, string | null>>> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(inArray(storeSetting.key, [...VALUE_KEYS]));
  const result: Partial<Record<ProviderKey, string | null>> = {};
  for (const row of rows) {
    result[row.key as ProviderKey] = asText(row.value);
  }
  return result;
}

/**
 * The effective values: saved panel values first, environment variables only where nothing was saved.
 * One bounded read, no cache: rotating a key takes effect on the next call.
 */
export async function loadProviderCredentials(): Promise<ProviderCredentials> {
  const rows = await withTransaction((tx) => readRows(tx));
  const result = {} as ProviderCredentials;
  for (const field of FIELDS) {
    result[field] = rows[PROVIDER_KEYS[field]] ?? asText(process.env[ENV_KEYS[field]]);
  }
  return result;
}

/** Masked presence only: safe to pass to a page as a prop. */
export async function providerCredentialStatus(): Promise<ProviderCredentialStatus> {
  const values = await loadProviderCredentials();
  const result = {} as ProviderCredentialStatus;
  for (const field of FIELDS) {
    const value = values[field];
    result[field] = { set: value !== null, hint: value === null ? null : maskCredential(value) };
  }
  return result;
}

/**
 * Saves the fields that were typed and removes the fields named in `clear`.
 *
 * An empty field keeps what is stored - a secret the owner cannot read off the screen must not be
 * erased by a stray save. Removal is explicit through `clear`, which the form sends only from a ticked
 * checkbox.
 */
export async function saveProviderCredentials(
  tx: Transaction,
  actor: ActorContext,
  input: ProviderCredentialInput,
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const before = await readRows(tx);
  const clear = Array.isArray(input.clear) ? input.clear : [];
  const writes: { key: ProviderKey; value: string }[] = [];
  const removals: ProviderKey[] = [];

  for (const field of FIELDS) {
    const key = PROVIDER_KEYS[field];
    const typed = asText(input[field]);
    if (typed !== null) {
      writes.push({ key, value: parseProviderValue(field, typed) });
    } else if (clear.includes(key)) {
      removals.push(key);
    }
  }
  const unknownClears = clear.filter((value) => !VALUE_KEYS.includes(value as ProviderKey));
  if (unknownClears.length > 0) throw new ValidationError('unknown credential to remove');

  for (const key of removals) {
    await tx.delete(storeSetting).where(eq(storeSetting.key, key));
  }
  if (writes.length > 0) {
    await tx
      .insert(storeSetting)
      .values(
        writes.map((row) => ({
          ...row,
          valueType: 'text',
          updatedByStaffId: actor.staffUserId,
        })),
      )
      .onConflictDoUpdate({
        target: storeSetting.key,
        set: {
          value: sql`excluded.value`,
          valueType: sql`excluded.value_type`,
          updatedAt: sql`now()`,
          updatedByStaffId: actor.staffUserId,
        },
      });
  }

  const after = await readRows(tx);
  const shape = (source: Partial<Record<ProviderKey, string | null>>) =>
    Object.fromEntries(
      FIELDS.map((field) => {
        const value = source[PROVIDER_KEYS[field]] ?? null;
        return [field, value === null ? null : maskCredential(value)];
      }),
    );

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'integration.provider_credentials_saved',
    entityType: 'store_setting',
    entityId: 1,
    before: shape(before),
    after: shape(after),
    reason: 'owner updated provider credentials',
  });
}

/**
 * Runtime resolvers used by the application callers. The provider modules themselves stay synchronous
 * and testable with a `source` object; these thin async wrappers supply the saved panel values.
 */
export async function emailRuntimeCredentials(): Promise<{
  apiKey: string | null;
  from: string | null;
  baseUrl: string | null;
}> {
  const values = await loadProviderCredentials();
  return { apiKey: values.resendApiKey, from: values.resendFrom, baseUrl: values.baseUrl };
}

export async function smsRuntimeCredentials(): Promise<{ apiKey: string | null; senderId: string | null }> {
  const values = await loadProviderCredentials();
  return { apiKey: values.smsApiKey, senderId: values.smsSenderId };
}

export async function telegramRuntimeToken(): Promise<string | null> {
  const values = await loadProviderCredentials();
  return values.telegramBotToken;
}

/** The absolute origin for account links and outbound order messages. */
export async function storeRuntimeBaseUrl(): Promise<string | null> {
  const values = await loadProviderCredentials();
  if (values.baseUrl !== null) return values.baseUrl.replace(/\/+$/, '');
  const env = process.env.APP_BASE_URL?.trim();
  if (env !== undefined && env !== '') return env.replace(/\/+$/, '');
  const environment = process.env.QUEENBEES_ENV ?? process.env.NODE_ENV;
  return environment === 'production' ? null : 'http://localhost:3000';
}


/**
 * Non-secret configuration that may be rendered back into its field. API keys and tokens are never in
 * this set: a secret stays write-only even though an owner might prefer to see it.
 */
export async function providerPublicConfiguration(): Promise<{
  readonly smsSenderId: string | null;
  readonly resendFrom: string | null;
  readonly baseUrl: string | null;
}> {
  const values = await loadProviderCredentials();
  return { smsSenderId: values.smsSenderId, resendFrom: values.resendFrom, baseUrl: values.baseUrl };
}
