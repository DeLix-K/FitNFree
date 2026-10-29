# Android Health Connect (read-only)

Built on branch `feature/health-connect`, 2026-10-29. It is built **on top of `feature/apple-health`** (same card, same sleep import, same rules), which has not been merged into `release/1.0.1` yet, so this branch carries those commits too. **Nothing here has run on a real Android phone**, and nothing has been built with EAS. Read "What you have to do" before shipping: Google has to approve this before it can work for real users.

## What it does
On Android, Profile > Connected Devices shows a **Health Connect** card, the same card Apple Health uses on iPhone:
* **Connect Health Connect** opens Android's own permission screen. FitNFree asks to **read** seven things and nothing else: steps, active energy, distance, resting heart rate, body weight, sleep, and workouts (exercise sessions). It **never writes** anything to Health Connect, and has no background access.
* Once connected it shows steps today, active kcal, distance, resting heart rate, weight and last night's sleep, a 7-day steps chart (with the average), and recent workouts.
* **Optional sleep import** (off by default): copies the last 2 weeks of nights into the FitNFree sleep log (`source = 'health_connect'`, shown as "Health Connect" in the sleep list). It never replaces a night you logged yourself, got from Oura, or got from Apple Health. "Remove imported sleep" deletes only the Health Connect nights.
* **Disconnect** stops FitNFree reading; "Change what FitNFree can read" opens Health Connect's own settings.
* Everything except the sleep import stays on the phone. Nothing is used for advertising or sent to AI. The AI Coach does **not** get Health data.

Differences from Apple Health, by design:
* Health Connect **tells the app which permissions were allowed**, so if the person allows nothing the card says so instead of showing "Connected" with no data.
* Steps and energy totals come from **Health Connect's own totals**, which count the same steps recorded by two apps only once.
* Disconnect is handled by FitNFree (stop reading) plus Health Connect's own settings screen. The library's "revoke all" call only takes effect after the app restarts, so it is deliberately not used.
* **Health Connect only shares the last 30 days from when the person first allowed access.** Our reads (7 days of steps, 14 days of sleep and workouts) fit inside that; the card explains it if nothing comes through.

## What this changes in the app (impact, in plain words)
* **One new native library, `react-native-health-connect` 4.1.3** (MIT, actively released, React 19 and the new architecture supported, with its own Expo plugin), plus `expo-build-properties`. These are native code, so this needs a **new Android build**; it cannot go out as an over-the-air update. iPhone and web builds do not include it (checked: the iOS and web bundles contain none of it).
* **Android minimum version rises from 7.0 (API 24) to 8.0 (API 26)**, because Health Connect requires it. Phones on Android 7.x could no longer install the app.
* **Seven new Android permissions in the app manifest**, all `android.permission.health.READ_*` (no WRITE): STEPS, ACTIVE_CALORIES_BURNED, DISTANCE, RESTING_HEART_RATE, WEIGHT, SLEEP, EXERCISE. These are what Google reviews. A test checks `app.json` lists exactly these seven and the code reads exactly these types.
* The plugin also adds the "why does this app want this data" screen entries Health Connect requires (a privacy-policy hook on the main activity, and an activity alias for Android 14 and later). Checked in a generated Android project: both are present.
* Database: `supabase/sleep_source_apple_health.sql` now allows `'health_connect'` as a sleep source next to `'manual'`, `'oura'` and `'apple_health'`. It is safe to run more than once and in any order, and it is the same file the Apple Health work already needed.

## What you have to do (these are the gates)
1. **Google Play Console.** There is **no Play Console app record yet** (the Android app has never been submitted). Create it first. Then, before a build with these permissions can be published, complete Google's **Health Connect permissions declaration** in the Play Console (this replaced the old separate Google Form on 3 September 2026, per the library's own notes; check Google's current page in the Console). For each permission you say what it is used for. Suggested one-line reasons: steps, distance and active energy: "show the user's daily activity next to their training"; heart rate and weight: "show the user's resting heart rate and weight"; sleep: "show last night's sleep and, if the user chooses, add it to their sleep log"; exercise: "list the user's recent workouts". The library's notes say approval can take up to 7 days and Health Connect access then needs extra time to switch on (they say 5 to 7 business days). I have not been able to check Google's current numbers, so treat these as the library author's estimate.
2. **Data safety form (Play Console)** and **privacy policy.** Health and fitness data (steps, heart rate, weight, sleep, workouts) read from Health Connect, not shared, used for app functionality. Suggested policy wording (review before publishing):
   > **Health Connect (Android).** If you choose to connect Health Connect, FitNFree reads your steps, active energy, distance, resting heart rate, body weight, sleep and workouts so we can show them next to your training. We only read this data and never change it in Health Connect. Most of it stays on your phone. If you switch on "Add my sleep to my sleep log", your sleep nights are saved to your FitNFree account. We do not use it for advertising, we do not sell it, and we do not send it to third-party AI services. You can stop at any time in the app or in Health Connect, and delete imported sleep from the app.
3. **Run `supabase/sleep_source_apple_health.sql`** in the Supabase SQL Editor before shipping the update that has the sleep import (same step Apple Health needed; the file now covers both).
4. **Decide the order with Apple Health.** This branch includes the Apple Health work. Both are native additions, so they would ship together in a new native build of both platforms (the notes already suggested 1.0.2 after 1.0.1 is approved).
5. **Test on a real Android phone** (an EAS development or preview build, not Expo Go): Health Connect installed (built in from Android 14) with some data in it (a watch or fitness app that saves to Health Connect, or enter test data in Health Connect itself). Check: connect and allow all; connect and deny all (message, still "Not connected"); allow only some types (those tiles show 0 or a dash and nothing crashes); steps total matches the Health Connect app; last night matches; workouts list; sleep import on then "Remove imported sleep"; Disconnect; "Change what FitNFree can read" opens Health Connect; a phone **without** Health Connect (older Android, unsupported) shows the "not set up" message.

## What was tested, and what was not
| Tested | How |
|---|---|
| How Health Connect is read, against a made-up Health Connect that returns records in the shapes the library documents: availability (not installed, needs update, fails to start); only READ requested, only the seven types; nothing allowed is reported; today's totals, latest heart rate and weight (pounds, grams, kilograms to kg); types not allowed are not even asked for; one failing read does not spoil the rest; steps by day (missing days zero, local-day buckets); sleep paging (reads every page, stops after 10); workouts (names, order, energy and distance, junk and tiny ones dropped, at most 10) | `node scripts/test-health-connect.mjs` (18 checks) |
| `app.json` matches the code: exactly the seven READ permissions, no WRITE, the plugin is present, minimum Android is 26 | same |
| Sleep conversion: a Health Connect session with stages gives the same night as the same night from Apple Health; sessions without stages are plain "asleep" with no invented stages; out-of-bed and unknown stages are not sleep; bad times ignored; naps left out; a night from the other health source is never overwritten | `node scripts/test-health-summary.mjs` (21 checks, 7 new for Health Connect) |
| The database rule: `health_connect` accepted, junk still refused, the migration can be re-run after nights from both sources exist, removing one source's nights leaves the other's | `node supabase/tests/sleep-apple-health.test.mjs` (8 checks, in-process Postgres) |
| The real card in a browser at phone width, driven by the real Health Connect reading code and a made-up Health Connect: connect, deny, allow, tiles, chart, workouts, settings link, disconnect, Android wording | temporary harness (not committed) |
| A generated Android project (`expo prebuild`, in a scratch copy): the seven permissions and no health write, the rationale entries, minimum Android 26, and the library registered with the app | inspected the generated files |
| Type check; web, iOS and Android bundles build; the iOS and web bundles contain none of the library | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| **Any real call to Health Connect.** The reading code follows the library's types and documentation, and the shapes of the made-up answers come from them, but it has never run against a real Health Connect. | Real records may differ in small ways (for example, how a bucket start time is written for day totals, or sleep sessions from a particular watch). Expect to adjust after the first real-phone test. |
| **An Android build.** No EAS build was run; the native side (Gradle, the Kotlin module, the manifest merge) was not compiled here. | A build failure would show up on the first `eas build`. Each attempt uses a build credit. |
| **Google's review and the Health Connect whitelist.** | Without them, real users cannot grant access in a production build. |
| Phones with an older Health Connect, and Android 13 and earlier without it installed | The code treats "not available" as a normal state and shows a message, but that path has only been tested with a made-up status. |
| Large amounts of data and slow phones | Day totals use Health Connect's own totals (not adding records), which keeps this cheap. |

## Known limits
* Read-only. No writing FitNFree workouts or weight to Health Connect (not planned).
* Workout energy and distance are fetched for the 10 most recent workouts only, so a few extra reads per refresh.
* Background syncing is not supported and not requested; data refreshes when the screen opens or on Refresh.
* The same sleep night appearing from both Health Connect and another source on one phone: the first one written wins and the other is skipped (never overwritten).
