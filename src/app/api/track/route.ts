/**
 * POST /api/track - one storefront step, recorded first-party (ADR 0025).
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

import { withTransaction } from '@/db/client';
import { CART_COOKIE_NAME, parseCartIds } from '@/features/cart/cart-cookie';
import {
  VISIT_COOKIE,
  VISIT_COOKIE_MAX_AGE_SECONDS,
  deviceFromUserAgent,
  isBotUserAgent,
  isVisitSessionId,
  normalisePath,
  recordVisit,
  type VisitEventKind,
} from '@/server/analytics/visits';
import { isSameOrigin } from '@/server/auth/request-guards';
import { cookiesMustBeSecure } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

/** The steps a browser may report. `order_placed` is written by the order transaction, not here. */
const CLIENT_KINDS: readonly VisitEventKind[] = ['page_view', 'cart_add', 'checkout_start'];

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

  return noContent();
}
