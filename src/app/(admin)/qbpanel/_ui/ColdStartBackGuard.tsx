'use client';

import { useEffect } from 'react';

import { panelParent } from './panel-up';

/**
 * Gives a deep panel page something real behind it.
 *
 * A panel opened from a bookmark, a shared link or the Android shell **cold-starts on one entry**: the
 * browser's back button then leaves the shop, and the app's swipe closes the app, because there is
 * nothing behind the page and the WebView cannot go back (owner report, 2026-11-12). The in-page Back
 * control covers the same ground without history, but the system gesture is the one the owner reaches for.
 *
 * The fix is to make the history stack honest about where the page sits: on a cold start only, the single
 * entry is **rewritten to the page's parent** and the page is pushed on top, so "back" has somewhere to
 * go - and where it goes is the parent, not off the site. A `popstate` then finishes the move with a real
 * navigation, because the DOM behind the rewritten URL is the wrong page.
 *
 * Nothing happens when the panel already has history: a tab that reached this page by clicking keeps its
 * ordinary behaviour, and the guard never stacks duplicates.
 */
export function ColdStartBackGuard({ parentHref }: { parentHref: string | null }) {
  useEffect(() => {
    if (parentHref === null) return;
    /*
     * No referrer means no page handed this document over: a bookmark, a shared link, the Android shell's
     * first load. A tab that reached the page by clicking has a referrer and real entries behind it, and a
     * soft navigation re-runs this effect with the stack already grown - the length check keeps the guard
     * from seeding twice. Two entries is a fresh tab (a blank page and this one), which still has nothing
     * in the panel behind it.
     */
    if (document.referrer !== '' || window.history.length > 2) return;

    const here = window.location.href;
    window.history.replaceState({ qbBelow: true }, '', parentHref);
    window.history.pushState({ qbHere: true }, '', here);

    const onPop = (): void => {
      /*
       * The pop restored the parent's URL but the document is still this page, so finish the move for
       * real rather than leaving the address bar and the screen disagreeing.
       */
      window.location.replace(parentHref);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [parentHref]);

  return null;
}
