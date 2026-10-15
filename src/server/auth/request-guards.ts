/**
 * CSRF, origin and redirect validation - the request-boundary checks.
 *
 * Pure functions over a `Request`, so every rule is unit-testable without a browser or a database.
 * The one exception is the forwarded-header opt-in (`proxyHeadersTrusted`), which reads the process
 * environment: it is off by default, so the untrusted path stays the default path.
 */

import { ADMIN_PATH_PATTERN, ADMIN_ROOT } from './constants';
import { safeEqual } from './tokens';

/**
 * Request correlation identifiers, in preference order.
 *
 * These are **correlation only**. They are read from request headers, so they are client-controlled
 * and are never used to identify an actor, to make an authorization decision, or to look anything up.
 * They exist so a denial record can be tied back to a request in the platform's own logs.
 *
 * `x-vercel-id` is set by the hosting platform; `x-request-id` is the conventional proxy header.
 */
const CORRELATION_HEADERS = ['x-vercel-id', 'x-request-id'] as const;

/** Conservative: an identifier we store must look like one, and must not be a place to hide data. */
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

/** The request's correlation identifier, or `null` when the request carries none we would store. */
export function requestCorrelationId(request: Request): string | null {
  for (const header of CORRELATION_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (value !== undefined && CORRELATION_PATTERN.test(value)) return value;
  }
  return null;
}

/** Methods that must never change state, and therefore need no CSRF token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isStateChanging(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/** The environment flag that switches the forwarded-header trust boundary on. */
export const PROXY_HEADER_TRUST_ENV = 'TRUST_PROXY_HEADERS';

/**
 * Whether `X-Forwarded-Host` and `X-Forwarded-Proto` may be trusted.
 *
 * **Off by default, in every environment.** Trusting those headers means trusting whoever sent them,
 * and a client that is not a browser can set them to anything. They are safe to read only when the
 * deployment sits behind a reverse proxy that **overwrites** both headers and is the **only**
 * network path to the application - a deployment fact that has to be verified before trust is
 * switched on, so it is never enabled automatically here. Read from the process environment directly
 * (no `DATABASE_URL` required), like the storefront's fixture opt-in.
 */
export function proxyHeadersTrusted(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return source[PROXY_HEADER_TRUST_ENV] === '1';
}

export type OriginCheckOptions = {
  /** Trust forwarded headers for the expected origin. Defaults to `proxyHeadersTrusted()`. */
  readonly trustProxyHeaders?: boolean;
};

/**
 * The origin a request must have come from.
 *
 * By default it is built from the request's own authority - the `Host` header the browser sent and
 * the runtime routed on, falling back to the request URL's host - and the scheme from the request
 * URL. The forwarded headers are **not read at all** in that mode, which is what makes a forged
 * `X-Forwarded-Host` harmless: it cannot move the expected origin, because nothing looks at it.
 *
 * The `Host` header is used ahead of the URL host deliberately. It is the authority the request was
 * actually addressed to, and it is the one the framework guarantees: Next.js resolves the request
 * URL from its own routing information rather than from the response-side value, so the URL host is
 * not always the public authority (`next start` can present a placeholder host). A browser sets
 * `Host` itself and a cross-site request cannot change it, which is why it is the untrusted-mode
 * input; a non-browser client that controls every header can satisfy any header-based check, which is
 * recorded in `docs/security.md` rather than hidden.
 *
 * With proxy trust enabled the forwarded values take precedence, which is what a verified reverse
 * proxy deployment needs. A plain-HTTP development server is compared as `http://` in both modes,
 * rather than being wrongly treated as HTTPS.
 */
function requestOrigin(request: Request, trustProxyHeaders: boolean): string {
  let scheme: string;
  let urlHost: string;
  try {
    const url = new URL(request.url);
    scheme = url.protocol === 'http:' ? 'http' : 'https';
    urlHost = url.host;
  } catch {
    return '';
  }

  if (!trustProxyHeaders) {
    const host = request.headers.get('host') ?? urlHost;
    if (host === '') return '';
    return `${scheme}://${host.toLowerCase()}`;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto === 'http' || forwardedProto === 'https') scheme = forwardedProto;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? urlHost;
  if (host === '') return '';
  return `${scheme}://${host.toLowerCase()}`;
}

/**
 * Same-origin check for a state-changing request.
 *
 * A cross-site form post cannot set a matching `Origin`, and `SameSite=Lax` on the session cookie
 * already keeps the cookie off a cross-site POST - this is the second, independent control that
 * `docs/data-model.md` 15.3 requires ("SameSite=Lax is a mitigation, not the whole control").
 *
 * `X-Forwarded-Host` and `X-Forwarded-Proto` are ignored unless proxy trust is explicitly enabled
 * (see `proxyHeadersTrusted`), so adding a forwarded header cannot make a cross-origin request look
 * same-origin. Enable it only for a deployment whose reverse proxy is verified to overwrite those
 * headers and to be the only network path to the application.
 */
export function isSameOrigin(request: Request, options: OriginCheckOptions = {}): boolean {
  const expected = requestOrigin(request, options.trustProxyHeaders ?? proxyHeadersTrusted());
  if (expected === '') return false;

  const origin = request.headers.get('origin');
  if (origin !== null && origin !== '') {
    return origin.toLowerCase() === expected;
  }
  // Some same-origin navigations omit Origin but send Referer; fall back to it rather than allowing
  // an absent header to pass.
  const referer = request.headers.get('referer');
  if (referer === null || referer === '') return false;
  try {
    return new URL(referer).origin.toLowerCase() === expected;
  } catch {
    return false;
  }
}

/**
 * Validates the submitted CSRF token against the session's derived token.
 *
 * The expected value is derived from the raw session token, which the caller has already read from
 * the httpOnly cookie. A missing, malformed or mismatched token fails closed.
 */
export function csrfTokenMatches(expected: string, submitted: FormDataEntryValue | null): boolean {
  if (typeof submitted !== 'string' || submitted === '') return false;
  return safeEqual(expected, submitted);
}

/**
 * Resolves a post-login return path.
 *
 * Only a same-origin, relative `/admin/...` path is accepted. Absolute URLs, protocol-relative
 * `//host` forms, backslash tricks, encoded separators and any path outside the admin tree resolve
 * to the admin root, so the login form cannot become an open redirect or an exfiltration vector.
 */
export function safeReturnPath(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined) return ADMIN_ROOT;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return ADMIN_ROOT;
  // A backslash is treated as a path separator by some browsers; reject rather than normalise.
  if (candidate.includes('\\')) return ADMIN_ROOT;
  // An encoded separator could be decoded downstream into a new path segment.
  if (/%2f|%5c/i.test(candidate)) return ADMIN_ROOT;
  // Query and fragment are dropped: the admin routes carry no state in the URL.
  const path = candidate.split('?')[0]?.split('#')[0] ?? '';
  if (!ADMIN_PATH_PATTERN.test(path)) return ADMIN_ROOT;
  return path;
}
