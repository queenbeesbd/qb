/**
 * POST /api/track - one storefront step, recorded first-party (ADR 0027).
 *
 * Public by design: a visitor is not signed in. The request is same-origin checked, the body is
 * validated to a known step and a path, and the session id comes from an httpOnly cookie the server
 * sets - never from the body. A forged request can therefore only add a page view to a session it
 * already owns, which is not a capability worth defending.
 *
 * Crawlers and link previews are dropped before anything is written, so the figures are the shop's
 * own readers. The response is always empty and never cached.
 */

import { cookies } from 'next/headers';
import { after } from 'next/server';

import { withTransaction } from '@/db/client';
import { CART_COOKIE_NAME, parseCartIds } from '@/features/cart/cart-cookie';
import {
  VISIT_COOKIE,
  VISIT_COOKIE_MAX_AGE_SECONDS,
  deviceFromUserAgent,
  divisionFromHeaders,
  isBotUserAgent,
  isVisitSessionId,
  normalisePath,
  pruneVisitLog,
  recordVisit,
  type VisitEventKind,
} from '@/server/analytics/visits';
import { isSameOrigin } from '@/server/auth/request-guards';
import { cookiesMustBeSecure } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

/** The steps a browser may report. `order_placed` is written by the order transaction, not here. */
const CLIENT_KINDS: readonly VisitEventKind[] = ['page_view', 'cart_add', 'checkout_start'];

/**
 * The retention sweep rides on traffic instead of a scheduler.
 *
 * At most once an hour per server instance, after the response has been sent, the route deletes
 * sessions older than `VISIT_RETENTION_DAYS`. A shop with no traffic has no new rows to prune, so the
 * sweep needs no timer of its own; `npm run visits:prune` is the explicit run. A failed sweep is
 * swallowed: a page view that was accepted must not fail because a delete did.
 */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function pruneIsDue(now: number): boolean {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return false;
  lastPruneAt = now;
  return true;
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });

  const userAgent = request.headers.get('user-agent');
  if (isBotUserAgent(userAgent)) return noContent();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const candidate = body as { path?: unknown; kind?: unknown } | null;
  const rawPath = typeof candidate?.path === 'string' ? candidate.path : null;
  const kind = typeof candidate?.kind === 'string' ? candidate.kind : null;
  if (rawPath === null || kind === null || !(CLIENT_KINDS as readonly string[]).includes(kind)) {
    return new Response(null, { status: 400 });
  }

  const store = await cookies();
  const existing = store.get(VISIT_COOKIE)?.value ?? null;
  const sessionId = isVisitSessionId(existing) ? existing : null;
  const hasCart = parseCartIds(store.get(CART_COOKIE_NAME)?.value).length > 0;

  const written = await withTransaction((tx) =>
    recordVisit(tx, {
      sessionId,
      path: normalisePath(rawPath),
      kind: kind as VisitEventKind,
      device: deviceFromUserAgent(userAgent),
      // Only the platform's own country/region resolution, and only as one of eight words. No address,
      // city or coordinate is read, stored or logged (ADR 0033); the storefront never asks for one.
      division: divisionFromHeaders(
        request.headers.get('x-vercel-ip-country'),
        request.headers.get('x-vercel-ip-country-region'),
      ),
      hasCart,
    }),
  );

  if (sessionId === null) {
    store.set(VISIT_COOKIE, written, {
      httpOnly: true,
      secure: cookiesMustBeSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: VISIT_COOKIE_MAX_AGE_SECONDS,
    });
  }

  if (pruneIsDue(Date.now())) {
    after(async () => {
      try {
        await withTransaction((tx) => pruneVisitLog(tx));
      } catch {
        // A failed sweep must never fail a page view.
      }
    });
  }

  return noContent();
}
