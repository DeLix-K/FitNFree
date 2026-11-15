# App Review notes for 1.0.1

Drafted 2026-11-08. Paste the block under "Paste this" into App Store Connect > the 1.0.1 version > **App Review Information > Notes** (limit **4,000 characters**; this block is measured, see the end). Set up the three accounts first, then replace the two password placeholders (`<SANDBOX1_PASSWORD>`, `<SANDBOX2_PASSWORD>`). **Type the passwords into App Store Connect yourself; do not paste them into chat or into this file.**

## What you must prepare before pasting (I cannot do these)

| # | Account | What it needs | Why a reviewer needs it |
|---|---|---|---|
Decided 2026-11-12: **three accounts**, one account can play two roles.

| # | Account | Role | What it needs | Why a reviewer needs it |
|---|---|---|---|---|
| 1 | `teamlixpro@icloud.com` (already in App Store Connect) | **Main demo, Premium**, and a friend of account 3 | Premium on. Friends switched ON, request to account 3 accepted. One logged workout and one body-log weight, so Streaks, Records, Body and the widget are not empty | Premium, Body, Records, Streaks, Coach, export, Friends |
| 2 | `teamlix6sandbox1@gmail.com` | **Trainer** | Registered as a trainer (Shop > Trainers > become a trainer). A check-in form (Trainer Tools > Forms) and one invite code that account 3 uses | Without a trainer profile, Trainer Tools does not appear |
| 3 | `teamlix6sandbox2@gmail.com` | **Client** and a friend of account 1 | Linked to account 2 by typing its code. One check-in sent and one trainer reply. Friends ON, friends with account 1, one logged workout | Shows My coaching check-ins and the Friends feed with data in them |

Earlier I wrote that four accounts were the minimum. That was wrong: Friends needs two accounts and check-ins need two, and account 3 sits in both pairs, so three are enough. Apple's reviewers rarely have time for setup, so anything they must create themselves tends to be reported as "feature not found".

Passwords: type them into App Store Connect yourself. Never paste them into chat or into this file.

Also **attach**: a short screen recording on a real iPhone showing Friends (request and accept), a check-in being sent and read, and the Apple Watch screen. Apple reads recordings faster than text, and a recording is the best protection if the watch app is hard for them to see.

## Paste this

```
VERSION 1.0.1 adds features only; the subscription, AI-consent and moderation behaviour approved in 1.0 (build 17) are unchanged.

ACCOUNTS (sign in on the login screen)
1. Main demo, Premium: the sign-in fields above. Friends with account 3.
2. Trainer: teamlix6sandbox1@gmail.com / <SANDBOX1_PASSWORD>. Has a trainer profile, so Shop > Trainer Tools shows. Linked to account 3.
3. Client and friend: teamlix6sandbox2@gmail.com / <SANDBOX2_PASSWORD>. Linked to the trainer, with a check-in and reply already there. Already friends with account 1, with updates in the feed.

WHERE TO FIND EACH NEW FEATURE
- Body log: Progress > Body. Weight, body fat and measurements are saved to the account (visible only to the user). Progress photos stay on the phone and are never uploaded.
- Records: Progress > Records. Personal records, worked out on the phone.
- Friends: Progress > Friends. Off until the user switches it on. Opt-in both ways, requests must be accepted. Only display names are shown; there are no posts or comments.
- Reminders and rest timer: Progress > Streaks. Local notifications only; no remote push, no background modes.
- Interval Clock: Coach tab > Coach Dashboard > Interval Clock. Haptics and optional voice; no background audio.
- Coaching check-ins: client side at More > Profile > My coaching check-ins; trainer side at Shop > Trainer Tools > Forms. A client links by typing a one-time code the trainer creates.
- Export my data: More > Profile > Export my data (JSON or CSV through the share sheet; nothing is uploaded).
- Free guides: Shop > Guides & Plans. Free items only ("Get free"), no purchase, so 3.1.1 does not apply. Courses are not offered on iOS.
- Widget (iOS 17): long-press the home screen > + > FitNFree > Streak. Shows streak numbers only. Open the app signed in first.
- Apple Watch app (watchOS 10): shows streak and this week, and a "Log today's workout" button that asks the iPhone to log it. It needs the iPhone app signed in, has no internet access of its own, and uses no HealthKit, workout sessions or background modes.

GUIDELINE 1.2 (user content)
- Friends: Block and Report on every friend (Progress > Friends). Blocking ends the friendship and hides both people from each other.
- Check-ins: private between a trainer and a client who chose to link. The client can Stop sharing, delete check-ins and Report the trainer (More > Profile > My coaching check-ins). The trainer can Report or Stop each linked client (Shop > Trainer Tools > Forms > Clients). Trainer chat keeps Report and Block (Shop > Trainers > a trainer > Chat).
- Names and bios are filtered. Reports reach the team; contact teamlix6@gmail.com.

UNCHANGED FROM 1.0
- Premium is the only digital purchase on iOS (In-App Purchase, com.teamk.fitnfree.premium.monthly). Subscription details and links: More > Profile > FitNFree Premium. Merchandise and live trainer sessions use Stripe (3.1.3(e), 3.1.3(d)).
- AI (Anthropic): permission is asked before any data is sent and can be withdrawn at More > Profile > AI data sharing. Labelled not medical advice.
- Account deletion: More > Profile > Danger Zone > Delete My Account (it does not cancel an App Store subscription; the screen says so).
- Location is used only while the app is open, for optional outdoor tracking.
- Services: Supabase, Anthropic, Apple IAP, Stripe, Printful, Oura (optional), USDA FoodData Central, Open Food Facts, YouTube.
```

## Checked against the code (so a reviewer does not find a mismatch)

| Statement | Where it was verified |
|---|---|
| Friends has Block and Report on each friend | `screens/FriendsScreen.tsx` (Block with confirm, `ReportContentButton`) |
| Client can Stop sharing, delete a check-in, and Report the trainer | `screens/CoachingScreen.tsx` lines 73, 86, 166 |
| "My coaching check-ins" and "Export my data" rows in Profile | `screens/ProfileScreen.tsx` lines 455, 459 |
| Widget is called "Streak" under FitNFree; iOS 17; watchOS 10; no HealthKit or background modes | `targets/widget`, `targets/watch`, `docs/release/watch.md` |
| Everything under "UNCHANGED FROM 1.0" | The notes Apple already accepted for build 17 (read from App Store Connect, 2026-11-08) |

## Things that may still trip a reviewer (honest list)

1. **The paths are from the docs and code, not from walking through a TestFlight build.** Before pasting, open build 18 (or 19) and follow each path in this block once. Any path that is off by one tab is the usual cause of "feature not found".
2. **The Apple Watch app has never run on a watch.** If it fails in TestFlight, delete the Watch bullet, or the build may be rejected under 2.1 (app completeness). The recording is your evidence.
3. **Trainer side of check-ins:** a Report button now sits next to Stop on every linked and ended client (added after this draft was first written; it is in code on `release/1.0.1` but NOT in build 18, so it needs build 19). A trainer never learns a client's account id, so the report names the link; you look the person up with `select client_user_id from trainer_client_links where id = '<uuid>'` in the SQL Editor. **The notes above say the trainer can Report a client, so submit build 19 or later (build 18 does not have the button). If you ever submit build 18, delete that sentence.**
4. **Free text between people exists in two places:** trainer chat (already approved in 1.0) and check-in answers/feedback (new). Both are private 1:1. The notes say so.
5. **The privacy policy and App Privacy answers must be updated first** (`docs/release/privacy-1.0.1.md`). Reviewers compare them against the notes.
6. **What's New text and Apple Watch screenshots** are separate fields and are not covered here.
7. **No Sentry, no HealthKit, no Apple Health sync in 1.0.1.** The notes do not mention them. If you later add Sentry or Health sync, update both the notes and App Privacy.

## Length

The "Paste this" block is **3,415 characters** with the two password placeholders unfilled (limit 4,000). Real passwords add roughly 30 to 50, so there is room.
