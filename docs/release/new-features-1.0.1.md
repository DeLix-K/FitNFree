# New in 1.0.1: Interval Clock, Trainer Tools and Body log

Built on branch `release/1.0.1`, 2026-10-26. Neither has been run on a real phone, and the database part is not applied yet.

## 1. Interval Clock (Coach tab)
**Where:** Coach tab, Coach Dashboard, the new "⏱️ Interval Clock" card next to Recalibrate Session and Form Check.

**What it does**
* Presets: **Tabata** (20 s work, 10 s rest, 8 rounds), **Boxing 3 rounds** and **Boxing 12 rounds** (3 min rounds, 1 min rest), **HIIT** (40/20 x 10), **EMOM**
  (every minute for 10 minutes), and **Custom** (get ready, work, rest, rounds). A **Rest timer** mode counts down 1:00, 1:30, 2:00 or 3:00.
* Big countdown, colour by phase (get ready, work, rest, done), round counter, progress bar and total time left. Pause, resume, stop, again.
* Vibration on each change and a 3-2-1 countdown; optional spoken cues ("Round 3. Go", "Rest"). Your last choices are remembered on the device.
* The screen stays awake while it runs (`expo-keep-awake`, a new small Expo package, so this needs a new build, which 1.0.1 is anyway).
* Time is measured from the clock, not by counting ticks, so a busy phone cannot make it drift.

**Limits, stated plainly**
* If you lock the phone or leave the app, the clock keeps the right time but it cannot buzz or speak, because the app is not allowed to run timers in the background.
  I deliberately did **not** turn on any background-audio mode: Apple rejected the app for background audio once already (guideline 2.5.4).
* No sounds or beeps, only vibration and optional voice. Sound files can be added later.
* On the web, vibration and keep-awake do nothing.

**Privacy and review:** it stores nothing but its own settings on the device and sends nothing anywhere. No change to App Privacy.

## 2. Trainer Tools (Shop tab, trainers only)
**Where:** Shop tab, a new "🧰 Trainer Tools" section that appears only for people who have a trainer profile.

**What it does**
* **Clients:** a tracker with name, status (active, paused, ended), package, start date, check-in day, payment due date, payment status (paid, due, overdue), and notes. Shows
  active clients and payments due; a "due" payment past its date shows as overdue.
* **Check-ins:** log each check-in with date, done or to do, photos submitted (yes or no), current weight, and coach feedback. Shows total check-ins and check-ins left
  to do, and a "Coming up" list of clients whose check-in day is near.
* **Finances:** income and expense entries, month by month for each year, with income, spent, profit and profit margin, year totals, and a currency symbol (GBP, USD, EUR).
* **Export** of each list to CSV (spreadsheet formulas in exported text are neutralised).
* **Tracking only:** it takes and sends no money and files nothing with any tax office. The app says so.

**Privacy design:** every row belongs to one trainer and only that trainer can see or change it (database row-level security, tested). Other trainers, clients, other app users and
anonymous visitors cannot read it. Only people with a trainer profile can add rows, there are size limits per account, and deleting a trainer's account deletes it all.
The screens remind trainers to use first names or initials and not to store anything sensitive. The photos themselves are **not** uploaded; only a yes/no "photos submitted" mark is stored.

## 3. Body log (Progress tab, everyone)
**Where:** Progress tab, a new "⚖️ Body" segment next to Streaks and Challenges.

Weight, body fat and five body measurements with a chart and trends, units in kg/lb/stone and cm/in, a goal weight, CSV export, and **progress photos that stay only on the phone**
(never uploaded). Full details, privacy wording, what was tested and what was not: `docs/release/weight-log.md`.

**Extra steps for 1.0.1:** run `supabase/body_log.sql` in the SQL Editor (safe to run twice), and add the Body log wording to the privacy policy and App Privacy answers (see that document).
The camera and photo-library permission text changed, so this is part of the new build, not an over-the-air update. Not yet run on a real phone.

## What you need to do before submitting 1.0.1
1. **Run `supabase/trainer_tools.sql`** and **`supabase/body_log.sql`** in the SQL Editor (each is safe to run twice). Without it the Trainer Tools tab will show errors when a trainer opens it.
2. **Update the privacy policy and the App Privacy answers.** Trainers can now store personal details about their clients (a name or initials, a body weight, notes). That is data about third
   parties. Suggested policy wording (review before publishing):
   > **Trainer Tools.** Trainers can keep private notes about the people they coach: a name or initials, package and payment status, check-in dates, body weight and notes. This information is visible only to that trainer. It
   > is stored securely, is deleted when the trainer deletes their account, and is not shared with other users or used for advertising. Trainers are responsible for what they record about their own clients and should record only what they need.
   In App Store Connect > App Privacy, check that the existing answers cover **User Content** and **Health and Fitness** data being collected and linked to the user (the trainer) for App Functionality.
3. **App Review notes for 1.0.1:** mention the free guides, the Interval Clock, and Trainer Tools (visible only to a trainer account; give them a trainer demo login if reviewers need to see it).
   If you do not have a trainer demo account, create one first, otherwise reviewers will not see the section.
4. Look at it on a real phone (TestFlight): the clock vibrates, keeps the screen on, and speaks if voice is on; Trainer Tools open for a trainer and are absent for a normal user.

## What was tested
* Clock timing: 12 checks (phases, totals, catching up after a late tick, countdown cues, limits).
* Clock screen in a real browser: setup, presets, running, pause/resume, stop, custom steppers, rest timer.
* Trainer bookkeeping rules: 17 checks (dates, next check-in, overdue logic, totals, margins, money parsing and formatting, CSV safety).
* Trainer database rules in a real in-process Postgres: 12 checks (privacy between trainers, non-trainers refused, anonymous refused, ownership of check-ins, limits, value checks, cascade delete).
* Trainer Tools screens in a real browser with in-memory data: adding, editing and validating clients, check-ins and finance entries, totals updating, currency switch, month table.
* TypeScript passes; web and native bundles build.

**Not tested:** anything on a real phone; the Trainer Tools against the real database (needs the SQL run first); haptics, voice and keep-awake (they do nothing in a browser);
the Shop tab's trainer-only switch with a real trainer login; the share sheet for CSV export on a phone.
