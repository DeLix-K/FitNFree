# My records (all personal records in one list)

Built on branch `feature/all-prs` (from `release/1.0.1`), 2026-10-29. **Not run on a real phone.** Nothing here touches the database, adds any native code, or collects any new data. It reads the sets people already log.

## What it does
Progress tab > new **🏅 Records** segment (next to Streaks, Challenges and Body):
* **Three tiles:** exercises you have logged, records earned in total, records earned in the last 30 days.
* **Recent records:** every badge ever earned, across all exercises, newest first (10 at a time, "Show more"). Each shows the exercise, the set, the badges (🏆 Heaviest weight, 📈 Est. 1RM, 🔁 Rep record) and what it beat, for example "Heaviest weight: 245 lb (was 225 lb)". Records from the last 7 days are tagged NEW.
* **By exercise:** one card per exercise with the heaviest weight and the date, the best estimated 1RM and the date, number of sets, last trained, and when the latest record was set. Bodyweight exercises show most reps instead. A search box, and three sorts: latest record, A to Z, heaviest (kg and lb compared in kg). 30 at a time.
* Pull down to refresh. If the load fails, the screen shows the error and "Try again" and nothing else, rather than zeros.

## How it works
* The rules are the same ones the exercise page already uses (`prHistory` and `bestRecords` in `lib/prBadges.ts`), run once per exercise, so a record shown here is exactly the record shown on that exercise's page (a test checks this, including on 50,000 sets). The badge meanings (first set is a starting point, 12-rep cap on est. 1RM, kg and lb compared in kg, rep records) are in `docs/release/pr-badges.md`.
* Everything is **worked out on the phone each time, not stored**. No table, no SQL, no App Privacy change.
* All sets are read a page at a time in a fixed order (the database caps each request). Safety limit: 50,000 sets. If it is reached, the screen says "only your first 50,000 sets were read, your newest records may be missing", instead of quietly showing old records as current.

## Before this ships
1. Nothing to run in Supabase, nothing to configure, no new package or native code. It could ride an over-the-air update.
2. **TestFlight:** open Progress > Records with real history; compare one exercise's card with its exercise page; search and sort; try a brand-new account (empty message); check a bodyweight exercise and a lb exercise.

## What was tested, and what was not
| Tested | How |
|---|---|
| The grouping and feed: one set only is a starting point; records agree with the exercise page's rules for every exercise; feed newest first across exercises and equal to the sum of per-exercise badges; two badges on one day; bodyweight best reps; kg vs lb; unknown names; rows in any order; search; three sorts (and the list given is not changed); 50,000 sets over 80 exercises in under 2 seconds | `node scripts/test-all-records.mjs` (13 checks) |
| The real screen in a browser at phone width with in-memory data (45 exercises, mixed kg and lb, bodyweight): tiles, feed with Show more, search, all three sorts, empty message, error with Try again and recovery, the over-the-limit warning | temporary harness (not committed) |
| Type check; web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| A real phone: layout on small screens and large text, VoiceOver, pull-to-refresh feel | The browser run is a simulation. |
| The real database read: paging and the exercise-name join (`exercises(name)`) | Tested against a stand-in; the join needs the foreign key that the SQL files define. If the name were missing, the exercise shows as "Unknown exercise" rather than disappearing. |
| A very large real account | Speed was measured in Node (50,000 sets in well under 2 seconds), not on a phone. |

## Known limits
* **Tapping an exercise does not open its page yet.** The exercise page needs the full exercise object and the Exercises tab's own state, so linking to it is a separate change. The cards are read-only for now.
* Records are by weight and reps only; outdoor activities (time, distance) have none.
* Equal-set ties: the earlier set holds the record, as on the exercise page.
