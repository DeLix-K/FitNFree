# Crash reporting (Sentry): what was built and what you still need to do

Set up on branch `release/1.0.1` on 2026-10-26 from the Sentry and Expo docs
(https://docs.sentry.io/platforms/react-native/manual-setup/expo/ and https://docs.expo.dev/guides/using-sentry/).
It is **off until you give it a DSN**, so nothing is sent anywhere yet.

## What is in the code
* `@sentry/react-native` ~7.11.0 and its Expo config plugin (`app.json` plugins).
* `metro.config.js` uses Sentry's Metro config so release builds can attach source maps (readable stack traces).
* `lib/sentry.ts` starts reporting from `index.tsx` and wraps the root component. It only runs when **all** of these hold:
  `EXPO_PUBLIC_SENTRY_DSN` is set, it is a release build (not development), and the platform is not web.
* **Errors and native crashes only.** Performance traces, session replay, profiling, logs, screenshots and session tracking are all off.
* **Privacy scrubbing** (`lib/sentryScrub.ts`, tested by `node scripts/test-sentry-scrub.mjs`): no user identity or IP address is attached;
  request bodies, cookies and headers are removed; emails and sign-in tokens are blanked from messages; console output (which could
  contain AI-coach text or meal and health details) is dropped; web addresses lose their query strings.
* Each event is tagged with the over-the-air update that was running (`expo-update-id`, `expo-channel`, `expo-runtime-version`), so
  a bad update can be spotted and rolled back (see `ota-updates.md`).
* `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD=true` on every build profile. That keeps builds working before source-map upload is
  configured. **Remove it from the profiles (or set it to `false`) once the three Sentry values below exist,** or crash traces will be hard to read.

## What you need to do
1. Create a Sentry account and a **React Native** project called FitNFree. In *Settings > Security & Privacy* switch on **data scrubbing**
   and **prevent storing of IP addresses**.
2. Note the **organisation slug** and **project slug** (they are in the Sentry URL) and copy the **DSN** (public).
3. In EAS, add these (replace the values):
   * `EXPO_PUBLIC_SENTRY_DSN` = the DSN. Visibility **plaintext**, environments **preview** and **production**.
   * `SENTRY_ORG` and `SENTRY_PROJECT` = the two slugs.
   * `SENTRY_AUTH_TOKEN` = an **organisation auth token** from Sentry (*Settings > Developer Settings > Organization Tokens*). Visibility
     **secret**. Never put it in a file, a commit or a chat.
   * Command form: `npx eas-cli env:create --name EXPO_PUBLIC_SENTRY_DSN --value "<dsn>" --environment production --visibility plaintext`
     (repeat for `preview`). Use `--visibility secret` for the token.
4. Remove `SENTRY_DISABLE_AUTO_UPLOAD` from `eas.json` so source maps upload.
5. After an OTA update is published, upload its source maps too: `npx sentry-expo-upload-sourcemaps dist` (from the Sentry/Expo docs;
   check it works with your first update).

## How to check it works (before submitting)
1. Make a **preview** build with the extra env var `EXPO_PUBLIC_SENTRY_SELFTEST=1` (preview only; never set it for production).
2. Open the app once. A message named **"FitNFree Sentry self-test"** should appear in Sentry within a minute.
3. Open the event: the tags should show the update id and channel, there should be no user and no IP address, and the stack trace should be readable.
4. Remove the self-test variable and rebuild for production.

## App Store and privacy paperwork (must be done before submitting 1.0.1)
In App Store Connect > App Privacy, add:
* **Diagnostics > Crash Data**: collected; **not linked to the user**; **not used for tracking**; purpose **App Functionality** (diagnosing and fixing crashes).
Everything else about collection stays as it is. Because sessions, performance and replay are off, you should not need to add Performance Data.
If you later turn those on, update the labels first.

Draft paragraph for the privacy policy page (the one the app links to, in the `DeLix-K/apps` site; review before publishing):
> **Crash reports.** If the app crashes or hits an error, it may send a report to our error-reporting provider, Sentry. The report contains
> technical information such as the app version, your device model and operating system version, and where in the app's code the error
> happened. We configure it not to include your name, email address, IP address, or anything you typed or logged. We use it only to find
> and fix problems. It is not used for advertising or tracking.

## Limits and what is not verified
* Nothing has run on a device or reached Sentry. The iOS and Android bundles build, the web export is unaffected, `tsc` passes, and the
  scrubbing rules have 4 passing checks.
* Native crash reporting on a real build is untested. If a build fails during the Sentry native steps, set `SENTRY_DISABLE_AUTO_UPLOAD=true`
  first and read the EAS build log; do not remove the Sentry plugin without telling me.
* Error text can still contain content you did not expect. Review the first events in Sentry and tighten the scrubbing rules if needed.
