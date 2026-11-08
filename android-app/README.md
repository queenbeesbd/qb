# QueenBee's Panel - the owner's Android app

A Capacitor shell around the deployed owner panel. It is **not** a second front end: there is no
business logic, no API key and no copy of the store in this directory. The WebView loads
`<deployment>/qbpanel`, and the deployed application answers exactly as it does in a browser.

## What it is

| | |
| --- | --- |
| App id | `bd.queenbees.panel` |
| Name | QueenBee's Panel |
| Loads | `https://queenbees.vercel.app/qbpanel` (override with `QUEENBEES_PANEL_URL`) |
| Session | The same `qb_staff_session` httpOnly cookie the browser gets, in the WebView's own cookie jar |
| Internet | TLS only - `usesCleartextTraffic="false"`, `allowMixedContent: false` |

**Signing in is a one-time act per device.** The panel's session lasts a year with a sliding
30-day idle limit (ADR 0031), and Android's WebView keeps the cookie across app restarts, so opening
the app lands on the dashboard, not on the sign-in form. Signing out from the panel's account menu,
a password change, or an owner revocation still ends the session immediately - the app adds no way
to stay signed in past those.

## Build

Requirements: JDK 17+ and an Android SDK with platform 35 and build-tools 35.

```bash
cd android-app
npm install                    # Capacitor CLI, core and the Android platform
npx cap sync android           # copy the shell, plugins and capacitor.config.json into android/
cd android && ./gradlew assembleDebug
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run apk:debug` in this
directory runs the sync and the Gradle build in one step.

Install it on the owner's phone:

```bash
adb install -r dist/queenbees-panel-debug.apk
```

Point the build at another deployment - a preview, a custom domain - without editing a file:

```bash
QUEENBEES_PANEL_URL=https://panel.example.com npm run apk:debug
```

## Release build and signing

`npm run apk:release` produces an **unsigned** release APK. A signed one needs a keystore the owner
holds, which is deliberately not in this repository: a signing key committed to a public repo signs
nothing safely. Create it once, keep it outside the repo, and point Gradle at it through
`android/keystore.properties` (gitignored):

```properties
storeFile=/absolute/path/to/queenbees-panel.jks
storePassword=...
keyAlias=queenbees-panel
keyPassword=...
```

## Icons

`node scripts/build-icons.mjs` regenerates every launcher icon and splash image from the owner's own
`logo.jpeg` at the repository root - five densities of the legacy, round and adaptive-foreground
icons, plus a splash for each orientation and density. Nothing here draws a second identity.

## Deliberately absent

- No offline copy of the panel: an admin screen is data from the database, and a stale copy would be
  a second, wrong answer.
- No exported API token, no embedded credential and no local database.
- No way to reach an admin surface other than the deployed `/qbpanel`; the app opens the origin it
  was built for and nothing else.
