# FitNFree — App Store / Play Store Listing Copy

Drafted 2026-09-06, for the first-time listing under the new name/bundle IDs
(`com.teamk.fitnfree` iOS / `com.fitnfree.app` Android). Character counts are
for the strictest of the two stores' limits on each field — verify against
the current console limit before submitting, since these change occasionally.

## App name
**FitNFree** (8 chars — well under iOS's 30 / Android's 30)

## iOS Subtitle (App Store Connect field, 30 char max)
```
AI Coach, Workouts & Wellness
```
(29 chars)

## Android Short description (Play Console field, 80 char max)
```
Your all-in-one AI health companion: workouts, nutrition, sleep & recovery.
```
(76 chars)

## iOS Keywords (comma-separated, 100 char max total)
```
workout,fitness,nutrition,ai coach,sleep tracker,habit tracker,wellness,gym,trainer,meal tracker
```
(~96 chars)

## Full description (both stores, 4000 char max — this one is ~1750)
```
FitNFree is your AI Health Companion — one app that adapts your workouts,
nutrition, sleep, and recovery guidance to how you're actually doing, instead
of making you juggle four separate apps.

TRAIN
• Home, gym, and outdoor workout plans, built around the equipment you have
• Point your camera at your gym equipment and get an instant workout built
  around it
• Photo-based form check on your lifts
• Real streaks, milestone badges, and weekly targets you set yourself
• Squad challenges, quests, and leaderboards to stay accountable with others

EAT
• AI-powered food search with real nutrition data (USDA-backed)
• Snap a photo of a meal for an instant calorie/macro estimate
• Personalized daily calorie and protein targets based on your own stats

YOUR AI COACH
• A daily briefing that reads your real sleep, mood, and streak data and
  adapts a plan for today
• Post-workout insights based on your actual logged activity — no invented
  claims, just your real trends
• Talk to your Coach by voice, and have it read replies back to you
• Pick a coach personality: Encouraging, Strict, or Data-Focused

SLEEP & RECOVERY
• Manual sleep logging or automatic sync via Oura Ring
• A Daily Readiness Score, sleep hypnogram, and sleep debt tracking
• Wind-down tools: breathwork, ambient sound (rain/pink/brown noise),
  binaural beats, and AI-generated calming bedtime stories

WELLNESS & HABITS
• Daily mood check-ins with optional AI reflection
• A forgiving habit tracker with streak freezes instead of punitive resets
• A free, no-paywall grounding tool for in-the-moment stress

LEARN & CONNECT
• Buy custom training plans directly from real trainers
• Paid courses with progress tracking and completion certificates
• Official FitNFree merch, shipped to your door

FitNFree is free to start, with 5 AI actions a day. Go Premium for unlimited
AI coaching, deeper insights, and extra streak protection.

FitNFree's AI Coach is not a doctor, therapist, or licensed trainer — it's a
supportive tool, not a substitute for professional medical, mental health,
or fitness advice.
```

## App Privacy (iOS) / Data Safety (Android) — data types actually collected
Reference for filling out each store's privacy questionnaire. Reflects what
the app genuinely does today (per `app.json` permissions and the Edge
Functions/tables that exist) — update this list if data collection changes.

| Data type | Collected? | Purpose | Linked to identity? |
|---|---|---|---|
| Email address | Yes | Account creation / auth | Yes |
| Health & fitness (workouts, sleep, mood, habits) | Yes | Core app functionality | Yes, private per user (RLS) |
| Photos (camera/library) | Yes, on-device use only unless submitted for AI scan | Equipment scan, food scan, form check | Sent to AI provider per-request, not stored by the app beyond scan history |
| Precise location | Yes, if granted | Outdoor activity tracking | Yes |
| Audio (microphone) | Yes, if granted | Voice input to AI Coach (on-device speech recognition) | Not stored as audio |
| Payment info | Yes, via Stripe Checkout | Subscriptions, marketplace/merch/course purchases | Handled entirely by Stripe; the app never sees full card details |
| User ID | Yes | Auth, RLS-scoped data ownership | Yes |
| Third-party wearable data (Oura) | Optional, only if user connects | Sleep/readiness sync | Yes, only for the connecting user |

**Data not sold to third parties.** No advertising SDK is integrated (no ad
data collection). Data deletion: self-service account/data deletion is
already built into the app (Profile → Delete Account).

## Support / Marketing URLs
Placeholder — fill in once you have a domain or support inbox for FitNFree:
- Support URL: _(none yet — no domain purchased)_
- Marketing URL: _(optional, none yet)_
- Privacy Policy URL: **required by both stores before submission** — you'll
  need to host one; ask me if you want a draft privacy policy written next.
