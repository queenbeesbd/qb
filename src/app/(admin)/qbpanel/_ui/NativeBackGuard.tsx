'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Keeps the Android back gesture on the panel's first screen.
 *
 * The panel ships as a thin Capacitor shell (`android-app/`) around this deployment, and the shell has no
 * native back handling: Android's gesture goes to the WebView, which goes **back** when it has an entry
 * behind it and otherwise closes the app. Inside the panel, every in-app navigation is a real history
 * entry (the rail, the lists and the editors all use `next/link`), so a deeper screen already behaves.
 * The exception is the **start screen**: the app opens on `/qbpanel` with nothing behind it, so the first
 * gesture closed the panel (owner report, 2026-11-12).
 *
 * This component gives that screen one in-app entry of its own, through the Next router rather than
 * `history.pushState`, so the router owns the entry: popping it lands on the same page instead of on the
 * launcher.
 *
 * **The complete fix is native**, and it is recorded rather than pretended: `@capacitor/app` plus a
 * `backButton` listener that walks the page's parent route. Changing the shell requires a JDK and a
 * rebuilt APK, which the development container this was written in does not have - so the web side is
 * what could be fixed and verified here. `panelParent` already defines the parent every page would use.
 */
export function NativeBackGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (!runsInShell()) return;
    if (pathname !== '/qbpanel') return;

    /*
     * One extra entry for the start screen, pushed once per mount. Pushing on every route change would
     * grow the stack with the owner's own clicks; the rail already does that.
     */
    done.current = true;
    router.push('/qbpanel');
  }, [pathname, router]);

  return null;
}

/**
 * Whether this page is the deployment inside the Android shell.
 *
 * Capacitor injects a `Capacitor` global into the WebView and it is absent in every browser. It is read
 * as `unknown` and narrowed here - `in`, `typeof`, `Reflect.apply` - rather than asserted into a shape
 * and trusted, because it is a value this code did not create.
 */
function runsInShell(): boolean {
  const candidate: unknown = Reflect.get(window, 'Capacitor');
  if (typeof candidate !== 'object' || candidate === null) return false;
  if (!('isNativePlatform' in candidate)) return false;
  const isNative = candidate.isNativePlatform;
  return typeof isNative === 'function' && Reflect.apply(isNative, candidate, []) === true;
}
