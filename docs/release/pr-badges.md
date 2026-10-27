# Personal record (PR) badges

Built on branch `feature/pr-badges` (from `release/1.0.1`), 2026-10-27. **Not run on a real phone.** Nothing here touches the database or adds any native code.

## What it does (Exercise page)
* **When you log a set that beats your history, a banner appears right under the Log Set button:** "🏆 New personal record!" with what you beat, for example
  "Heaviest weight: 20 kg (was 15 kg)" and "Est. 1RM: 25.3 kg (was 19 kg)". A stronger buzz goes with it on a phone.
* **First set ever for an exercise** shows a quiet "📌 First set logged. That is your starting point; beat it next time to earn a PR." It is never called a PR.
* **A new "🏅 Personal records" card** lists every set that earned a badge, newest first (latest five), with the badge names, what it beat, and a "NEW" tag for the last 7 days.
  It is worked out from your whole logbook, so it also shows records from sets you logged before this update.
* An equal set, or a lighter or weaker one, earns nothing, and the banner clears on the next log.

### The three records
| Badge | Means |
|---|---|
| 🏆 **Heaviest weight** | More weight than you have ever lifted on this exercise, for any number of reps. |
| 📈 **Est. 1RM** | A better estimated one-rep max (Epley: weight × (1 + reps ÷ 30)). Only sets of **12 reps or fewer** count, because the formula is unreliable beyond that. Always labelled "Est." |
| 🔁 **Rep record** | More weight than any earlier set that had at least as many reps (100 kg for 8 beats an earlier 95 kg for 8 or 10). It needs an earlier set of that many reps, so the first time you try a new rep count is not a record. Not shown when the set is already a Heaviest-weight record. For **bodyweight** sets (0 kg) it means more reps than any earlier bodyweight set. |

Rules that keep it honest: kg and lb are compared in kg (so 225 lb beats 100 kg, and 220 lb does not); a record must beat the old one by more than rounding noise; a record needs something earlier to beat.

## Fixes to what was already on the page (worth knowing, they change numbers people may have seen)
1. The box labelled **"Heaviest Set"** actually showed the weight of the set with the best *estimated 1RM*, which is not always the heaviest. It now shows the real heaviest weight, labelled **Heaviest Weight**.
2. **Est. 1RM** now ignores sets of more than 12 reps (a 30-rep set used to "estimate" a huge 1RM).
3. The page used only the **last 180 days**, so an old best could be missed. Records now use the **whole history**.
4. Weights logged in **kg and lb** are now converted before comparing. Before, 100 and 225 were compared as plain numbers.
5. For bodyweight-only exercises the boxes show "—" instead of "0 kg".

## How it works
* `lib/prBadges.ts` holds the rules (pure functions, tested). Records are **worked out on the phone each time, not stored**, so there is no table to add, nothing to migrate and nothing new in App Privacy.
* The page reads all your sets for the exercise a page at a time (the database limits each request), stopping only on an empty page so a lower server limit cannot cause a silent short read.
  If more than 10,000 sets exist for one exercise, or the load fails, **no record is announced** (a missing list must never turn an ordinary set into a "PR").
* The set you log is compared with the sets loaded **before** it, plus any you logged on this page in the same visit, so two quick sets cannot both claim the same record.
* Moving to another exercise from the Swap list clears the previous exercise's sets first, and a slow older response cannot overwrite a newer one (this was a real bug I found and fixed while building it).

## Things to say honestly
* Records are **per exercise** and by **weight and reps only**. Outdoor activities, time and distance have no PRs yet, and there is no "all my PRs" feed across exercises yet.
* **First weighted set after bodyweight sets counts as a Heaviest-weight PR** (there was no weight to beat). Technically true, and it can read as a little generous.
* The banner appears when the set is saved. If the page is still loading your history when you log, no banner appears for that set (by design), and its record shows on the card afterwards.
* There is no way in the app to edit or delete a logged set, so a record cannot disappear later. If one is ever added, records will simply be recalculated.
* Different devices are fine: records come from the database history, not from the phone.

## Before this ships
1. Nothing to run in Supabase, nothing new to configure, no new native code. It rides the 1.0.1 build (or an over-the-air update).
2. **Privacy policy / App Privacy:** nothing new is collected; it only reads the sets people already log.
3. **TestFlight:** log a heavier set on an exercise with history and see the banner and the card update; log an equal set and see nothing; check an old exercise with mixed kg and lb sets; try a bodyweight exercise.

## What was tested, and what was not
| Tested | How |
|---|---|
| The rules: first set, heavier, equal, lighter, reps at the same weight, 12-rep cap, bodyweight, kg and lb, rounding noise, rep records and when they are suppressed, history order, ties, current records, heaviest vs best 1RM, one pass equals checking set by set, speed on 6,000 sets, reading pages when the server returns fewer rows than asked for, row and request limits reported as incomplete, errors passed on | `node scripts/test-pr-badges.mjs` (23 checks) |
| The real exercise page in a browser at phone width against a fake in-memory database (paged reads, inserts): records card with kg and lb history, a real PR banner with the right "was" values, an equal set earning nothing, the baseline message, a bodyweight record, the first weighted set, switching exercise from the Swap list (no leftover banner, the other exercise's records), a failed load (no badge, set still saves), a 2,300-set history | temporary harness (not committed) |
| Type check, and the web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| A real phone: the stronger buzz, layout on small screens and large text, VoiceOver | Haptics do nothing in a browser; labels are set but not checked with a screen reader. |
| The real database's paging and its row limit | Tested against a fake server that returns fewer rows than asked for, but not against Supabase itself. |
| An account with thousands of sets per exercise | Speed was measured on 6,000 sets in Node, not on a phone. |
