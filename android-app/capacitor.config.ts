import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The owner's panel, wrapped as an Android app.
 *
 * The panel is the Next.js application this repository serves - server components, server-side
 * sessions and database reads. There is no static bundle that could run inside the WebView, so the
 * app is a **thin shell around the deployed panel**: `server.url` points the WebView at the live
 * origin and every request is answered by the deployment, exactly as it is in a browser.
 *
 * The origin is not hardcoded in a way that cannot be corrected: `QUEENBEES_PANEL_URL` overrides it
 * at build time (`npm run apk:release` in `app/`), so a custom domain or a different deployment does
 * not require editing this file.
 *
 * `androidScheme: 'https'` keeps the WebView's own origin on `https://localhost`, which is what makes
 * the panel's `Secure` session cookie, its `SameSite=Lax` policy and its same-origin checks behave as
 * they do in a browser. `cleartext` is off: the panel is only ever reached over TLS.
 */

const origin = (process.env.QUEENBEES_PANEL_URL ?? 'https://queenbees.vercel.app').replace(/\/+$/, '');
const panel = `${origin}/qbpanel`;

const config: CapacitorConfig = {
  appId: 'bd.queenbees.panel',
  appName: "QueenBee's Panel",
  webDir: 'www',
  server: {
    url: panel,
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
