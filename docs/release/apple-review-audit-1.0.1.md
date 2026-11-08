# Apple App Review pre-submission audit, 1.0.1

Run 2026-11-08 against build 18 (the TestFlight binary), the code on `release/1.0.1`, and App Store Connect (read-only through the API). **No audit can promise approval**: App Review is done by people, and the outcome also depends on the demo accounts, the notes and how the screens look on their device. This lists what was checked, what was fixed, and what only you can do.

Legend: PASS = verified here. FIXED = a problem found and fixed on this branch. OPEN = needs you. UNVERIFIED = could not be checked from here.

## 1. Problems found, in order of risk

| # | Risk | Guideline | Finding | Status |
|---|---|---|---|---|
| 1 | **High** | 2.1 / 2.3.1 (features that do not work) | On iPhone, the Wearables screen showed a **Connect** button for Oura that could never work: it only displayed "only supported on the web version". The App Store description also promises "automatic sync via Oura Ring". A reviewer who taps it sees an error | **FIXED in app** (the phone app now says "Connect on the web app"; an already-connected ring still shows its data). **OPEN: the App Store description** still says "automatic sync via Oura Ring" with no web caveat. Reword before submitting (see section 3) |
| 2 | **High** | 2.1 (completeness) | The same screen listed **Fitbit, Apple Health, Google Health Connect, Garmin as "Coming soon"**. "Coming soon" features are a common rejection reason, and naming Google's service inside an iOS app is a 2.3.10 risk | **FIXED** (list removed). Also fixed a Sleep card that told phone users to "Connect Oura under Profile" |
| 3 | **Medium** | 5.1.1 / privacy manifest (ITMS-91053) | In the shipped build 18, `ExpoFileSystem_privacy.bundle` contains only an `Info.plist`: its `PrivacyInfo.xcprivacy` did not make it in. The ExpoFileSystem code uses disk-space and file-date APIs (found by scanning the binary), but the app's own manifest declares neither DiskSpace nor the extra file-date reasons. Apple may email "missing API declaration" or refuse the build | **FIXED in `app.json`** (`ios.privacyManifests`: DiskSpace `E174.1`, `85F4.1`; FileTimestamp `0A2A.1`, `3B52.1`, the same reasons expo-file-system declares for itself). Takes effect only in build 19. **OPEN:** check your email for any "ITMS-91053" message about build 18 |
| 4 | **Medium** | 5.2.1 / 5.2.2 / content rights | 102 exercise animations are loaded straight from `static.exercisedb.dev` (ExerciseDB). Its public repository states **no licence for the media** and warns the free endpoints are "for exploration only and not recommended for production"; the project's own website has an **expired TLS certificate**. App Store Connect has "Content rights" set to **"does not use third-party content"**, which is not accurate (these GIFs, YouTube embeds and Open Food Facts data are third-party) | **OPEN, your decision.** Options: get written permission or a paid plan from ExerciseDB; host your own demonstrations; or remove the GIFs (the app falls back to text). At minimum, correct the Content Rights answer to "uses third-party content" and confirm you have the rights. I did not change it |
| 5 | **Medium** | 1.2 (user content) | Reports are promised a response "within 24 hours", but the **hourly report-digest email is not deployed** (the function returns 404). Reports sit in a table nobody is notified about | **OPEN.** Deploy `report-digest` (needs Resend account, secrets, schedule: `docs/release/report-digest-setup.md`), or check `supabase/ops/open_reports.sql` every day. Reviewers do not test this, but a real report left unseen breaks the promise made in the app |
| 6 | **Medium** | 2.3.3 / 2.1 | **Apple Watch screenshots missing.** The listing has iPhone 6.5" (5) and iPad 12.9" (3) screenshots only. A build that contains a watch app needs Apple Watch screenshots | **OPEN** (take them from your watch once the app runs there) |
| 7 | **Low-Med** | 2.1 (completeness) | **The watch app has never run on a watch**, and nothing could be run on iPad in this audit | **OPEN:** TestFlight pass on a watch and an iPad |
| 8 | Low | 1.2 | A trainer could not report a client | **FIXED** earlier (commit `c5b1749`, in build 19) |
| 9 | Low | 2.3.4 | `What's New` for 1.0.1 is empty (App Store Connect requires it for an update) | **OPEN:** `docs/store-listing-v2.md` has draft text |
| 10 | Low | Age rating | Two age-rating records with different "contests" answers (`FREQUENT` vs `FREQUENT_OR_INTENSE`) and a "17+" computed rating next to a "16+" override. Friends and check-ins add social features | **OPEN:** open App Store Connect > App Information > Age Rating for the 1.0.1 version and re-answer the questionnaire once, from scratch, with Friends, chat and AI in mind. Keep "User-generated content" and "Messaging" ON |

## 2. What was checked and passed

**Binary (build 18 IPA)**
* PASS Apple's toolchain requirement: built with Xcode 26.6 / iOS 26.5 SDK, watchOS 26.5 SDK.
* PASS Versions: app, widget and watch all 1.0.1 (18); watch companion id is `com.teamk.fitnfree`; watchOS 10, widget iOS 17, app iOS 16.4.
* PASS No `UIBackgroundModes` (the 2.5.4 lesson holds), no push entitlement, no HealthKit, no advertising identifier, no tracking permission, no tracking domains.
* PASS Purpose strings present for camera, photos, microphone, speech, location (three keys) and motion; each says honestly what the app does. The motion/always-location keys must stay (see the build 16 history).
* PASS Provisioning: all three bundles use App Store profiles (not ad hoc), App Group only on app and widget.
* PASS Encryption: `ITSAppUsesNonExemptEncryption = false` matches App Store Connect (HTTPS only).
* PASS Privacy manifests: 16 present (app, watch, React, Sentry, Expo packages); tracking is false everywhere.
* PASS Orientation and iPad: portrait on iPhone, all orientations on iPad (accepted in 1.0).

**Payments (3.1.x)**
* PASS Premium is the only digital purchase on iPhone, through Apple In-App Purchase (`lib/iap.ts`, `components/SubscriptionPaywall.tsx`): Restore Purchases present (Profile and paywall), renewal terms, price and Privacy/Terms links shown before the sheet (the 3.1.2(c) fix, approved in 1.0).
* PASS Stripe on the phone is limited to physical merch (3.1.3(e)) and live one-to-one sessions (3.1.3(d)). Courses, paid guides and trainer plans are web-only (`lib/storeRules.ts`, enforced in `TrainerCard`, `TrainerProfileScreen`, `TrainersScreen`, `ShopScreen`). Free guides are claimed server-side with no purchase.
* PASS No text steering people to buy elsewhere (searched for website/cheaper/checkout wording).
* PASS The auto-renewing subscription is `APPROVED` in App Store Connect; server notifications URL is set for production and sandbox.

**Accounts and data (5.1.x)**
* PASS Account deletion is in the app (Profile > Delete My Account) and cascades through every new table (every foreign key to the user cascades).
* PASS Privacy policy, terms and delete-account pages all return 200; the support page shows a contact address.
* PASS AI consent: the only code path to the AI function is `lib/claude.ts`, which asks permission first (5.1.2(i)). Health data is never used for advertising (5.1.3).
* PASS Email sign-up with confirmation only: no third-party login, so Sign in with Apple (4.8) does not apply.

**User content (1.2)**
* PASS Terms say there is no tolerance for objectionable content. Reporting exists on challenges, names, squads, trainer profiles, trainer chat (report + block), friends (report + block) and, now, check-in clients. Names and bios are filtered. Contact details are published.

**Health and safety (1.4)**
* PASS AI replies are labelled not medical advice (consent screen, the listing description, the AI system prompts), and the mood reflection prompt tells the model to point to a crisis line when needed. Suggestion (not required): add a visible "if you are in crisis" line to the mood screens.

**Listing (2.3)**
* PASS No competitor or trademark keywords; name and subtitle are accurate; 5 iPhone and 3 iPad screenshots; privacy policy URL set; export compliance answered.

## 3. Wording to fix in App Store Connect (only you can)

1. Description line "Manual sleep logging or automatic sync via Oura Ring" becomes "Manual sleep logging, or sync from an Oura Ring connected in the FitNFree web app". (It stays accurate for iPhone users.)
2. Content Rights: change to "uses third-party content" and confirm rights (finding 4).
3. What's New for 1.0.1; Apple Watch screenshots; App Privacy answers (`privacy-1.0.1.md`); App Review notes (`app-review-notes-1.0.1.md`, 3,424 characters).
4. Age rating: re-answer once for this version.
5. EU "trader" declaration: pending on your list. Required for the EU storefronts; as an individual, your name and address may be shown publicly.

## 4. Could not be verified from here

* **Any 1.0.1 feature on a real phone** (Body, Friends, check-ins, reminders, widget, watch, export, Records) and **any screen on an iPad**. TestFlight is the only way.
* **The reviewer login still works.** I did not sign in with it (it would mean using a password against your live backend). Sign in once on TestFlight before submitting.
* **Apple's email after processing build 18** (privacy manifest warnings). Only you can see it.
* **How the new native packages behave** (the SDK 57 patch updates are not in build 18).
* **Whether ExerciseDB permits your use** (their terms page could not be opened).
* **App Review's judgement.** Rules change, and reviewers differ.

## 5. What changed in the code during this audit

* `app.json`: `ios.privacyManifests` (finding 3).
* `screens/WearablesScreen.tsx`, `components/SleepReadinessCard.tsx`: findings 1 and 2.
* The build number is raised to 19 as the next step; see the commit history.
