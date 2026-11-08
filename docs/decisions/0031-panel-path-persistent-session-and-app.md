# ADR 0031 - The panel's own path, a session that survives a restart, and an Android app

- **Status:** accepted, 2026-11-09 (owner instruction)
- **Supersedes:** the Phase 12 session-lifetime values (`docs/data-model.md` 4.7: 8-hour absolute,
  30-minute idle) for the **owner** surface only.
- **Touches:** `docs/security.md`, `docs/data-model.md` 4.7, `docs/design-system.md`,
  `docs/database.md`, `README.md`, `AGENTS.md`

## Context

Three owner reports, one afternoon:

1. **"`/admin` is easy to guess."** The panel sat on the most predictable path a scanner tries first.
   Every route is authenticated and permission-checked, and a wrong password is throttled by account
   and by source - so this was never a break-in, it was an invitation. The owner asked for a path of
   our own.
2. **"I have to sign in every time I open the panel."** The Phase 12 lifetimes were written for a
   multi-staff assumption this shop does not have: an 8-hour absolute ceiling with a 30-minute idle
   limit. A shop owner who opens the panel in the morning, closes the laptop and returns after lunch
   was signed out by design.
3. **"Give me the panel as an Android app."** The panel is the way this shop is run, mostly from a
   phone. The owner asked for an installable app, with the password asked once.

## Decision

### 1. The panel lives at `/qbpanel`

The administrative tree moves from `/admin/...` to `/qbpanel/...`, and its mutation routes from
`/api/admin/...` to `/api/qbpanel/...`. Nothing is aliased: `/admin` now 404s, for the same reason
Phase 13 removed the staff screen rather than redirecting it - a retired path that still answers is
an invitation with a signpost on it.

**The path is not a security control and is not treated as one.** This repository is public, so the
path is readable by anyone. What protects the panel is what protected it before: an authenticated
session, per-permission server-side checks, same-origin and CSRF checks on every mutation, throttled
sign-in, and a generic failure that never discloses whether an account exists. The rename removes the
one-step guess, which is all it was ever worth.

### 2. Nothing may index it

Three independent controls, none of which names the path in a public file:

- every panel route already declares `robots: { index: false, follow: false }` in its metadata;
- `next.config.ts` sets `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` on `/qbpanel/:path*`
  and `/api/qbpanel/:path*`, so the header travels with the response rather than depending on a page
  render;
- `src/app/robots.ts` returns `Disallow: /` for every user agent. It is deliberately **blanket**:
  a `Disallow: /qbpanel` line would publish the path to anyone who asks for `robots.txt`, which is
  the opposite of the intent.

### 3. An owner session lasts, and still ends

`SESSION_ABSOLUTE_MS` is **one year** and `SESSION_IDLE_MS` is **30 days**, both still server-side
facts on the `staff_session` row, still enforced on every resolve, still clamped so the idle limit
cannot pass the ceiling. The cookie's `maxAge` follows the ceiling.

What this does **not** change: a session is still revoked immediately by sign-out, a password change
and owner revocation; the token is still opaque, still stored only as a SHA-256 digest, still in an
`httpOnly`, `SameSite=Lax`, `Secure`-in-production cookie; the login throttle is unchanged.

The trade is stated rather than hidden: a lost or stolen signed-in device stays signed in for longer.
The owner revokes a session from the panel's owner-account screen (`staff.write`), which was already
the answer to that risk, and the year-long ceiling means a forgotten device eventually expires by
itself.

### 4. The Android app is a shell, not a second application

`android-app/` is a Capacitor project whose `server.url` is `<deployment>/qbpanel`. The WebView renders the
deployed panel; no business logic, credential, API token or copy of the store exists in the app. The
session cookie is the same one the browser gets, kept in the WebView's own cookie jar, which is why
signing in happens once per device.

The project lives in `android-app/`, not `app/`. Next.js resolves a root-level `app/` directory as **its
own** route directory, ahead of `src/app/`, so a Capacitor project at `app/` silently replaced this
application's routes with an empty tree (measured: the build emitted only `_global-error`,
`_not-found` and a route scraped out of `app/node_modules`). The directory keeps the "app" meaning
without colliding with the framework's.

Consequences accepted with it:

- the app needs a network connection, because the panel is data from the database and a cached copy
  would be a second, wrong answer;
- a deployment that changes origin requires a rebuilt APK (`QUEENBEES_PANEL_URL` at build time);
- the debug APK in `android-app/dist/` is **debug-signed** and is for the owner's own phone. A release build
  needs the owner's own keystore, which is never committed.

## Alternatives considered

- **A configurable path (`ADMIN_BASE_PATH`).** Next.js routes are directory names, so a configurable
  path would need a rewrite that leaks the internal path in the address bar after the first
  server-side redirect. A fixed, unguessable-enough path with no aliases is simpler and honest.
- **Keeping `/admin` as a redirect to `/qbpanel`.** Rejected: it defeats the point, and it is the
  same "retired route that still answers" pattern this repository has already rejected twice.
- **A `remember me` checkbox instead of a longer session.** Rejected: the owner asked for the
  behaviour, not a control they would have to remember to tick; and a checkbox on a one-owner panel
  is a way to end up signed out by mistake.
- **A static export inside the APK.** Impossible without rewriting the panel: every admin screen
  reads a session and the database on the server.

## Verification

Recorded in the same change as the CHANGELOG entry: typecheck, lint, unit suite, a production build,
`/qbpanel` answering with a redirect to `/qbpanel/login` and carrying the `X-Robots-Tag` header,
`/admin` answering 404, `robots.txt` answering `Disallow: /`, and the APK built from `android-app/` and
inspected with `aapt2 dump badging`. Real-device installation and a real Android WebView are **not**
verified by any of that.
