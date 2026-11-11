/**
 * Transactional email, sent through Resend (ADR 0030).
 *
 * **Server-only, and only for account security.** The customer surface sends mail for exactly four
 * things: a password-recovery link, a registration verification link, a "your password changed" notice
 * and a "your address changed" notice to the previous address. A change of address no longer mails a
 * confirmation to the new address (owner decision, 2026-11-12); no order, marketing or analytics
 * message exists here.
 *
 * The API key comes from the process environment (`RESEND_API_KEY`) and is never read from the
 * database, a committed file, a client bundle or a form. `EMAIL_FROM` is the verified sender Resend
 * accepts; when either is missing the integration is simply **off** and every caller is told so
 * instead of pretending a message was sent.
 *
 * **Nothing in this module may leak an address or a token.** A failure is reported as one of three
 * closed reasons; the recipient, the body and Resend's own response are never logged, never returned
 * into a redirect and never stored. Callers deliberately do not vary their user-facing answer on the
 * result: a recovery request must look identical whether the account exists, whether the provider
 * accepted the message, or whether it was never configured.
 */

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

export type EmailFailure = 'not_configured' | 'rejected' | 'unreachable';

export type EmailOutcome = { readonly ok: true; readonly id: string | null } | { readonly ok: false; readonly reason: EmailFailure };

export type EmailOptions = {
  /** A test seam: production always uses the platform `fetch`. */
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  /** Env override, so a test can describe an environment without mutating `process.env`. */
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
};

export const RESEND_API = 'https://api.resend.com';
export const EMAIL_TIMEOUT_MS = 8000;

function env(source: Readonly<Record<string, string | undefined>>, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** True when a key and a sender are both present. A missing pair means "send nothing". */
export function emailConfigured(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env(source, 'RESEND_API_KEY') !== null && env(source, 'EMAIL_FROM') !== null;
}

/**
 * The absolute origin a mailed link points at.
 *
 * `APP_BASE_URL` is the deployment's own address (for example `https://queenbeesbd.com`). Outside
 * production the local development origin is used so a link works while developing. In production
 * without the variable there is **no** origin, and a caller must treat that as "cannot send" rather
 * than mailing a link to the wrong host - a reset link that lands on `localhost` is worse than none.
 */
export function publicBaseUrl(source: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const configured = env(source, 'APP_BASE_URL');
  if (configured !== null) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
      }
    } catch {
      // Fall through to the development default / null.
    }
  }
  const environment = env(source, 'QUEENBEES_ENV') ?? env(source, 'NODE_ENV');
  return environment === 'production' ? null : 'http://localhost:3000';
}

/**
 * Where a request goes. `RESEND_API_BASE_URL` is honoured only when the process declares a development
 * environment, so local verification can point at a stub and a deployed environment cannot be
 * redirected by an environment variable.
 */
function resolveBase(options: EmailOptions, source: Readonly<Record<string, string | undefined>>): string {
  if (options.baseUrl !== undefined) return options.baseUrl;
  const override = env(source, 'RESEND_API_BASE_URL');
  const development = (env(source, 'QUEENBEES_ENV') ?? env(source, 'NODE_ENV')) === 'development';
  if (development && override !== null) return override;
  return RESEND_API;
}

/**
 * Sends one message. **Never throws.**
 *
 * A caller in an account flow must still answer the customer, so a provider outage is a value, not an
 * exception. The result is intentionally coarse: `not_configured`, `rejected`, `unreachable`.
 */
export async function sendEmail(message: EmailMessage, options: EmailOptions = {}): Promise<EmailOutcome> {
  const source = options.source ?? process.env;
  const apiKey = env(source, 'RESEND_API_KEY');
  const from = env(source, 'EMAIL_FROM');
  if (apiKey === null || from === null) return { ok: false, reason: 'not_configured' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? EMAIL_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchImpl(`${resolveBase(options, source)}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (!response.ok) return { ok: false, reason: 'rejected' };

  try {
    const body = (await response.json()) as { id?: unknown };
    return { ok: true, id: typeof body.id === 'string' ? body.id : null };
  } catch {
    return { ok: true, id: null };
  }
}

