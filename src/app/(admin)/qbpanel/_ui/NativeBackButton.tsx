'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The Android hardware back button and swipe, answered in the panel's own terms.
 *
 * In the shell the gesture is the **native** Back button: the WebView hands it to `@capacitor/app`
 * instead of doing what it would in a browser, so what happens next is ours to decide. The rule is the
 * same as the in-page control: go up to this page's parent route, and never leave the shop by accident.
 *
 * - History first (`canGoBack`), because that is what the owner did - a list, a filter, a page they came
 *   from. The Next router restores it exactly as a click would.
 * - Otherwise the parent route, which is a fact about where the page sits (`panelParent`), not about
 *   where the owner came from.
 * - At the overview there **is no parent**, and the gesture does nothing rather than closing the app -
 *   the owner reported a swipe on the start screen closing it, so that is the one case with no exit.
 *
 * Nothing runs outside the shell: `@capacitor/app` resolves in a browser too, but the platform check
 * means a phone browser keeps its own back button (which `ColdStartBackGuard` supplies an entry for).
 */
export function NativeBackButton({ parentHref }: { parentHref: string | null }) {
  const router = useRouter();

  useEffect(() => {
    let removed = false;
    let detach: (() => Promise<void>) | null = null;

    void (async () => {
      try {
        const [{ Capacitor }, { App }] = await Promise.all([
          import('@capacitor/core'),
          import('@capacitor/app'),
        ]);
        if (!Capacitor.isNativePlatform() || removed) return;

        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }
          if (parentHref !== null) router.push(parentHref);
        });

        if (removed) {
          void handle.remove();
          return;
        }
        detach = () => handle.remove();
      } catch {
        /*
         * The plugin is absent in a browser and in any build that predates this change. Back then
         * behaves as the platform does, which is what the guard and the in-page control cover.
         */
      }
    })();

    return () => {
      removed = true;
      void detach?.();
    };
  }, [parentHref, router]);

  return null;
}
