# What FitNFree is missing: research and recommendations

Researched 2026-10-26 from the web, Apple's public App Store listings (UK storefront), and a read of this app's code. Honest limits first:
the web sources are mostly vendor blogs, so they show what the industry says users want, not measured demand. The App Store comparison counts
keywords in each app's public description, so it shows what apps *advertise*, not everything they do. Google Play has no public listing API, so
Play Store pages were not read directly; the same apps exist on both stores and the descriptions are near-identical.

## What I checked
* **Web:** what users and developers say fitness and trainer apps need ([Solute Labs](https://www.solutelabs.com/blog/fitness-app-ideas), [Exercise.com](https://exercise.com/grow/what-are-people-looking-for-in-fitness-apps), [JEFIT](https://www.jefit.com/blog/best-gym-workout-tracker-apps-of-2026-top-5-reviewed-and-compared-for-every-fitness-goal), [Ideausher](https://ideausher.com/blog/top-30-features-to-have-in-a-fitness-app/), [SensAI](https://www.sensai.fit/blog/ai-wearables-fitness-apps-2026), [Trainwell](https://www.trainwell.net/blog/best-fitness-apps-in-2026-top-picks-for-every-goal-and-budget)) and what trainer-management apps offer ([My PT Hub](https://www.mypthub.net/features/automated-client-check-ins/), [FitSW](https://apps.apple.com/us/app/fitsw-for-personal-trainers/id1184011053)).
* **App Store (UK):** the public descriptions of Hevy, Strong, Fitbod, TrueCoach, Everfit, Seconds (interval timer), Tabata Timer, MyFitnessPal, Strava and Gymverse, matched against 26 features.
* **This app:** searched the code for each feature to see what already exists.

## What the sources agree on
* Syncing with wearables and health platforms, adaptive coaching that adjusts after each workout, easy logging with clear progress history, templates and routines, and
  community or challenges come up again and again.
* In the app descriptions: **8 of 10** mention a health-platform sync (Apple Health / Health Connect), **8 of 10** progress charts, **8 of 10** custom intervals or timers,
  **6 of 10** Apple Watch, **6 of 10** workout templates, **3 of 10** progress photos, **3 of 10** body measurements, **3 of 10** data export.
* Trainer apps (My PT Hub, FitSW, TrueCoach, Everfit) all centre on: client list and packages, recurring **check-ins** with weight and progress photos, payment tracking,
  messaging, and program building. FitNFree already has messaging, packages and program delivery; the missing pieces were the client tracker, check-in tracker and
  finance sheets, which are now built (see below).

## Added in 1.0.1 (built, on `release/1.0.1`)
| Feature | Where | Why |
|---|---|---|
| **Interval Clock**: Tabata, boxing (3 or 12 rounds), HIIT, EMOM, custom intervals, plus a **rest timer** for between sets | Coach tab | Requested. Custom intervals are in 8 of 10 competitor listings, and a rest timer is a staple of strength-training apps that FitNFree did not have |
| **Trainer Tools**: client tracker, check-in tracker, monthly finance sheets, CSV export | Shop tab, for trainers only | Requested. Matches what the trainer apps above offer |

## What is still missing, in the order I would do it
| # | Feature | Evidence | FitNFree today | Effort and risk |
|---|---|---|---|---|
| 1 | **Apple Health and Google Health Connect sync** (steps, workouts, weight, heart rate, sleep) | 8 of 10 listings; the biggest theme on the web | Listed as "coming soon" in `WearablesScreen`; only Oura works. A plan already exists (read-only, iOS first) | **High value, high effort.** Needs a native HealthKit library, a new build, usage descriptions, App Privacy answers and a real-device test. Best as the headline of 1.0.2 |
| 2 | **Body weight and measurements log, with progress photos** | Photos 3 of 10, measurements 3 of 10; every trainer app has it | No weight history or photos in the code | **Medium.** Needs tables, a private photo bucket, and careful privacy wording (photos are sensitive). Also the natural "client side" of the new trainer check-ins |
| 3 | **Workout reminders** (local notifications) and a rest timer that starts when a set is logged | Reminders 2 of 10 in descriptions, but a staple in practice | The app already depends on `expo-notifications` (wake alarm only). The rest timer now exists but is manual | **Small to medium.** No new native module; a permission prompt; a settings screen |
| 4 | **Personal records and celebration** | PRs 3 of 10; 1RM estimates exist in the code | `estimatedOneRepMax` exists; no PR badges | **Small** |
| 5 | **Data export** (workouts, meals, weights as CSV or JSON) | 3 of 10; a trust feature, and good for UK data rights | No export of workout data (account deletion exists) | **Small to medium** |
| 6 | **Client-facing check-in forms for trainers** (client answers weight, photos, how they feel; trainer sees it) | My PT Hub, Moveat, FitSW | Trainer Tools are the trainer's own record; clients do not enter anything | **Medium to large.** Needs a link between a client's account and the trainer's client record, consent, and the photo work from item 2 |
| 7 | **Apple Watch app**, **widgets** and **Live Activities** for the clock | Watch 6 of 10; widgets and Live Activities rarely advertised | None | **Large,** native only. Later |
| 8 | **Friends and a feed** | Social 8 of 10 | Squad challenges exist; no friends list | **Medium.** Also adds moderation work |

## Recommendation
1. Ship 1.0.1 with the clock and Trainer Tools (plus the work already planned).
2. Make **Apple Health sync** the headline of 1.0.2, and build **weight and measurements with progress photos** alongside it, because the trainer check-ins need them.
3. Slot the small items (3, 4, 5) into 1.0.2 or 1.0.3 as space allows.

I stopped at the two requested features plus the rest timer on purpose: every extra feature is another thing for App Review to find, and items 1, 2 and 6 need privacy
decisions and device testing that cannot be done in this environment. Tell me which of the table you want next.
