# Calistheni native foundation

Calistheni’s iOS and Android apps use Capacitor 8 as a native shell around the
same deployed Next.js application. The web app remains the single source of
truth for UI, Auth.js sessions, API routes, Prisma, Neon, Cloudflare R2,
Mapbox, and Stripe server endpoints.

## Required software

- Node.js 20 or newer and npm
- Xcode (current version) and an Apple Developer account for device signing
- Android Studio, Android SDK Platform 35+, and JDK 21
- A reachable HTTPS deployment for production/staging native builds

Run `npm install` after cloning. Native projects are committed in `ios/` and
`android/`; do not regenerate them with `cap add` after changing native code.

## Configuration and environments

`capacitor.config.ts` has the stable app identifier `app.calistheni.mobile` and
loads `https://calistheni.app` by default. The Next.js app is not statically
exportable: it contains Auth.js, route handlers, Prisma, and server rendering.
The small `mobile-web/` bundle exists only as a branded local launch fallback;
the application is served by the configured HTTPS origin.

Set `CAPACITOR_SERVER_URL` before `mobile:sync` to select an environment:

```bash
# Production (the default)
npm run mobile:sync

# Staging: use an HTTPS deployment
CAPACITOR_SERVER_URL=https://staging.calistheni.app npm run mobile:sync

# Device live reload: use your computer's LAN IP, never localhost.
# Android needs cleartext only for this local HTTP case.
CAPACITOR_SERVER_URL=http://192.168.1.25:3000 npm run mobile:sync
```

Do not put database, Auth.js, R2, Stripe secret, or Mapbox secret values in
`capacitor.config.ts`. Browser-visible values remain governed by Next.js’s
`NEXT_PUBLIC_*` convention. The deployed server owns all private credentials.

## Daily development

1. Run the normal web app: `npm run dev`.
2. For browser work, use `http://localhost:3000` as usual.
3. For a device, run the dev server on the LAN and sync with the LAN URL shown
   above. Both device and computer must be on the same network.
4. Open the native IDE:

   ```bash
   npm run mobile:ios
   npm run mobile:android
   ```

`mobile:ios` and `mobile:android` deliberately run `mobile:prepare` first, so
the Next production build and Capacitor sync happen before the IDE opens.

## Production workflow

```bash
npm run mobile:assets   # only after the source logo changes
npm run mobile:prepare  # next build + Capacitor sync
npm run mobile:ios:build
npm run mobile:android:build
```

`mobile:assets` generates iOS and Android icons/splash artwork from
`resources/logo.png`, which points to the existing Calistheni icon. It replaces
the starter Capacitor graphics. Commit generated native assets with the native
projects.

### iOS

Open `ios/App/App.xcodeproj` in Xcode. Select the **App** target, choose the
Apple Team, and configure a unique signing bundle identifier if the final store
identifier differs from `app.calistheni.mobile`. Set the release version/build
number, select an iOS device or archive destination, then Archive and upload.

Location use is declared in `Info.plist` for the existing Parks/Mapbox flow.
Validate OAuth callback URLs and Auth.js cookie/session behavior on a physical
device using the production HTTPS domain before release.

### Android

Open `android/` in Android Studio and let Gradle use JDK 21 and install the
requested SDK components. Configure a release keystore, versionCode, and
versionName before generating a signed App Bundle. `mobile:android:build`
produces a debug APK after this local toolchain is installed.

The manifest includes internet and coarse/fine location permissions required by
the existing browser-based Mapbox location experience. Complete Google Play’s
Data safety declaration before distribution.

## Native presentation

- `viewport-fit=cover`, dynamic viewport sizing, and safe-area-aware existing
  navigation prevent content under notches and the home indicator.
- The Status Bar plugin is non-overlaying and is synchronized with the app’s
  light/dark theme; Android 15+ may enforce edge-to-edge behavior, so test
  physical devices.
- The generated Calistheni splash uses the dark Calistheni background and is
  auto-hidden after 1.2 seconds by the native plugin. This is intentionally a
  bounded fallback: the deployed Next.js shell can be unavailable before React
  mounts. `NativeShell` also requests an earlier hide after hydration and logs
  the request in development.
- Failed remote WebView navigation opens the bundled, branded `error.html`
  screen with a retry action instead of leaving a permanent launch screen.
- Keyboard resize is native on iOS and uses Android’s full-screen workaround.
  A native-only focus handler scrolls inputs into view without changing web
  behavior.

## Native Google authentication handoff

Web browsers continue to use the normal Auth.js Google OAuth flow. Do not alter
the Auth.js PKCE or state checks for native clients: a Capacitor WKWebView and
Safari have separate temporary cookie jars, so beginning PKCE in the WebView
and completing it in Safari produces Auth.js `InvalidCheck` failures.

On iOS and Android, the login button creates a short-lived native attempt,
opens the browser through the official Capacitor Browser plugin, and begins the
same Auth.js Google flow **in that browser**. Safari/Chrome therefore owns the
PKCE verifier and state cookies for the entire provider round trip. On success,
the server sends a verified Universal/App Link containing only a random,
single-use handoff code. The native shell receives it through the official App
plugin, exchanges it once over HTTPS, and receives the normal HttpOnly,
Secure Auth.js database-session cookie for `calistheni.app`.

Raw PKCE verifiers, Google tokens, Auth.js session tokens, nonces, and raw
handoff codes are never persisted or logged. `NativeAuthAttempt` stores only
SHA-256 hashes, expires after ten minutes, and is marked consumed atomically
before the session row is created. Expired attempts are pruned whenever a new
attempt starts.

Set these deployment environment variables before enabling app links:

```bash
APPLE_TEAM_ID=
IOS_BUNDLE_ID=app.calistheni.mobile
ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=
ANDROID_APPLICATION_ID=app.calistheni.mobile
```

The server serves, without redirect:

- `https://calistheni.app/.well-known/apple-app-site-association`
- `https://calistheni.app/.well-known/assetlinks.json`

### Required Apple configuration

1. Enable **Associated Domains** for the final App ID in Apple Developer.
2. In Xcode select the final team and retain the committed entitlement
   `applinks:calistheni.app` on the App target.
3. Set `APPLE_TEAM_ID` in production and verify AASA returns JSON with an
   `appID` of `<TEAM_ID>.app.calistheni.mobile`, without redirect.
4. Keep Google OAuth Console’s normal callback URL:
   `https://calistheni.app/api/auth/callback/google`. Do not add a custom
   scheme callback or disable PKCE/state.
5. Test a freshly installed release build on a physical device. Universal Link
   association cannot be fully verified in Simulator.

### Required Android configuration

1. Keep the committed verified App Link intent filter for
   `https://calistheni.app/mobile/auth/complete`.
2. Set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` to the debug and final Play
   signing fingerprints, then verify `assetlinks.json` returns them with no
   redirect.
3. Test emulator/debug and Play/Internal Testing builds; their fingerprints
   normally differ.

### Native auth troubleshooting

- **`InvalidCheck: pkceCodeVerifier`** means OAuth was started in the WebView
  but returned in Safari. Confirm native login opens
  `/api/native-auth/browser-start`, not `/api/auth/signin/google` directly.
- **App stays in browser after Google:** verify the signed entitlement,
  AASA/assetlinks files, HTTPS, bundle/package ID, and signing fingerprint.
- **“Sign-in link is invalid or expired”:** links expire after ten minutes and
  are single-use. Start login again.

## Authentication and API notes

The native shell is a first-party WebView at the deployed HTTPS Calistheni
origin, so API calls, Auth.js cookies, R2 upload URLs, Mapbox, and Stripe server
routes use the same origin and credentials as the web app. Authentication uses
the secure native handoff above. Test login, logout, session restoration,
expiry, provider cancellation, warm/cold Universal Links, and account switching
on each physical platform before release.

No offline storage, native billing, push notifications, camera, share, haptics,
or health integrations are included in this phase.

## Troubleshooting

- **Native app opens a blank page:** verify `CAPACITOR_SERVER_URL` is HTTPS and
  reachable from the device. A failed initial navigation now shows the branded
  retry screen; after correcting the deployment/network, choose **Try again**.
- **Live reload does not connect:** use the machine’s LAN IP, not `localhost`;
  allow the port through the local firewall.
- **iOS build fails:** open Xcode once and resolve the Swift Package dependencies
  under `ios/App/CapApp-SPM`.
- **Android build fails:** set Android Studio’s Gradle JDK to 21 and install the
  Android SDK platform/build tools requested by Gradle.
- **Native changes do not appear:** run `npm run mobile:sync`; do not edit
  generated `capacitor.config.json` files directly.

## Before store testing

Before TestFlight or Google Play Internal Testing, use a stable production or
staging HTTPS URL, complete signing, test authentication and payment web flows
on real devices, set app-store privacy disclosures, and perform device QA for
safe areas, keyboard, Maps location permissions, and deep links. A future phase
should decide whether the remote-server delivery model meets each store’s review
requirements or whether a native-compatible bundled frontend/API architecture is
needed.
