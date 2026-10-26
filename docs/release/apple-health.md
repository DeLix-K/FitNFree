# Apple Health sync (read-only, iPhone): what was built, what it needs, how to ship it

Built 2026-10-26 on branch `feature/apple-health` (from `release/1.0.1`). **Not run on a real iPhone, not built with EAS, not pushed.**
Everything here was checked on what can be checked without a phone: the logic, the database change, the screen in a browser with sample data,
the generated iOS configuration, and that the iPhone, Android and web bundles all build.

## What it does
On an iPhone, the Wearables screen gets an **Apple Health** card (Android and the web are unchanged and still say "Coming soon"):
* **Connect Apple Health** opens Apple's own permission sheet. The app asks to **read** steps, active energy, walking and running distance, resting heart rate,
  body weight, sleep and workouts. It asks to **write nothing**, and the app's permission text says so.
* Once connected it shows today's steps, active kcal, distance, resting heart rate, weight and last night's sleep; a 7-day step chart with the average;
  the last 5 workouts. These readings stay **on the phone**.
* **Add my sleep to my sleep log** (a switch, **off by default**): copies the last 2 weeks of sleep nights into the person's own FitNFree sleep log, marked "Apple Health",
  and refreshes them when the screen opens. It never overwrites a night logged by hand or from Oura. **Remove imported sleep** deletes only the nights that came from Health.
* **Disconnect** stops reading and clears the app's own switches. Apple does not let an app revoke its own permission, so the card tells the person how to do it in
  iPhone Settings, and has a link to Settings.
* Honest about gaps: Apple does not tell an app which read permissions were refused, so "nothing came through" is explained rather than guessed at. Sleep stages (deep, REM,
  light) are shown only when Health actually recorded stages. Nothing is made up.

## How it is built (files)
| File | Purpose |
|---|---|
| `lib/healthSummary.ts` | The rules: sleep samples to nights (merging two sources, naps left out), daily steps, workouts, what to write to the sleep log. Tested |
| `lib/appleHealth.ios.ts` | The only code that talks to HealthKit (`@kingstinct/react-native-healthkit` 16.2.0 with `react-native-nitro-modules`). iPhone only |
| `lib/appleHealth.ts` | A stand-in for web and Android, so those builds never load the iPhone library |
| `lib/healthSleepSync.ts` | The two on-device switches and the opt-in sleep copy / delete |
| `components/AppleHealthCard.tsx` | The card |
| `supabase/sleep_source_apple_health.sql` | Lets a sleep night be marked `apple_health` |
| `app.json` | The HealthKit plugin: the read permission text, no write permission, no background delivery |

Generated iOS configuration (checked): entitlement `com.apple.developer.healthkit`; `NSHealthShareUsageDescription` set; **no** `NSHealthUpdateUsageDescription`;
no background modes; the motion and location keys that Apple's upload check requires are still present.

## Before it can ship
1. **A new native build is required** (HealthKit and the Nitro module are native). This cannot be sent as an over-the-air update.
2. **The HealthKit capability on the App ID.** In the Apple Developer account the App ID `com.teamk.fitnfree` needs HealthKit enabled. EAS normally does this during the build, but it may need
   one interactive Apple sign-in, as with the first iOS build. Run the build in your own terminal if EAS asks.
3. **Run `supabase/sleep_source_apple_health.sql`** in the SQL Editor before the app update goes out (safe to run twice), or turning on the sleep import will fail with a database error.
4. **Privacy paperwork (Apple reviews HealthKit apps more closely):**
   * App Store Connect > App Privacy: add **Health** and **Fitness** data. Because sleep nights can be copied to your servers, declare **Sleep/Health** as *collected*, *linked to the user*, purpose
     *App Functionality*, *not used for tracking*. Steps, workouts, heart rate and weight are read on the device and not collected.
   * Privacy policy: suggested wording (review before publishing):
     > **Apple Health (iPhone).** If you choose to connect Apple Health, FitNFree reads the data you allow (steps, workouts, active energy, distance, resting heart rate, body weight and sleep) so it can show
     > it to you. We never write to Apple Health. Steps, workouts, heart rate and weight stay on your phone. If you switch on "Add my sleep to my sleep log", your sleep nights (when you slept, for how long and, where
     > Health recorded them, the sleep stages) are copied to your FitNFree account so they appear in your sleep log; you can switch this off and remove those nights at any time. We do not use Health data for advertising,
     > do not sell it, and do not share it with other companies. You can withdraw access in iPhone Settings > Health > Data Access & Devices.
   * The AI Coach does **not** receive Health data in this version. If you later want it to, that needs its own explicit consent and a policy update first (Apple 5.1.3).
5. **App Review notes:** HealthKit needs a real iPhone, and a reviewer's Health app may be empty. Say that the feature is optional, the app works fully without it, and explain how to add sample data in
   Health (the Health app can add steps and sleep manually) so they can see it work.
6. **Test on a real iPhone (TestFlight):** connect, see steps and sleep, switch the import on and look at the sleep log, remove the imported sleep, disconnect, and try with all permissions refused.
   Also try an iPhone with an Apple Watch if you have one, since two sources reporting the same night is exactly what the sleep merge is for.

## Which release?
Recommend **1.0.2**, not 1.0.1. 1.0.1 already adds several native pieces (updates, crash reporting, keep-awake). HealthKit gets extra review scrutiny, and putting it in 1.0.1 risks delaying everything else.
This branch is built on `release/1.0.1`, so merge it after 1.0.1 is approved (it will merge cleanly; the only shared file is `app.json`, `package.json` and the lock file).

## What was tested
* `lib/healthSummary.ts`: 14 checks (a staged night, two overlapping sources, no stages, in-bed-only, naps, split nights, several nights, junk input, daily totals, averages, workouts, what gets written to the sleep log).
* The database change in a real in-process Postgres: 7 checks (new source accepted, junk refused, runs twice, one constraint left, privacy between people, deletion of imported nights, refresh by date).
* The card in a real browser with sample Health data: not connected, connected with data, the sleep switch failing safely when not signed in, disconnect, nothing-in-Health, no Health on the device.
* TypeScript passes. iPhone, Android and web bundles build. The generated iOS configuration contains exactly the HealthKit entitlement and the read text.

**Not tested:** anything on a phone. The real HealthKit calls (units, the permission sheet, the shape of workout and sleep results) are written from the library's type definitions and have never run.
The first real-device run is where a mismatch would show up, most likely in the units passed to the step, energy, distance and heart-rate queries. Sleep import against the real database (needs the SQL run).
Android's Health Connect is a separate piece of work and is not started.

## Not included, on purpose
* Writing anything to Health. * Background delivery. * Using Health data in the AI Coach or in habits (the habit "auto-log from steps" still uses Oura only). * Heart-rate history, HRV, or any
  type beyond the seven listed. Each of these adds review and privacy work and can be a later step.
