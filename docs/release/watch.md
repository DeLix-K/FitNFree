# Apple Watch app (streak, this week, log today's workout)

Built on branch `feature/watch` (from `feature/widget`, so it also contains the widget), 2026-10-30. **The Swift has never been compiled or run, and nothing has been tried on a watch**: this machine is Windows with no Xcode, Swift compiler or watch simulator. The first real compile happens on an EAS iOS build, together with the widget.

## What it does
Open **FitNFree** on the watch:
* **🔥 the current streak**, "x/y this week", and the seven days of this week (Sunday to Saturday) as dots, filled for days you trained. Same numbers as the home-screen widget.
* **Log today's workout** button. It asks "Log today's workout?" first (an accidental wrist tap should not log anything), then shows **"Sent to iPhone. It counts once your iPhone has saved it."** until the phone confirms, then **"Done today"**.
* If the iPhone app has not been opened since installing, or you signed out: **"Open FitNFree on your iPhone to see your streak."** (no button).
* "Updated x ago" appears when the numbers are more than 5 minutes old, so a stale number never looks live.

It works out for itself when things stop being true (the streak running out, the end of the week, midnight), re-checking each minute, exactly like the widget.

## How it works
* **Phone to watch.** Each time the iPhone app refreshes the widget (app opened, back to the foreground, a workout logged) it also hands the watch the same small snapshot, as one piece of text, over Apple's **WatchConnectivity** ("application context": the watch keeps only the newest). Signing out sends an empty one, so the watch goes back to "open the app". Pure rules and the message format: `lib/watchSync.ts`.
* **Watch to phone.** The button queues one request, `log-workout` for today's local date (`transferUserInfo`). iOS holds it until the iPhone app runs, then the app logs that day (`logWorkoutOn` in `lib/streaks.ts`, the same call the Streaks screen uses, safe to repeat) and refreshes both the widget and the watch. `lib/watchRequests.ts` keeps the day in on-device storage until it is saved, so a bad connection does not lose a tap.
* **Checks on the phone before anything is logged:** only a well-formed `log-workout` is accepted; a day in the future (phone and watch disagreeing about the time zone) is logged as today; a day more than 2 days old is dropped; the same day twice is once; only a signed-in phone acts, and signing out clears anything waiting.
* **The phone-side link** is the library `react-native-watch-connectivity` 2.0.0, loaded inside try/catch (`lib/watchBridge.ios.ts`): an older app build without it receives this JavaScript safely and the calls do nothing. Web and Android use a do-nothing stub (`lib/watchBridge.ts`) and the library is excluded from Android autolinking.
* **The watch app** (`targets/watch/`, Swift, SwiftUI and WatchConnectivity) only displays the snapshot and sends the one request. It mirrors `snapshotAt` from `lib/widgetSnapshot.ts` (a note in both says to change them together; the Swift copy is not covered by a test).

## Privacy
* **Sent to the watch:** a streak number, which days this week you trained, the weekly target, whether you trained today. **Not sent:** names, health data, workout details, sleep, weight, the body log, tokens or any sign-in. Phone and watch talk directly on your own devices; **nothing goes to a server**, and the watch cannot reach the internet code-wise (no network calls in it).
* **No HealthKit, no workout sessions, no background modes, no complications, no notifications.** (Lesson from the earlier background-audio rejection.) No App Group is used on the watch.
* **No change to App Privacy or the privacy policy:** nothing new is collected. A sentence in the policy is optional.
* A glance at your wrist shows a streak number; as with any watch app, anyone who can see an unlocked watch can see it.

## What this changes (impact, in plain words)
* **One new dependency, `react-native-watch-connectivity` 2.0.0** (a native iOS module for the phone-watch link). It needs a **new iOS build**; it cannot go out as an over-the-air update. `npm audit` is unchanged at 32 findings (no new ones).
* **A new target, the watch app, with its own identifier `com.teamk.fitnfree.watchkitapp`** and provisioning profile. Together with the widget's identifier and App Group, **expect the same one interactive Apple sign-in** on the first iOS build (EAS must register the new identifiers and regenerate the app's profile). Run it in your own terminal: `npx eas-cli build --profile preview --platform ios` and answer the prompts. Later builds are non-interactive.
* **Watch icon:** generated from `assets/icon.png`. If the icon has transparency, App Store processing may reject the watch icon; replace it with an opaque 1024 x 1024 image.
* **watchOS 10 or later** (Series 4 and newer with a current iPhone). Older watches simply do not get the app; the iPhone app is unaffected.
* **App Review:** the watch app needs screenshots in the App Store Connect listing (an Apple Watch size) when you submit a build that contains it. App Review notes should mention that the watch app needs a signed-in iPhone.
* **Release ordering:** like the widget, this waits for 1.0.1 approval and a native build. It is **not merged into `release/1.0.1`**.

## Before this ships
1. Do the interactive iOS build and read the log. **Expect fixing**: it is the first time the Swift (widget and watch) is compiled, and the first time `@bacons/apple-targets` generates a watch target for this project. Likely trouble spots: the watch Info.plist keys, the watch icon, build numbers matching, embedding the watch app in the iPhone app.
2. On a real iPhone and paired Apple Watch with that build: open the iPhone app signed in, then the watch app, and see it fill (the first sync can take a little while); log a workout on the iPhone and see the watch change; tap "Log today's workout" on the watch and see "Sent", then see it appear in the iPhone app's Streaks screen and the watch say "Done today"; do it with the iPhone app closed (swiped away) and in airplane mode, and say honestly whether it lands when the app is next opened; sign out of the iPhone app and see the watch reset; try a 40 mm and a 45/49 mm watch, always-on dimming, and Dynamic Type.
3. Check the timing: note when you last trained, then look at the watch the next day (streak still there) and the day after (streak gone) without opening the iPhone app.
4. Add Apple Watch screenshots to the App Store listing.

## What was tested, and what was not
| Tested | How |
|---|---|
| The phone/watch message: the snapshot travels as one text, an empty text means signed out, and the context holds only plain values the link accepts | `node scripts/test-watch-sync.mjs` (12 checks), run in five time zones including a half-hour one |
| What the phone accepts from the watch: only a well-formed `log-workout`; extra fields dropped; junk, wrong version, wrong type and impossible dates refused | same |
| Which day gets logged: today, yesterday and the day before; a future day becomes today; older is dropped; a tap before midnight that arrives after still counts for its day; month, year and leap-day edges | same |
| The waiting list: real recent days only, once each, oldest first, capped; stale days are dropped instead of logged late | same |
| The Swift uses the same key names and rules; the watch has no network, no HealthKit and no background session; no App Group on the watch; no background modes added to the iPhone app | same (text checks only) |
| The resolved iOS configuration: the EAS targets are the widget (`com.teamk.fitnfree.widget`, with the App Group) and the watch (`com.teamk.fitnfree.watchkitapp`, no entitlements) | `expo config --type introspect` |
| Type check; web, iOS and Android bundles build; the library is in the iOS bundle only; the library is left out of Android autolinking and included in iOS | `tsc --noEmit`, `expo export`, `expo-modules-autolinking` |
| The other 11 script test suites still pass | run together |

| **Not** tested | Why it matters |
|---|---|
| **The Swift has never been compiled.** It follows the SwiftUI, WatchKit and WatchConnectivity APIs from memory and the plugin's template, but nothing has checked it. | A compile error fails the first iOS build; each attempt uses a build credit. |
| **The Xcode project.** Expo skips generating the iOS project on Windows, so the watch target (Info.plist keys, icon, embedding, signing) was never generated here; only the configuration the build will use was checked. | The macOS build machine does it; problems would show in its log. |
| **The phone-watch link in practice**: how fast the snapshot arrives, whether a watch tap reaches the phone when the iPhone app is closed, and whether the library works on this React Native version (it declares 0.84; this app is on 0.86). | The "Log today's workout" button may only land when the iPhone app is next opened. Fall-back: the Streaks screen on the phone always works. |
| **How it looks** on real watch sizes, dark mode, always-on, Dynamic Type, accessibility (VoiceOver). | None of it can run on this machine. |
| **Apple's rules on delivery.** iOS decides when queued transfers are delivered and may delay them. | "Sent to iPhone" can stay on screen for a while. |

## Known limits
* The watch shows what the phone last sent; open the iPhone app to refresh. No background refresh was added (no background modes).
* The watch can only log **today**. It cannot undo a log (use the iPhone app) or log duration.
* If the phone and watch disagree about the date, a future day is logged as today; a request more than 2 days old is ignored without a message on the watch.
* If someone signs out and a different person signs in on the same phone within the minutes a watch request is waiting, signing out clears the waiting list, so the request is dropped rather than applied to the wrong person.
* No complications (watch-face widgets), no workout sessions, no heart rate, no rest timer: deliberately not built.
* iPhone-only pairing; there is no Wear OS app.
