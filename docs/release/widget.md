# iPhone home-screen widget (streak)

Built on branch `feature/widget` (from `release/1.0.1`), 2026-10-29. **The Swift has never been compiled or run**: this machine is Windows with no Xcode and no Swift compiler. The first real compile happens on an EAS iOS build. **The Apple Watch app is not built** (see the end).

## What it does
Long-press the home screen, add **FitNFree**, and choose a size:
* **Small:** 🔥 the current streak, "x/y this week" with a progress bar, and "Done today ✓" or "Not yet today".
* **Medium:** the streak, and the seven days of this week (Sunday to Saturday) as dots, filled for days you trained, with the week's count and progress bar.
* If the app has not been opened since installing (or you are signed out) it says "Open the app to see your streak."

It shows only what the app last saved, so it **updates when you open FitNFree** (and when you log a workout from the Streaks screen), not live. To stay honest in between, the widget works out for itself when things stop being true, with no help from the app:
* the **streak runs out** at midnight starting the second day after your last workout (the same rule the app uses: it counts while your last day was today or yesterday),
* **trained today** resets at midnight,
* **the week's dots reset** at the end of Saturday.

## How it works
* The app (`lib/widgetRefresh.ts`) reads your streak, this week's workouts and weekly target when it opens, comes to the foreground, or after you log a workout, and writes one small piece of text (`lib/widgetSnapshot.ts`) into an **App Group** (`group.com.teamk.fitnfree`), which both the app and the widget can read. It then asks iPhone to refresh the widget.
* The widget (`targets/widget/`, Swift, SwiftUI and WidgetKit) only **reads** that text. It has **no network code and no sign-in**.
* The pure rules (what to show at a given moment, when it changes) are in `lib/widgetSnapshot.ts` and are tested. The Swift mirrors them (`shown(_:at:)` and `changeMoments(_:after:)` in `FitNFreeWidget.swift`); a note in both files says to change them together. The Swift copy is **not** covered by a test.

## Privacy
* **Shared with the widget:** a streak number, which days this week you trained, the weekly target, and whether you trained today. **Not shared:** names, health data, workout details, sleep, weight, anything from the body log. Nothing leaves the phone: the App Group is on-device storage.
* **Home screen only.** The widget does not offer lock-screen sizes, so it is not visible on a locked phone. (Anyone holding your unlocked phone can see a streak number on the home screen, as with any widget.)
* **Signing out erases it** (the widget goes back to "Open the app").
* **No change to App Privacy or the privacy policy:** nothing new is collected or sent. A sentence in the policy is optional.

## What this changes (impact, in plain words)
* **One new dependency, `@bacons/apple-targets` 5.0.0** (a build-time tool that adds the widget to the iOS project, plus a tiny native helper the app uses to write to the App Group). It needs a **new iOS build**; it cannot go out as an over-the-air update. The app does not break if the widget is missing: on a build without the helper the write calls simply do nothing (an older binary can safely receive this JS).
* **A new capability: App Groups**, on the app and on a **new second identifier for the widget (`com.teamk.fitnfree.widget`)**, each with its own provisioning profile. The widget identifier and the group are declared in `app.json`/`targets/widget`, and EAS is told about the extension. **Expect one more interactive Apple sign-in** on the first iOS build (like the first-ever build needed), because EAS has to register the group and the new identifier and regenerate the app's profile. The existing profile does not have the App Groups capability yet. Run it in your own terminal: `npx eas-cli build --profile preview --platform ios` and answer the prompts (reuse the distribution certificate, select your test devices). Later builds then work non-interactively.
* **Widget needs iOS 17.** Phones on older iOS simply do not offer the widget; the app is unaffected.
* **`ios.appleTeamId`** (`UKF5U499ZD`, the team already used for this app's builds) was added to `app.json`.
* `npm audit` shows 4 more findings (3 moderate, 1 high) than before, all inside the build-time tool's dependencies (they run on the build machine, not in the app). The existing critical finding (`shell-quote`) was already there.

## Before this ships
1. Do the interactive iOS build above and read the first build's log. **Expect some fixing**: it is the first time this Swift is compiled.
2. On a real iPhone (iOS 17 or later) with that build: add the small and medium widgets; open the app signed in and see them fill; log a workout from Progress > Streaks and see the widget change; sign out and see it reset; try dark and light mode; try Dynamic Type and a small phone.
3. Check the timeline honestly: note the time you last trained, then look at the widget the next day (streak still there), and the day after (streak gone) without opening the app.
4. Add a widget screenshot to the App Store listing if you want (optional).

## What was tested, and what was not
| Tested | How |
|---|---|
| The rules: the week starts on Sunday like the Streaks screen; trained days line up; the streak is valid until midnight starting the second day after the last active day (freeze-covered days count); no streak means nothing to expire; junk and future dates ignored; numbers kept sane; the week resets at the end of Saturday; "trained today" resets at midnight; a missing, damaged or other-version snapshot gives the "open the app" state; it survives being written as text; the list of moments the picture changes; walking through those moments gives the same answer as asking at any time between them; the group name and key | `node scripts/test-widget-snapshot.mjs` (16 checks), run in five time zones including a half-hour one |
| The resolved iOS configuration: the app has the App Group entitlement, and EAS is told about the widget extension `com.teamk.fitnfree.widget` with the same group | `expo config --type introspect` |
| Type check; web, iOS and Android bundles build; the helper that talks to the widget is in the iOS bundle only | `tsc --noEmit`, `expo export` |
| Swift: braces, brackets and parentheses balance | a count only |

| **Not** tested | Why it matters |
|---|---|
| **The Swift has never been compiled.** It follows the WidgetKit and SwiftUI APIs and the structure of the plugin's own widget template, but nothing has checked it. | A compile error will fail the first iOS build. Each attempt uses a build credit. |
| **The Xcode project.** Expo skips generating the iOS project on Windows, so the widget target was never actually generated here; only the configuration the build will use was checked. | The build machine (macOS) does it; problems would show in its log. |
| **How it looks** (sizes, colours, long numbers, dark mode, accessibility, Dynamic Type), **how it behaves** (refresh timing, the timeline), and **the App Group on a real device** | None of it can run on this machine. |
| **Apple's rules on refresh.** iOS decides how often a widget really updates and may be slower than the timeline asks. | The streak-expiry and week-reset moments might show a little late. |

## Known limits
* Updates when the app is opened, not in the background (no background refresh was added, to avoid background modes after the earlier background-audio rejection).
* Streak and week only. No "today's workout" widget, no interactive buttons, no lock-screen or Live Activity.
* The streak runs out by the "last active day" rule; if you have freezes the server may keep a streak a little differently than this approximation, and the app corrects it the next time it is opened.
* iPhone only for now. There is no Android widget.

## Apple Watch
Now built on `feature/watch` (from this branch): see `docs/release/watch.md`. The notes below are why it was held back at first.

A watch app is a separate native target with its own identifier, provisioning and signing, and it needs a way to get data from the phone (WatchConnectivity) or its own sign-in on the watch. That is several times the native code of this widget, none of which could be run here, so it should wait until this widget has built and worked on a real phone. When you want it, the sensible first version is a small watch app that shows the same streak and week from a phone-to-watch message, with no sign-in on the watch.
