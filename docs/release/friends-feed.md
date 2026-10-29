# Friends feed

Built on branch `feature/friends-feed` (from `release/1.0.1`), 2026-10-29. **Not run on a real phone, and the database part is not applied yet.** This is a social feature (one person's activity shown to other people), so the privacy rules below are the heart of it.

## What it does
Progress tab > new **👥 Friends** segment.
* **First time:** a setup screen explains what is shared and lets the person switch on each kind of update separately. **Everything is off until they choose.** "Turn on Friends" saves their choices.
* **Feed:** automatic updates from friends (and your own), newest first, each with four emoji cheers (💪 🔥 👏 🎉). One cheer each; the same emoji again takes it back; a different one swaps it. Pull to refresh, "Show older" for more. Updates disappear after 60 days. **No typed posts or comments anywhere.**
  * ✅ "Sam logged a workout" (only that they did, on which day; nothing about the workout)
  * 🔥 "Sam reached a 14-day streak" (milestones: 3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, then every 100)
  * 🏆 "Sam set a new record on Bench Press: 65 kg × 5, Heaviest weight, Est. 1RM" (only library exercises, never custom ones)
* **Friends tab:** search by display name, send a request, accept or decline requests, withdraw a request you sent, remove a friend, **block** (uses the block list the app already has) or **report** (the existing report form, kind "user").
* **Sharing tab:** the three switches (changing one hides that kind from friends straight away, including old updates), a list of **everything you have shared with a Delete button** for each, and **"Leave Friends and delete everything"**.

## Privacy rules (all enforced in the database, `supabase/friends_feed.sql`, and tested)
* **Opt-in both ways.** Only people who switched Friends on can be found by name, can receive a request, can see the feed, or appear in anyone's feed. Each kind of update is its own switch.
* **A request must be accepted.** Declining shows the requester nothing but "waiting", and asking again changes nothing. Any reason someone cannot be reached (self, not in Friends, blocked, unknown) gives the same message, so it does not reveal who is in Friends or who blocked whom.
* **Blocking ends the friendship** (a database trigger on the existing block list), removes the cheers the two gave each other, hides both from each other in search, requests, friends and feed, and a request that arrives after a block is dropped.
* **What friends see is built by the database from real data**, not typed: a workout log creates the workout update; the streak is read from the existing streak view; a record is only accepted if a set exactly like it was logged in the last two days, on a library exercise (a custom exercise's name is written by the person, so those are never shared). The author's own text is never shown, only their display name (already used on the leaderboard and challenge search).
* **Logging a workout can never be stopped by this feature** (the update is written inside a safety net; tested by making the update fail).
* **You control it.** `my_shared_events` lists everything you shared; each can be deleted (its cheers go with it); leaving deletes your friendships, updates and cheers, and people are not told.
* **Nobody can read the tables directly.** Everything goes through functions; only your own on/off switches are a table you read and write. Logged-out visitors can call nothing.
* **Limits:** 200 friends, 50 waiting requests, 20 requests a day, 200 cheers a day, 30 records a day, search results capped at 20.

## Decisions I made (easy to change, tell me if you want them different)
* **Search is by display name** among people who opted in, as you chose. Many people have the default name "Fitness Fan", so those results can look identical; people can set a distinct display name in Profile.
* **A friend who turns Friends off or hides a kind disappears from your feed** (their old updates are hidden, not deleted, so turning it back on restores them).
* **You always see your own updates in your feed** (so you can see what you are sharing).
* **No notifications.** The app cannot send push notifications, so requests and cheers are seen when the Friends tab is opened.
* The feed lasts **60 days**, then updates are deleted.
* This is on the Progress tab as a fifth segment (the header scrolls sideways on a small phone).

## What this changes
* **New database tables and functions** (`supabase/friends_feed.sql`): `friend_settings`, `friendships`, `feed_events`, `feed_cheers`, 12 functions, and two triggers: one on `workout_logs` (writes the workout and streak updates for people who switched them on) and one on the existing `blocked_users` (ends a friendship when someone is blocked). **Run it in the SQL Editor** (needs `profiles`, `workout_logs`, `user_streaks`, `exercises`, `exercise_set_logs`, `blocked_users`, which already exist). Safe to run twice. **Because it adds a trigger to `workout_logs` and `blocked_users`, it touches tables the live app uses**: it does nothing for anyone who has not switched Friends on (the trigger returns at once), and a failure inside it is caught so a workout still saves.
* No new package, no native code, no new permissions. It can ride an over-the-air update once the SQL is run.
* One small change to an existing screen: `LogSetCard` calls `shareRecordIfOn` after a personal record, which does nothing unless Friends and records are switched on (the setting is cached for a few minutes, so logging a set does not wait on the network in the normal case).

## Before this ships
1. **Run `supabase/friends_feed.sql`.** Until then the Friends tab shows an error (the rest of the app is unaffected).
2. **Privacy policy and App Privacy.** New wording to review before publishing:
   > **Friends.** If you choose to turn on Friends, other FitNFree members who turned it on can find you by your display name and send you a friend request. Only people you accept see your updates, and only the kinds you switch on: that you logged a workout, a streak milestone, or a personal record on an exercise from the app's library. You can turn each kind off, delete anything you shared, or leave Friends at any time, which deletes your friendships, updates and cheers. You can block or report anyone. We do not show typed posts, and we do not use this for advertising.
   In App Store Connect > App Privacy, check that **Fitness** and **User ID / Name (display name)** are covered as collected and linked to the user for App Functionality, and that the "shared with other users" part is described in the policy.
3. **App Review notes (Guideline 1.2, user-generated content).** Explain that the only user-written text shown to others is the display name (already filtered when set), there are no posts or comments, and there is **report and block** on every friend. Provide **two demo accounts that are already friends** so reviewers can see a feed, and say where to find it (Progress > Friends).
4. **Two-phone check on TestFlight:** two accounts turn Friends on; one searches for the other and sends a request; the other accepts; one logs a workout from Progress > Streaks and sets a record on a library exercise (with "Personal records" on); the other sees them in the feed and cheers; block one and check both feeds; then "Leave Friends".

## What was tested, and what was not
| Tested | How |
|---|---|
| The database rules in a real in-process Postgres: nothing shared and nobody findable until opted in; every switch off by default; your switches are yours alone; search (opt-in only, never yourself, wildcards literal, length limits, "Fitness Fan" for no name, hides people you already have a request or friendship with); requests (must be accepted, one answer once, decline reads as "waiting", asking back accepts, same message for every unreachable reason, anonymous refused); blocking (ends friendship, hides both ways, drops later requests, removes cheers); automatic updates (only with switches on, once a day, milestones only, can never stop a workout being logged); records (only real, on library exercises, recent, sane numbers, once, per-day limit); the feed (exactly the kinds switched on, switching off hides old ones, Friends off on either side hides everything, newest first, paging, 60-day deletion); cheers (one each, swap, take back; refused for yourself, strangers, blocked people, switched-off kinds, made-up emoji); see and delete what you shared; leaving; all the limits; deleting an account | `node supabase/tests/friends-feed.test.mjs` (24 checks) |
| The sentences and cheers: each update reads right (including "You"), odd or damaged data never shows junk, names and exercise names are cut short, time-ago text, cheer order and local cheer logic match the database, the four emoji match the database, limit and milestone numbers match the database | `node scripts/test-friends.mjs` (13 checks) |
| The real screen in a browser at phone width against an in-memory stand-in: setup (only the chosen switch saved), feed, cheering (add, swap, take back, a failure puts it back), search (hint for 1 letter, results, nothing found), add, withdraw, accept, remove, block, the sharing switches, deleting an update, leaving (back to the all-off setup) | temporary harness (not committed) |
| Type check; web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| **The real Supabase project.** The SQL has only run in a local Postgres stand-in (with simplified copies of `profiles`, `workout_logs`, `user_streaks`, `exercises`, `exercise_set_logs` and `blocked_users`). | The two triggers on live tables, the real streak view, and Supabase's default permissions could behave differently. Run it and do the two-phone check before shipping. |
| **Two real accounts.** The privacy rules are tested at database level with simulated users, not with two real sign-ins. | |
| **A real phone:** layout with long names, large text, VoiceOver. | |
| **Moderation in practice.** Only display names are user text, but a person could choose an offensive name that the filter missed; the report button files into the existing report table and a person has to read it. | |
| **Many users:** search is a name match over the people who opted in, and the feed reads recent events for friends. Fine for thousands; not load-tested. | |

## Known limits
* Updates exist only from the moment someone switches a kind on; nothing from before is shared.
* The workout and streak updates come from the database whenever a workout day is saved to `workout_logs` (today that is the "log today's workout" action on the Streaks screen and completing a plan, `lib/plans.ts`); records come from the exercise page.
* A workout update is written once per person per day (UTC date), and a streak update at most once a day.
* No friend profiles, direct messages, comments or typed posts, by design.
