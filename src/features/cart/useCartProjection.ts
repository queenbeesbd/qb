'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CartLine } from '@/lib/types';
import { mirrorCartCookie } from './cart-cookie';
import type { CartProduct } from './cart-product';

/**
 * How long a page waits for its own recovery refresh before admitting the gap is real.
 *
 * A mismatch is expected to be transient: the cookie is written by the browser, and the page is drawn
 * by the server moments later. If the refresh comes back without the product, waiting longer would only
 * keep the customer looking at a basket that does not add up.
 */
const STALL_MS = 4000;

export type CartProjection = {
  /** Lines this page has no product for. Zero whenever the cookie and the cart agree. */
  unresolvedCount: number;
  /** The recovery refresh has run and the gap survived it - the cookie could not be read or written. */
  stalled: boolean;
};

/**
 * Keeps a server-projected cart page honest about the lines it cannot draw.
 *
 * `/cart` and `/checkout` are rendered from the ids in the `qb_cart` cookie rather than from the whole
 * catalog (Phase 45b). The cart itself lives in `localStorage`, and the two can disagree: a browser
 * that drops the cookie, a cart saved before the mirror existed, or a value that was tampered with all
 * leave a line with no product behind it.
 *
 * Three things happen, in order, and each one is cheap:
 *
 * 1. **Nothing is hidden.** A missing product is counted, never silently skipped, so the summary and
 *    the submit button can be gated rather than quietly ordering fewer items than the customer chose.
 * 2. **One recovery refresh.** The cookie is written from the live cart and the server tree is
 *    re-fetched, which normally resolves the gap in a single round trip with the customer's input
 *    state intact (`router.refresh` re-renders server components without remounting this form).
 * 3. **Then the truth.** If the gap survives that refresh, the page says so instead of showing a cart
 *    that is missing a line. It is repeated at most once per distinct set of missing ids, so a browser
 *    that refuses the cookie cannot cause a refresh loop.
 */
export function useCartProjection(
  lines: readonly CartLine[],
  products: readonly CartProduct[],
): CartProjection {
  const router = useRouter();

  /** The sorted ids this page cannot draw. Only a change to this set triggers work. */
  const signature = useMemo(() => {
    const known = new Set(products.map((product) => product.id));
    const missing = new Set<string>();
    for (const line of lines) if (!known.has(line.productId)) missing.add(line.productId);
    return [...missing].sort().join('.');
  }, [lines, products]);

  const attempted = useRef<string | null>(null);
  const [stalledFor, setStalledFor] = useState<string | null>(null);

  useEffect(() => {
    if (signature === '') return;
    /*
     * The refresh is attempted once per distinct gap, and the stall clock starts with it rather than
     * with a second render: a refresh that changes nothing produces no re-render to schedule it from.
     * The cleanup cancels the clock, so a refresh that does land (the common case) never shows a
     * sentence the customer has no reason to read.
     */
    if (attempted.current !== signature) {
      attempted.current = signature;
      mirrorCartCookie(lines);
      router.refresh();
    }
    const timer = window.setTimeout(() => setStalledFor(signature), STALL_MS);
    return () => window.clearTimeout(timer);
  }, [signature, lines, router]);

  return {
    unresolvedCount: signature === '' ? 0 : signature.split('.').length,
    stalled: signature !== '' && stalledFor === signature,
  };
}
