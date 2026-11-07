/**
 * The storefront's own visit beacon - ADR 0027.
 *
 * One small same-origin POST per step. It carries a path and a step name and nothing else: no
 * identifier, no referrer, no screen size, no timing. The session id lives in an httpOnly cookie the
 * server sets, so no script can read or forge it.
 *
 * Failures are swallowed on purpose. A shop that cannot record a page view must still sell the
 * product on that page, so this never throws and never blocks a render.
 */
export type VisitStep = 'page_view' | 'cart_add' | 'checkout_start';

export function trackVisit(kind: VisitStep, path: string): void {
  if (typeof window === 'undefined') return;
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, kind }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A browser that refuses the request leaves the visit uncounted, which is the honest outcome.
  }
}
