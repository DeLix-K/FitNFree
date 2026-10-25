# Over-the-air updates (EAS Update): how FitNFree uses them

Set up on branch `release/1.0.1` on 2026-10-25 from the Expo SDK 57 docs
(https://docs.expo.dev/versions/v57.0.0/sdk/updates/ and https://docs.expo.dev/eas-update/getting-started/).

## What is configured
* `expo-updates` ~57.0.26 is installed.
* `app.json`: `updates.url` = `https://u.expo.dev/f3710caa-723a-45cc-be8d-dbd29127a81a` (the FitNFree EAS project) and
  `runtimeVersion: { "policy": "appVersion" }`.
* `eas.json`: build profiles carry a `channel` (`development`, `preview`, `production`).
* Defaults kept: the app checks for an update when it launches, downloads it in the background, and applies it the **next** time
  it is opened (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`). No extra app code was added.

## Important facts
* **Builds up to and including 1.0 (build 17) cannot receive updates.** Only builds made from this branch onward can.
* An update only reaches builds whose **runtime version and channel match**. With the `appVersion` policy the runtime version is
  the `version` in `app.json` (now `1.0.1`). A 1.0.1 build receives updates published for 1.0.1.
* **Rule: any native change needs a new `version` and a new build with App Review.** That means adding or changing a native package
  or Expo config plugin, changing permissions or `infoPlist`, or upgrading the SDK. Bump `version` (for example 1.0.2) for those,
  so old builds never receive JavaScript that expects native code they do not have.
* **Updates may contain**: JavaScript and TypeScript code, text, styles, and bundled images or fonts.
* Apple's rule: an update must not change the app's main purpose or add features that would need a fresh review.
  Bug fixes, copy changes and small UI fixes are fine. A new payment method or new data collection is not. When unsure, ship a build.
* The App Privacy answers and the privacy policy must match what the app does after an update too.
* `expo-updates` does nothing in Expo Go, development builds, or on the web, so test with a release or preview build.

## Publishing an update (after a 1.0.1 build is installed)
Always try it on the preview channel first.

```
npx eas-cli update --channel preview --message "Describe the change" --environment preview
npx eas-cli update --channel production --message "Describe the change" --environment production
```

The `--environment` flag is required in SDK 55 and later; it supplies the `EXPO_PUBLIC_*` values from EAS (the build log should say
the environment variables were loaded; an update published without them can freeze the app on the splash screen, as happened in
September). To see what is published: `npx eas-cli update:list`.

## Rolling back
```
npx eas-cli update:rollback
```
It asks whether to roll back to a previously published update or to the update embedded in the installed build. Publishing a new
update afterwards sends the new one to everyone. Roll back first if an update is broken, then fix and publish again.

## Checking it works (do before submitting 1.0.1)
1. Build a `preview` build from this branch and install it.
2. Publish a harmless visible change to the `preview` channel.
3. Close and reopen the app (up to two times). The change should appear.
4. Publish a second update, then run `update:rollback` and confirm the app returns to the earlier state.
5. Only then build the `production` profile for TestFlight and the App Store.

## What is not done yet
* No build has been made with `expo-updates` and no update has been published, so nothing here has run on a device.
* Whether `appVersion` or the `fingerprint` policy is better long term is a judgement: `appVersion` is the simplest and relies on the
  rule above; `fingerprint` catches native changes automatically but can disagree between your computer and EAS Build.
