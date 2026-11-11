/**
 * Transactional SMS through BulkSMSBD (`sms_api.md`).
 *
 * **Server-only, and only for account security.** Two messages exist: the six-digit code sent at
 * registration, and the six-digit code sent when a customer with a phone number recovers a password.
 * Nothing orders, marketing or analytics related is sent here.
 *
 * Configuration is the process environment:
 *
 * - `BULKSMS_API_KEY` - required; without it the integration is **off**.
 * - `BULKSMS_SENDER_ID` - required to send, but may legitimately be empty while the provider has not
 *   issued one yet. A missing sender means "nothing is sent", never "send with a guessed sender".
 * - `BULKSMS_API_URL` - a development-only test seam, refused outside a development environment.
 * - `SMS_CODE_SECRET` - optional. Pecks the on-disk digest of a six-digit code; falls back to the API
 *   key, which exists only where sending exists.
 *
 * **Nothing in this module may leak a number, a code or the provider's response** into a redirect, a
 * log line or a return value: failures are one of four closed reasons.
 */

export type SmsMessage = {
  readonly to: string;
  readonly body: string;
};

export type SmsFailure = 'not_configured' | 'rejected' | 'unreachable';

export type SmsOutcome =
  | { readonly ok: true; readonly id: string | null }
  | { readonly ok: false; readonly reason: SmsFailure };

export type SmsOptions = {
  /** A test seam: production always uses the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  /** Env override, so a test can describe an environment without mutating `process.env`. */
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
};

export const BULKSMS_API = 'https://bulksmsbd.net/api/smsapi';
export const SMS_TIMEOUT_MS = 8000;

function env(source: Readonly<Record<string, string | undefined>>, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * True when an API key **and** a sender id are both present.
 *
 * The sender id is deliberately part of this test: the provider refuses a message without an approved
 * one, and pretending to send would leave a customer waiting for a code that never arrives.
 */
export function smsConfigured(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env(source, 'BULKSMS_API_KEY') !== null && env(source, 'BULKSMS_SENDER_ID') !== null;
}

/**
 * The key a six-digit code is digested under.
 *
 * Six digits are a one-in-a-million space, so a plain SHA-256 would be reversible from a database
 * dump in seconds. Keying the digest with a server-only secret makes the dump worthless on its own,
 * and a wrong guess still has to be submitted one attempt at a time.
 */
export function smsCodeKey(source: Readonly<Record<string, string | undefined>> = process.env): string | null {
  return env(source, 'SMS_CODE_SECRET') ?? env(source, 'BULKSMS_API_KEY');
}

/**
 * The provider's number form: `880` then the ten digits after the leading zero.
 *
 * The canonical stored form is the schema's own eleven-digit `01[3-9]…`; a value in any other shape
 * is refused rather than normalised again, because by this point the number came out of our database.
 */
export function smsRecipient(phone: string): string | null {
  return /^01[3-9][0-9]{8}$/.test(phone) ? `88${phone}` : null;
}

/** Where a request goes. The override is honoured only in a declared development environment. */
function resolveBase(options: SmsOptions, source: Readonly<Record<string, string | undefined>>): string {
  if (options.baseUrl !== undefined) return options.baseUrl;
  const override = env(source, 'BULKSMS_API_URL');
  const development = (env(source, 'QUEENBEES_ENV') ?? env(source, 'NODE_ENV')) === 'development';
  if (development && override !== null) return override;
  return BULKSMS_API;
}

type ProviderBody = {
  readonly response_code?: unknown;
  readonly success?: unknown;
  readonly success_message?: unknown;
  readonly error_message?: unknown;
  readonly message_id?: unknown;
};

/**
 * Reads the provider's own answer.
 *
 * BulkSMSBD answers HTTP 200 for both outcomes and puts the verdict in `response_code` (202 is sent,
 * every other listed code is a refusal). A body without that field is treated as accepted on a 2xx
 * response - the same tolerant reading the provider's own examples rely on.
 */
function readVerdict(body: ProviderBody | null, status: number): SmsOutcome {
  if (body !== null && typeof body.response_code === 'number') {
    return body.response_code === 202
      ? { ok: true, id: typeof body.message_id === 'string' ? body.message_id : null }
      : { ok: false, reason: 'rejected' };
  }
  if (body !== null && body.success === false) return { ok: false, reason: 'rejected' };
  if (status >= 200 && status < 300) return { ok: true, id: null };
  return { ok: false, reason: 'rejected' };
}

/**
 * Sends one message. **Never throws.**
 *
 * The caller is always an account flow that must still answer the customer, so a provider outage is a
 * value rather than an exception.
 */
export async function sendSms(message: SmsMessage, options: SmsOptions = {}): Promise<SmsOutcome> {
  const source = options.source ?? process.env;
  const apiKey = env(source, 'BULKSMS_API_KEY');
  const senderId = env(source, 'BULKSMS_SENDER_ID');
  if (apiKey === null || senderId === null) return { ok: false, reason: 'not_configured' };

  const recipient = smsRecipient(message.to);
  if (recipient === null) return { ok: false, reason: 'rejected' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SMS_TIMEOUT_MS;

  const form = new URLSearchParams({
    api_key: apiKey,
    senderid: senderId,
    number: recipient,
    message: message.body,
  });

  let response: Response;
  try {
    response = await fetchImpl(resolveBase(options, source), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: form.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  let body: ProviderBody | null = null;
  try {
    body = (await response.json()) as ProviderBody;
  } catch {
    body = null;
  }

  return readVerdict(body, response.status);
}
