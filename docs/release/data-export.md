# Export my data

Built on branch `feature/data-export` (from `release/1.0.1`), 2026-10-28. **Not run on a real phone.** Nothing here touches the database schema, adds any native code or collects any new data.

## What it does
Profile > Account > **📦 Export my data** opens a screen with:
* **Everything (one file):** a JSON file (`fitnfree-all-my-data-YYYY-MM-DD.json`) with all of the parts below, for a backup or for moving to another app.
* **Spreadsheets (CSV):** one file per log, opens in Excel, Numbers or Google Sheets. Exercise sets, workout days, body log, meals, sleep, mood, water, habit check-ins, runs/walks/rides.

The file is written to the app's private cache and handed to the phone's share sheet (Save to Files, email, another app). On the web it downloads. **We upload nothing.**

### What is in the files
| Part | In a spreadsheet | In the full JSON copy |
|---|---|---|
| Exercise sets (date, exercise name, weight, unit, reps) | yes | yes |
| Workout days (date, plan, program, minutes) | yes | yes |
| Body log (weight, body fat, five measurements, notes) | yes | yes |
| Meals (calories, macros, fibre, iron, description, how it was added) | yes | yes |
| Sleep (length, times, quality, score, stages, HRV, notes) | yes | yes |
| Mood (rating, notes, AI reflection) | yes | yes |
| Water (glasses per day) | yes | yes |
| Habit check-ins (habit name, amount) | yes | yes |
| Runs, walks and rides (distance, time) | yes | yes, **with the GPS route** |
| Habits, workout plans (with their exercises), profile (name and body details), AI history | no | yes |

### Deliberately NOT included (the screen and the file both say so)
* **Progress photos:** they only ever existed on the phone.
* Trainer messages, and orders, purchases and receipts (shop, courses, trainers, merch).
* Challenge, leaderboard and friends activity (it involves other people).
* Email, password and Premium receipts (held by the sign-in provider and the App Store or Google Play).
* Photos attached to meals (the link is left out), and anything on the profile that is not a body detail (no payment or subscription columns are ever requested).

## Safety rules built in
* **Allow-list:** each part names the columns it exports. A new column added to a table later does not leak into a file by accident, and `user_id` is never written. (The reads use `select *` so an older database missing a newer column cannot make the whole export fail; the allow-list is what decides what goes in the file. The profile names its columns instead.)
* **Spreadsheet formula safety:** text beginning with `=`, `+`, `-` or `@` gets a leading apostrophe so Excel cannot run it as a formula (meal names can come from scans and food databases). Real numbers, including negatives, are untouched.
* **Opens correctly in Excel:** UTF-8 byte-order mark and CRLF line breaks, so accents and emoji survive.
* **Nothing silently missing:** every part is read page by page in a fixed order (by id, so rows cannot be skipped or repeated), stopping only on an empty page. If one part fails, or a safety limit (250,000 rows) is hit, the full copy is **not handed over automatically**: the screen lists what is missing and offers "Try again" or "Download anyway", and the file itself has a `problems` list. A single spreadsheet that fails shows the error and no file.
* **Empty logs** say "Nothing logged here yet" rather than producing an empty file.
* **Privacy reminder on the screen:** the file is not encrypted and holds health information; anyone it is sent to can read it.
* **Cache clean-up:** the file is kept in the app's private cache until the next export or the next time the screen opens (the share sheet may still be reading it on Android), and the phone may clear the cache sooner.

## Honest notes
* It is a copy for the person, not a deletion tool. Deleting the account is still on the Profile screen as before.
* The JSON is for backup or moving data. There is **no import** in the app.
* Times in the files are UTC (ISO 8601); dates are `YYYY-MM-DD`. Each exercise set keeps the unit it was logged in (kg or lb); the body log is kg and cm.
* "Everything" does not mean every row in the database about the person (see the not-included list); the screen and the file say so.
* A very large account (thousands of sets) makes a bigger file and takes longer; the build was tested with 2,300 sets in a browser and 100,000 rows in Node.

## Before this ships
1. Nothing to run in Supabase, nothing to configure, no new native code or package (`expo-sharing` and `expo-file-system` are already in the app). It could ride an over-the-air update.
2. **Privacy policy:** optional, but good to add: "You can export a copy of your logged data at any time from Profile > Export my data."
3. **TestFlight / Android check:** open the screen, export Exercise sets, save to Files or email it to yourself, open it in a spreadsheet app (accents, dates, a meal name starting with `-` or `=`); export the full copy and look at the JSON; try a log with nothing in it.

## What was tested, and what was not
| Tested | How |
|---|---|
| Spreadsheet building: quoting of commas, quotes and line breaks; formula safety; BOM and CRLF; a file read back by a strict CSV parser equals what went in; 100,000 rows in under 3 s | `node scripts/test-data-export.mjs` (21 checks) |
| Every part: records, names from related rows (object, list, missing), numbers sent as text, allow-list (no user id, payment ids, photo links or private columns leak), plans in order, routes only in the JSON | same |
| Reading: one part failing is reported and the rest kept; a stopped-early part is flagged; empty part; oldest-first order; the spreadsheet and the full copy list the same rows | same |
| The real screen in a browser at phone width against fake in-memory data (2,300 sets): a spreadsheet export, an empty log, a failing log, the full copy, the "some parts are missing" warning with Try again and Download anyway, the share-unavailable message | temporary harness (not committed) |
| Type check; web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| A real phone: writing the file to the cache and opening the share sheet on iOS and Android (`expo-file-system` and `expo-sharing` calls) | The browser run used a stand-in for the share step. The calls follow the SDK 57 docs and the same sharing library already works for the streak and program share cards, but the file-writing path is new. |
| The real database: the `select *` plus related-name reads (exercise, plan, program and habit names) and paging | The names rely on the foreign keys in the SQL files being present in the live database. If one is missing, that part fails with a clear message and the rest still export. |
| The web download (`lib/exportFile.web.ts`) | Not driven in a browser; it is a plain browser download. |
| Opening the files in Excel, Numbers and Google Sheets | The CSV was checked with a strict parser, not with the apps. |
