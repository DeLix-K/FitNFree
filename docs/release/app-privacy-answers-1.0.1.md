# App Privacy answers for 1.0.1 (form-ready draft)

Drafted 2026-11-11. App Store Connect > the app > **App Privacy** > Edit. This is the same content as section 2 of `privacy-1.0.1.md`, rewritten in the order Apple's form asks, with the open "Check" row decided. **There is no API for this form, so I could not read what is in it now. Compare each answer by eye and change only what differs.** Not legal advice. Re-verified 2026-11-11: production builds still have no Sentry address set, and the app has no advertising or analytics SDK (the only analytics-style package, Sentry, is inactive).

## Step 1: Do you or your third-party partners collect data from this app?

**Yes.**

## Step 2: Data types (tick exactly these)

For **every** type below: **Linked to the user = Yes**, **Used to track you = No**, **Purpose = App Functionality only** (do not tick Analytics, Advertising, Personalisation, or Other purposes).

| # | Apple category | Data type | Tick | What it is |
|---|---|---|---|---|
| 1 | Contact Info | **Email Address** | Yes | Account sign-up and sign-in |
| 2 | Contact Info | **Name** | Yes | Display name; name on merch orders |
| 3 | Contact Info | **Physical Address** | Yes | Merch shipping address, stored with the order |
| 4 | Health & Fitness | **Health** | Yes | Weight, body fat, measurements, sleep, mood, check-in answers, Oura data if connected |
| 5 | Health & Fitness | **Fitness** | Yes | Workouts, sets, streaks, challenges, distance and pace |
| 6 | Location | **Precise Location** | Yes | Outdoor activity routes, saved to the account; foreground only |
| 7 | User Content | **Photos or Videos** | Yes | Scan photos and form-check or trainer videos. Progress photos are NOT collected: they stay on the phone |
| 8 | User Content | **Other User Content** | Yes | AI Coach chats, journal notes, trainer messages, check-in text, reports |
| 9 | Identifiers | **User ID** | Yes | Account ID, also used for Friends and trainer links |
| 10 | Purchases | **Purchase History** | Yes | Premium status, orders, enrolments |
| 11 | Usage Data | **Product Interaction** | **Yes** (decided) | The app counts each user's AI calls for the daily limit. Declaring it is the safe direction: over-declaring never causes a rejection, under-declaring can |

## Step 3: Leave these as "Not collected"

Contacts, Browsing History, Search History, Financial Info (card details never reach you: Apple, Google and Stripe handle them), Sensitive Info, Device ID and Advertising Data, Audio Data (see the check below), Other Diagnostic Data, **Crash Data** (No for now), Performance Data, Coarse Location, Emails or Text Messages, Gameplay Content, Customer Support, Other Data.

## Tracking

**"Do you use data for tracking?" No**, for everything. There is no advertising or analytics SDK, no advertising identifier, and health data is never used for advertising (Guideline 5.1.3).

## Two things to check yourself

1. **Audio Data = No** assumes voice commands are turned into text by Apple's speech service on the phone and your servers receive only the text. Videos you upload may contain sound, and those are already covered by "Photos or Videos". If you ever send raw voice recordings to your own server or to the AI provider, add Audio Data.
2. **Crash Data**: if you later set `EXPO_PUBLIC_SENTRY_DSN` for production, change Crash Data to Yes (not linked, not tracking, App Functionality or Analytics) **in the same release**, and add the policy paragraph from `sentry-setup.md`.

## What this form must match

* The privacy policy page (`privacy-1.0.1.md`, branch `fitnfree-privacy-1.0.1` in `DeLix-K/apps`): publish it just before you submit.
* The build's privacy manifests (no tracking, tracking domains empty): already checked in build 19.
* App Review notes (`app-review-notes-1.0.1.md`).

## Not tested

The form itself (no API), how Apple's current wording labels each box, and legal sufficiency. Treat the table as a checklist to compare against the live form, not as proof.
