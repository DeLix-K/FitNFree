# Weight and measurements log, with private progress photos

Built on branch `feature/weight-log` (from `release/1.0.1`), 2026-10-26. **Not run on a real phone, and the database table is not applied yet.**

## What it is
A new **⚖️ Body** segment on the Progress tab (next to Streaks and Challenges).

* **Weight, body fat and five measurements** (waist, chest, hips, thigh, arm), one entry per day. Adding an entry for a day that already has one replaces it, and the form says so first.
* **Units your way:** kilograms, pounds, or stone and pounds; centimetres or inches. Switch whenever you like; everything is stored in kilograms and centimetres, so nothing is lost
  converting back and forth. Stone accepts "12 st 13", "12st13", "12 13" or "12.5 st".
* **Summary:** latest weight, change over the last 30 days, and a per-week trend (needs 3 weights across at least 2 weeks, otherwise it says so rather than guess).
* **Chart:** each reading as a dot, plus a 7-day average line, which shows the real direction through the day-to-day water wobble. Choose weight, body fat or any measurement; 30 days, 90 days, or all.
* **Goal weight** (optional, kept on the phone) with a progress bar from your first logged weight.
* **Export** the whole log as CSV (opens the share sheet on a phone, downloads in a browser). Spreadsheet-formula-safe.
* **Optional:** a "also update my profile weight" switch on today's entry, so the calorie targets stay current. Off unless you turn it on.
* **Progress photos (phone app only):** take or choose a photo, tag it Front, Side, Back or Other, group by date, view full size, delete, and a **before and after** that
  pairs the earliest and latest photo of the same pose.

## Where the data lives (the privacy part)
| Data | Where | Who can see it |
|---|---|---|
| Weight, body fat, measurements, notes | Supabase table `body_log` | Only the signed-in person. Not other users, not trainers, not anonymous visitors (row-level security, tested). Deleted with the account. |
| **Progress photos** | **Only on the phone**, in the app's private folder | Only the person holding the phone. **Never uploaded, never sent to the database, a server or an AI service.** No network code is involved in saving or showing them. |
| Units, goal weight, the photo list | On the phone (app storage) | Only the person holding the phone. |

The picture is copied from the picker into the app's private folder; the picker's temporary copy is removed if it was in the app cache (a file in the person's own library is never deleted).
The photo list is read defensively and file names are only used if they match the exact safe shape the app creates.

## Things to say honestly
* **Losing the phone or deleting the app loses the photos.** They are not in the account, and we cannot recover them. The screen says this.
* **Backups:** on iPhone, app data can be included in the person's *own* iCloud or computer backup. That backup is theirs and we never receive it; but "only on this phone" is therefore
  not absolute, and the privacy wording below says "never sent to us" rather than "never leaves the device".
* A photo taken in the app is meant to exist only in the app's folder. I have not confirmed on a device that the camera flow leaves nothing in the Photos library on both iPhone and Android, so check that in TestFlight before promising it.
* The 7-day average and per-week trend are arithmetic on what was logged, not medical advice. Nothing here diagnoses or recommends a weight.

## Before this ships
1. **Run `supabase/body_log.sql`** in the Supabase SQL Editor (safe to run twice). The Body tab shows an error with "Try again" until the table exists.
2. **This needs a new binary build, not just an over-the-air update.** The camera and photo-library permission wording in `app.json` now mentions private progress photos, and iOS purpose
   strings live in Info.plist. `expo-file-system` itself is already inside the 1.0 binary (it comes with `expo`), so no new native code, only the wording. 1.0.1 is a new build anyway.
3. **App Store Connect, App Privacy:** progress photos never leave the device, so they are not "collected". Weight, body fat and measurements are health and fitness data sent to our database, linked to
   the account and used only for app functionality (not tracking, not advertising). Check that **Health & Fitness** is declared for this, since the profile already holds weight and height.
   Apple Guideline 5.1.3 forbids using health data for advertising or sharing it with third parties, which we do not do.
4. **Privacy policy:** add a sentence like: "If you use the Body log, your weight and measurements are stored in your account and visible only to you. Progress photos you add are stored only on your device. We never receive or upload them, and they are deleted if you delete the app."
5. **Delete account:** the account deletion removes `body_log` rows automatically (foreign key cascade, tested). Photos are on the phone and go with the app.
6. **TestFlight device checks** (none of this has run on a phone): take a photo (camera permission prompt shows the new text), choose from library, add, view, delete, before and after; kill the app and reopen
   (photos and list still there); airplane mode (photos still show); add and edit entries with kilograms, pounds, stone; export the CSV; switch units; sign out and in as someone else (no data crosses over).

## What was tested, and what was not
| Tested | How |
|---|---|
| Weight/length parsing and formatting, stone forms, 7-day average, trends, goal progress, chart geometry, CSV safety, photo list parsing, safe file names, before and after | `node scripts/test-body-log.mjs` (24 checks) |
| The table: owner-only access (read, change, delete, write as someone else), anonymous refused, value ranges, empty entry refused, future date refused, one entry per day and replacement, updated time, row limit, cascade on account deletion, safe to run twice | `supabase/tests/body-log.test.mjs` in an in-process Postgres (11 checks) |
| The screen in a browser at phone width with a fake database and fake photo store: summary, chart, metrics and ranges, add, edit, delete, same-day replace warning, date clash on edit, validation messages, profile-weight switch, units and goal in stone and inches (saved and restored), empty state, error with "Try again", add photo, view, delete, before and after, and the browser fallback message | temporary harness (not committed) |
| Type check, and the web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| Real camera, picker and file storage on a phone | The photo store uses the SDK 57 `File`, `Directory` and `Paths` API as documented, but it has never run on a device. This is the main risk. |
| The real Supabase upsert (`on_conflict` on user and date) through PostgREST | Tested in Postgres directly, not through the live API. |
| Whether the iOS picker returns JPEG at quality 0.8 for every source (files are named `.jpg`; the image still displays whatever the format) | Low risk, needs a device. |
| Screen-reader behaviour, large text, small phones | Labels are set; nothing was checked with VoiceOver or TalkBack. |
