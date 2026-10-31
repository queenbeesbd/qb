/**
 * Request-boundary security headers.
 *
 * This is the one place a deployment-wide policy is applied before a route renders. It sets a
 * **nonce-based Content-Security-Policy**, which is the control `docs/security.md` recorded as an
 * open requirement: without it, a single injected script has the same authority as the application's
 * own code.
 *
 * Why a nonce rather than `'unsafe-inline'`: an allow-listed inline script cannot be forged, because
 * an attacker would have to guess a value that is fresh for every request. Every route that could
 * carry a nonce is already dynamically rendered (the whole storefront and admin are `force-dynamic`),
 * so the CSP costs no cacheability here.
 *
 * `style-src` keeps `'unsafe-inline'` deliberately. React writes inline `style` attributes in 9
 * places, and a nonce cannot authorise a style *attribute* - only an element. Removing it would mean
 * rewriting those into generated classes for no security gain, because the interesting attack -
 * script execution - is already controlled by the script policy.
 *
 * Next.js reads the nonce back out of this header and stamps it on the scripts it emits, so nothing
 * in application code has to thread it through.
 */

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Origins images may be loaded from.
 *
 * The storefront renders `/catalog/<key>-<width>.<ext>`, which this deployment answers with a
 * permanent redirect to object storage, so the browser's final fetch is from the bucket's own
 * origin. That origin is configuration, never hardcoded: it is the same value the asset route uses.
 */
function imageOrigins(): string {
  const base = process.env.CATALOG_ASSET_BASE_URL?.trim() ?? '';
  if (base === '') return '';
  try {
    return ` ${new URL(base).origin}`;
  } catch {
    return '';
  }
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    "default-src 'self'",
    // `strict-dynamic` lets the nonced bootstrap script load the chunks it needs, so no host has to
    // be allow-listed. `unsafe-eval` is development only: React uses eval for debug tooling there and
    // nothing in production does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // `data:` and `blob:` are needed by the storefront's own rendering; the storage origin is added
    // only when this deployment actually serves images from one.
    `img-src 'self' data: blob:${imageOrigins()}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  /**
   * Every document request, but not static assets: a policy on a JS or image response buys nothing
   * and would make every asset request pay for the header.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|catalog/).*)'],
};
