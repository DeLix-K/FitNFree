# Workout reminders and the auto rest timer

Built on branch `feature/workout-reminders` (from `release/1.0.1`), 2026-10-27. **Not run on a real phone.** Nothing here touches the database.

## What it does

### Auto rest timer (Exercise page, "Log a Set" card)
* A new **Rest timer after each set** row: Off, 1:00, 1:30, 2:00, 3:00, 5:00. It is **Off by default**, so nothing changes for anyone until they choose a length. The choice is remembered on the phone.
* Log a set and a countdown bar appears at the top of the exercise page (stays in view while you scroll), with **+15s** and **Skip**. It is one shared timer, so it keeps counting
  if you move to another exercise; the bar shows on any exercise page. It ends with a vibration if the app is open.
* **Alert me when rest ends, even if the screen is locked** (phone app only, off by default): sends a *local* notification ("Rest over, ready for your next set"). Turning this on is when
  the phone asks for notification permission. +15s moves the alert, Skip cancels it.
* Time is kept as a finish time, not by counting ticks, so a late tick or a brief pause cannot make it drift.

### Workout reminders (Progress tab, Streaks, under "Log today's workout")
* Pick the days of the week and a time; the phone reminds you. Off by default. Turning it on is when the phone asks for notification permission.
* **Skipped on a day you have already trained** (a set logged, or "Log today's workout" on Streaks).
* Shows "Next reminder: tomorrow at 18:00", or says none is planned.
* Messages rotate between four friendly lines (no guilt). The same date always gets the same line.

## How it works, and why it is built this way
* **Local notifications only.** Nothing is sent from a server, no push token is requested, and the Apple Push entitlement stays stripped (`plugins/withoutPushEntitlement.js`). No new native module, permission
  string or background mode: `expo-notifications`, `expo-haptics` and AsyncStorage are already in the 1.0 app. I deliberately added **no background-audio or background mode** (Apple rejected 2.5.4 once).
* Reminders are planned **one day at a time for the next 14 days** and re-planned each time the app opens or comes to the front, and when a workout is logged. That is what makes "skip today if already trained" possible
  (a weekly repeating notification cannot skip one day). The price: **if the app is not opened for two weeks, the reminders stop.** The card says so. That is also kinder to people who have drifted away.
* Signing out cancels all reminders on that phone, so the next person to sign in on it is not reminded on someone else's behalf. They come back when the person signs in again.
* Reminders and rest settings are stored on the phone only (AsyncStorage), not in the account, so they do not follow someone to a new phone.
* If notification permission was refused, the toggles stay off and say how to turn it on; the in-app rest countdown still works without it.
* On the website, reminders and locked-screen alerts are not available (the card says so); the in-app rest countdown still works there.

## Things to say honestly
* **A reminder will not show while the app is open** (the app sets no foreground handler on purpose; the rest timer buzzes in-app instead).
* **Android timing:** I did not add the "exact alarm" permission (Google Play restricts it to alarm and calendar apps). Android may therefore deliver a notification a little late, especially when the phone is dozing.
  For a 60 to 90 second rest timer that could be noticeable. Worth checking on a real Android phone.
* **iPhone:** if the app is force-quit, scheduled local notifications still fire, but a missed reminder cannot be re-planned until the app is opened again.
* Only logging a set or the Streaks day counts as "trained today". An outdoor activity, Interval Clock session or a plan completed some other way does not (yet) cancel today's reminder.
* Changing the rest length or the alert switch mid-rest applies from the next set, not to the rest already running.

## Before this ships
1. Nothing to run in Supabase and no new native code, so it rides the 1.0.1 build (or an over-the-air update to 1.0 if ever needed).
2. **Privacy policy:** no new data is collected. A line like: "Workout reminders and the rest timer use notifications scheduled on your phone. Your reminder settings are stored only on your device."
3. **TestFlight (iPhone) and a real Android phone:** turn on reminders (permission prompt appears then, not before); set a time two minutes ahead and lock the phone; confirm it arrives; open the app and confirm today's is
   skipped after logging a set; set a 1:00 rest with the alert on, lock the phone, confirm "Rest over" arrives about a minute later; sign out and confirm no reminder arrives; refuse permission and confirm the toggles explain it.

## What was tested, and what was not
| Tested | How |
|---|---|
| Planning the reminder times: chosen weekdays, 14-day window, drop a passed time, drop today when trained, month and year end, clocks changing, ids, message per date; rest settings, countdown rounding, +15s and its cap, formatting | `node scripts/test-reminders.mjs` (14 checks) |
| Both screens in a browser at phone width, pretending to be a phone, with a fake notification API that records what the app asks for: log a set starts the countdown, +15s, Skip, a rest running out on its own (bar clears, alert cancelled), alert scheduled for the right length on the right channel and moved by +15s, settings remembered, reminders planned for the right days at the right time, changing the time re-plans, logging a set removes today's, today's returns if not trained, permission refused (nothing scheduled, message shown, toggle stays off) for both reminders and the rest alert, deselecting every day switches reminders off | temporary harness (not committed) |
| Type check, and the web, iOS and Android bundles build | `tsc --noEmit`, `expo export` |

| **Not** tested | Why it matters |
|---|---|
| Real notifications arriving on an iPhone or Android phone, with the screen locked, in Doze, after a force-quit | The scheduling calls follow the SDK 57 docs and typings but have never run on a device. This is the main risk. |
| The vibration at the end of a rest | Haptics do nothing in a browser. |
| Notification permission prompts and the "denied" state on a real phone | Faked in the harness. |
| Sign-out clearing reminders, and re-planning when the app returns to the front | Wired in `App.tsx` and `lib/workoutReminders.ts`; not exercised end to end. |
| Screen readers, large text, small phones | Labels are set; nothing was checked with VoiceOver or TalkBack. |
