/**
 * SteadFast Courier - the store's own booking account, and the client that talks to it.
 *
 * **Why the credentials live in `store_setting` and not in the process environment.** The Telegram
 * bot token is deployment-only because it is issued once and never rotated. A courier account is not
 * that: SteadFast issues an `Api-Key`/`Secret-Key` pair per merchant, the merchant can regenerate it
 * from the courier's own portal, and an owner who has to redeploy to rotate a key will instead leave a
 * dead key in place. The owner therefore enters both values on **Settings -> Integrations -> SteadFast**,
 * they are written to `store_setting`, and the API key and secret key are **never** sent to the browser,
 * logged, put in a redirect, or written to an audit record - the audit entry carries only whether each
 * one is present and its last four characters.
 *
 * **A booking never changes an order state.** The courier's job starts after the owner has confirmed a
 * COD order by phone; the consignment is a mirror of what SteadFast accepted (`steadfast_consignment`),
 * not a second lifecycle. `order.status`, `order.cod_state`, payment and stock are untouched, and a
 * delivery status read back from the courier updates only that mirror.
 *
 * **Nothing here is authoritative for money.** `cod_amount` is the order's own frozen `total_minor`,
 * converted to BDT for the courier's field. The shop never asks SteadFast what the customer owes.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { RECIPIENT_PHONE_PATTERN } from '@/lib/checkout-fields';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

// ------------------------------------------------------------------
// Where the account lives
// ------------------------------------------------------------------

/** The documented V1 base URL. Every request path below is appended to it. */
export const STEADFAST_API_BASE = 'https://portal.packzy.com/api/v1';

export const STEADFAST_API_KEY_SETTING = 'steadfast.api_key';
export const STEADFAST_SECRET_KEY_SETTING = 'steadfast.secret_key';
export const STEADFAST_ENABLED_SETTING = 'steadfast.enabled';

/** The courier's field limits, from its own documentation. */
const LIMITS = {
  invoice: 100,
  recipientName: 100,
  recipientAddress: 250,
  note: 480,
} as const;

/** How long one courier call may take. A booking is part of the owner's confirmation, not a background job. */
export const STEADFAST_TIMEOUT_MS = 8000;

/**
 * A key as SteadFast issues it: short, alphanumeric, no whitespace. Shape only - the courier decides
 * whether the pair is valid, and the "Test connection" button is what asks it.
 */
const CREDENTIAL_PATTERN = /^[A-Za-z0-9._-]{4,128}$/;

export type SteadfastCredentials = {
  readonly apiKey: string;
  readonly secretKey: string;
};

export type SteadfastSettings = {
  /** `null` when the owner has not saved one. Never an invented default. */
  readonly apiKey: string | null;
  readonly secretKey: string | null;
  readonly enabled: boolean;
};

/**
 * What the admin screen may see: whether each value is stored, and its last four characters.
 *
 * Deliberately not the values. A key on a screen is a key in a screenshot, in a browser history entry
 * and in a support paste.
 */
export type SteadfastPublicStatus = {
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly apiKeyHint: string | null;
  readonly secretKeyHint: string | null;
};

const EMPTY: SteadfastSettings = { apiKey: null, secretKey: null, enabled: false };

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `••••abcd` - enough for an owner to recognise which key is stored, not enough to use it. */
export function maskCredential(value: string): string {
  const tail = value.slice(-4);
  return `••••${tail}`;
}

/** Reads the three settings. A missing row is absent, not an empty string pretending to be a key. */
export async function loadSteadfastSettings(tx: Transaction): Promise<SteadfastSettings> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(
      sql`${storeSetting.key} in (${STEADFAST_API_KEY_SETTING}, ${STEADFAST_SECRET_KEY_SETTING}, ${STEADFAST_ENABLED_SETTING})`,
    );

  if (rows.length === 0) return EMPTY;

  let apiKey: string | null = null;
  let secretKey: string | null = null;
  let enabled = false;
  for (const row of rows) {
    if (row.key === STEADFAST_API_KEY_SETTING) apiKey = asText(row.value);
    if (row.key === STEADFAST_SECRET_KEY_SETTING) secretKey = asText(row.value);
    if (row.key === STEADFAST_ENABLED_SETTING) enabled = row.value === true;
  }
  return { apiKey, secretKey, enabled };
}

export function publicStatus(settings: SteadfastSettings): SteadfastPublicStatus {
  return {
    configured: settings.apiKey !== null && settings.secretKey !== null,
    enabled: settings.enabled,
    apiKeyHint: settings.apiKey === null ? null : maskCredential(settings.apiKey),
    secretKeyHint: settings.secretKey === null ? null : maskCredential(settings.secretKey),
  };
}

/** Both keys, or `null` when either is missing: half a credential pair can never make a call. */
export function credentialsOf(settings: SteadfastSettings): SteadfastCredentials | null {
  if (settings.apiKey === null || settings.secretKey === null) return null;
  return { apiKey: settings.apiKey, secretKey: settings.secretKey };
}

/** Whether a confirmed order would be sent automatically right now. */
export function bookingsEnabled(settings: SteadfastSettings): boolean {
  return settings.enabled && credentialsOf(settings) !== null;
}

export function parseCredential(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ValidationError(`the ${label} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`the ${label} is required`);
  if (!CREDENTIAL_PATTERN.test(trimmed)) {
    throw new ValidationError(
      `the ${label} must be the value SteadFast issued - letters, digits, dots, dashes or underscores, with no spaces`,
    );
  }
  return trimmed;
}

/**
 * Saves the account.
 *
 * An empty field **keeps the stored value**: the owner may switch booking on, or change one key,
 * without retyping a secret they cannot read off the screen. Removing the account is a separate,
 * explicit action (`clearSteadfastCredentials`) rather than an empty submission, so a stray save can
 * never silently disconnect the courier.
 *
 * Switching booking on requires both keys to be present *after* the merge - enabling an account that
 * cannot authenticate would only produce failures nobody sees until the first order.
 */
export async function saveSteadfastSettings(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly apiKey: unknown; readonly secretKey: unknown; readonly enabled: unknown },
): Promise<SteadfastSettings> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const before = await loadSteadfastSettings(tx);

  const rawApiKey = asText(input.apiKey);
  const rawSecretKey = asText(input.secretKey);
  const apiKey = rawApiKey === null ? before.apiKey : parseCredential(rawApiKey, 'API key');
  const secretKey = rawSecretKey === null ? before.secretKey : parseCredential(rawSecretKey, 'secret key');
  const enabled = input.enabled === true || input.enabled === 'true' || input.enabled === 'on';

  if ((apiKey === null) !== (secretKey === null)) {
    throw new ValidationError('both the API key and the secret key are required');
  }
  if (enabled && (apiKey === null || secretKey === null)) {
    throw new ValidationError('save both keys before switching booking on');
  }

  const writes: { key: string; value: string | boolean; valueType: 'text' | 'boolean' }[] = [
    {
      key: STEADFAST_ENABLED_SETTING,
      value: enabled,
      valueType: 'boolean',
    },
  ];
  if (rawApiKey !== null) {
    writes.push({ key: STEADFAST_API_KEY_SETTING, value: apiKey as string, valueType: 'text' });
  }
  if (rawSecretKey !== null) {
    writes.push({ key: STEADFAST_SECRET_KEY_SETTING, value: secretKey as string, valueType: 'text' });
  }

  await tx
    .insert(storeSetting)
    .values(writes.map((row) => ({ ...row, updatedByStaffId: actor.staffUserId })))
    .onConflictDoUpdate({
      target: storeSetting.key,
      set: {
        value: sql`excluded.value`,
        valueType: sql`excluded.value_type`,
        updatedAt: sql`now()`,
        updatedByStaffId: actor.staffUserId,
      },
    });

  const after: SteadfastSettings = { apiKey, secretKey, enabled };

  // The audit record describes the **shape** of the account, never a key: a trail is read by more
  // people than a settings form is.
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'integration.steadfast_credentials_saved',
    entityType: 'store_setting',
    entityId: 1,
    before: {
      configured: credentialsOf(before) !== null,
      enabled: before.enabled,
      apiKeyHint: before.apiKey === null ? null : maskCredential(before.apiKey),
      secretKeyHint: before.secretKey === null ? null : maskCredential(before.secretKey),
    },
    after: {
      configured: credentialsOf(after) !== null,
      enabled: after.enabled,
      apiKeyHint: after.apiKey === null ? null : maskCredential(after.apiKey),
      secretKeyHint: after.secretKey === null ? null : maskCredential(after.secretKey),
    },
  });

  return after;
}

/** Removes both keys and switches booking off. Existing consignments keep their own rows. */
export async function clearSteadfastCredentials(tx: Transaction, actor: ActorContext): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const before = await loadSteadfastSettings(tx);

  await tx
    .delete(storeSetting)
    .where(sql`${storeSetting.key} in (${STEADFAST_API_KEY_SETTING}, ${STEADFAST_SECRET_KEY_SETTING})`);

  await tx
    .insert(storeSetting)
    .values({
      key: STEADFAST_ENABLED_SETTING,
      value: false,
      valueType: 'boolean',
      updatedByStaffId: actor.staffUserId,
    })
    .onConflictDoUpdate({
      target: storeSetting.key,
      set: { value: false, updatedAt: sql`now()`, updatedByStaffId: actor.staffUserId },
    });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'integration.steadfast_credentials_cleared',
    entityType: 'store_setting',
    entityId: 1,
    before: {
      configured: credentialsOf(before) !== null,
      enabled: before.enabled,
      apiKeyHint: before.apiKey === null ? null : maskCredential(before.apiKey),
    },
    after: { configured: false, enabled: false },
  });
}

// ------------------------------------------------------------------
// The order payload - pure, so it can be tested without a courier
// ------------------------------------------------------------------

export type SteadfastOrderData = {
  readonly invoice: string;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly area: string;
  readonly city: string;
  readonly postcode: string | null;
  readonly note: string | null;
  /** The order's frozen COD total, in poisha. */
  readonly codAmountMinor: number;
};

export type CreateOrderPayload = {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  note?: string;
};

export type PayloadResult =
  | { readonly ok: true; readonly payload: CreateOrderPayload }
  | { readonly ok: false; readonly message: string };

/** Cut on a word boundary where possible, so a truncated address does not end mid-word. */
function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return boundary > max / 2 ? cut.slice(0, boundary) : cut;
}

/** The recipient address the courier receives: the free-text line, then area, city and postcode once each. */
export function composeAddress(data: Pick<SteadfastOrderData, 'addressLine' | 'area' | 'city' | 'postcode'>): string {
  const parts: string[] = [];
  for (const raw of [data.addressLine, data.area, data.city, data.postcode]) {
    const part = raw?.replace(/\s+/g, ' ').trim() ?? '';
    if (part.length === 0) continue;
    // Area and city are often typed into the address line too, so a part already present inside an
    // earlier one is dropped: sending the same district twice reads as carelessness on the parcel.
    const lower = part.toLowerCase();
    if (parts.some((existing) => existing.toLowerCase().includes(lower))) continue;
    parts.push(part);
  }
  return parts.join(', ');
}

/** Poisha to the BDT number the courier's field wants, without floating-point drift on whole taka. */
export function toBdt(minor: number): number {
  return Number((minor / 100).toFixed(2));
}

/**
 * The `POST /create_order` body, exactly as the courier's documentation defines it.
 *
 * Refusals here are **local**: a phone that is not a Bangladeshi mobile, an empty name or a missing
 * address would be rejected by SteadFast anyway, and answering before the call says which field is the
 * problem. The two provider field limits (name 100, address 250) are applied by clipping, because the
 * order cannot be edited from this screen and a confirmed parcel must not be blocked over whitespace;
 * the store's own record keeps the full value.
 */
export function buildCreateOrderPayload(data: SteadfastOrderData): PayloadResult {
  const invoice = data.invoice.trim();
  if (invoice.length === 0 || invoice.length > LIMITS.invoice || !/^[A-Za-z0-9_-]+$/.test(invoice)) {
    throw new ValidationError('the order reference cannot be used as a SteadFast invoice');
  }

  const recipientName = data.recipientName.replace(/\s+/g, ' ').trim();
  if (recipientName.length < 2) return { ok: false, message: 'the recipient name is missing from this order' };

  const phone = data.recipientPhone.trim();
  if (!RECIPIENT_PHONE_PATTERN.test(phone)) {
    return { ok: false, message: 'the recipient phone is not an 11-digit Bangladeshi mobile number' };
  }

  const address = composeAddress(data);
  if (address.length < 5) return { ok: false, message: 'the delivery address is missing from this order' };

  if (!Number.isInteger(data.codAmountMinor) || data.codAmountMinor < 0) {
    return { ok: false, message: 'the amount to collect is not a valid amount' };
  }

  const payload: CreateOrderPayload = {
    invoice,
    recipient_name: clip(recipientName, LIMITS.recipientName),
    recipient_phone: phone,
    recipient_address: clip(address, LIMITS.recipientAddress),
    cod_amount: toBdt(data.codAmountMinor),
  };

  const note = data.note?.replace(/\s+/g, ' ').trim() ?? '';
  if (note.length > 0) payload.note = clip(note, LIMITS.note);

  return { ok: true, payload };
}

// ------------------------------------------------------------------
// The client
// ------------------------------------------------------------------

export type SteadfastConsignment = {
  readonly consignmentId: number;
  readonly invoice: string;
  readonly trackingCode: string;
  readonly status: string;
};

export type CreateOrderResult =
  | { readonly ok: true; readonly consignment: SteadfastConsignment }
  | { readonly ok: false; readonly message: string };

export type BalanceResult =
  | { readonly ok: true; readonly balance: number }
  | { readonly ok: false; readonly message: string };

export type StatusResult =
  | { readonly ok: true; readonly status: string }
  | { readonly ok: false; readonly message: string };

export type ClientOptions = {
  /** A test seam. Production always uses the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
};

/** The courier's own words when it has any, bounded and reduced to one line. */
function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return clip(record.message.replace(/\s+/g, ' ').trim(), 200);
    }
    const errors = record.errors;
    if (typeof errors === 'object' && errors !== null) {
      for (const value of Object.values(errors as Record<string, unknown>)) {
        if (Array.isArray(value) && typeof value[0] === 'string') return clip(value[0], 200);
        if (typeof value === 'string') return clip(value, 200);
      }
    }
  }
  return fallback;
}

/**
 * Where a request goes.
 *
 * `STEADFAST_API_BASE_URL` exists for **local verification only** - a stub courier on loopback lets a
 * developer prove the booking, the failure and the refresh without a live merchant account. It is
 * honoured only when the process declares itself a development environment, so a preview or production
 * deployment cannot be pointed at another host by an environment variable.
 */
function resolveBaseUrl(options: ClientOptions): string {
  if (options.baseUrl !== undefined) return options.baseUrl;
  const override = process.env.STEADFAST_API_BASE_URL?.trim();
  const development = (process.env.QUEENBEES_ENV ?? process.env.NODE_ENV) === 'development';
  if (development && override !== undefined && override.length > 0) return override;
  return STEADFAST_API_BASE;
}

async function call(
  path: string,
  credentials: SteadfastCredentials,
  options: ClientOptions,
  init?: { method: 'POST'; body: unknown },
): Promise<{ readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly message: string }> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? STEADFAST_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Api-Key': credentials.apiKey,
        'Secret-Key': credentials.secretKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init === undefined ? undefined : JSON.stringify(init.body),
      // Never a cached answer: a status read is a question about now.
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      message: timedOut
        ? `SteadFast did not answer within ${Math.round(timeoutMs / 1000)} seconds`
        : 'SteadFast could not be reached',
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      message:
        response.status === 401 || response.status === 403
          ? 'SteadFast refused the API key or secret key'
          : errorMessage(body, `SteadFast answered ${response.status}`),
    };
  }

  return { ok: true, body };
}

/**
 * Places one consignment.
 *
 * SteadFast answers `{ status: 200, message, consignment: { consignment_id, tracking_code, status } }`.
 * Anything else - a body without a consignment, a `status` that is not 200 - is a **failure**, because
 * storing a row that the courier did not acknowledge would tell the owner a parcel exists when it does
 * not.
 */
export async function createOrder(
  credentials: SteadfastCredentials,
  payload: CreateOrderPayload,
  options: ClientOptions = {},
): Promise<CreateOrderResult> {
  const response = await call('/create_order', credentials, options, { method: 'POST', body: payload });
  if (!response.ok) return response;

  const body = response.body as Record<string, unknown> | null;
  const status = body === null ? null : Number(body.status);
  if (status !== 200) {
    return { ok: false, message: errorMessage(body, 'SteadFast did not accept the consignment') };
  }

  const consignment = body?.consignment;
  if (typeof consignment !== 'object' || consignment === null) {
    return { ok: false, message: 'SteadFast answered without a consignment' };
  }

  const record = consignment as Record<string, unknown>;
  const consignmentId = Number(record.consignment_id);
  const trackingCode = typeof record.tracking_code === 'string' ? record.tracking_code.trim() : '';
  const consignmentStatus = typeof record.status === 'string' ? record.status.trim() : '';

  if (!Number.isInteger(consignmentId) || consignmentId <= 0 || trackingCode.length === 0) {
    return { ok: false, message: 'SteadFast answered without a tracking code' };
  }

  return {
    ok: true,
    consignment: {
      consignmentId,
      invoice: typeof record.invoice === 'string' && record.invoice.length > 0 ? record.invoice : payload.invoice,
      trackingCode,
      status: consignmentStatus.length > 0 ? consignmentStatus : 'in_review',
    },
  };
}

/** `GET /get_balance` - the account's current balance. Used by "Test connection", not by an order. */
export async function getBalance(
  credentials: SteadfastCredentials,
  options: ClientOptions = {},
): Promise<BalanceResult> {
  const response = await call('/get_balance', credentials, options);
  if (!response.ok) return response;

  const body = response.body as Record<string, unknown> | null;
  const balance = body === null ? Number.NaN : Number(body.current_balance);
  if (!Number.isFinite(balance)) {
    return { ok: false, message: 'SteadFast answered without a balance' };
  }
  return { ok: true, balance };
}

/** `GET /status_by_cid/{id}` - the courier's current delivery status for one consignment. */
export async function getDeliveryStatus(
  credentials: SteadfastCredentials,
  consignmentId: number,
  options: ClientOptions = {},
): Promise<StatusResult> {
  const response = await call(`/status_by_cid/${encodeURIComponent(String(consignmentId))}`, credentials, options);
  if (!response.ok) return response;

  const body = response.body as Record<string, unknown> | null;
  const status = typeof body?.delivery_status === 'string' ? body.delivery_status.trim() : '';
  if (status.length === 0) return { ok: false, message: 'SteadFast answered without a delivery status' };
  return { ok: true, status };
}
