# Privacy paperwork for 1.0.1

Drafted 2026-11-08. Three pieces: (1) the privacy policy page, (2) the App Store Connect "App Privacy" answers, (3) what to check before you publish. **This is a draft from reading the code and the feature docs, not legal advice.** Nobody has verified it against the live App Store Connect form (there is no API for it) or against a lawyer.

## 1. Privacy policy page (already edited, not published)

File: `fitnfree/privacy.html` in the `DeLix-K/apps` repo (the page the app links to: `https://delix-k.github.io/apps/fitnfree/privacy.html`). Edited on local branch `fitnfree-privacy-1.0.1`, **not pushed, so the live page is unchanged.** Effective date in the draft is November 8, 2026; change it to the day you actually publish.

What changed, and what it matches:

| Added or changed | Matches |
|---|---|
| Body log (weight, body fat, measurements) stored in the account, visible only to the person | `body_log` table + row-level security |
| **Progress photos stay on the device**, never uploaded, not sent to AI; lost if the app is deleted | `docs/release/weight-log.md` |
| Personal records and badges worked out on the phone, not stored | `lib/prBadges.ts` |
| Export my data (Profile) | `docs/release/data-export.md` |
| Reminders and rest timer are local notifications; settings stay on the device; no server push | `docs/release/workout-reminders.md`, `plugins/withoutPushEntitlement.js` |
| Widget and Apple Watch: streak numbers only, between the user's own iPhone and watch, watch has no network, signing out clears them | `docs/release/widget.md`, `docs/release/watch.md` |
| Coaching check-ins shared only with the linked trainer, stoppable, deleted with the account; trainer messages | `docs/release/client-checkin-forms.md`, `supabase/trainer_messaging.sql` |
| Friends: opt-in, request and accept, only display name shown, no posts, block and report, leave deletes everything | `docs/release/friends-feed.md` |
| Trainer profile is visible to other users | `trainer_profiles` readable by everyone (`schema.sql`) |
| Location: foreground only, and **the route is saved to the account** (the old text did not say routes are stored) | `outdoor_activities.sql` (`route jsonb`), `app.json` |
| **Payments: Apple and Google handle Premium bought in the app; Stripe handles web, courses, products, merch, trainer plans** | The old page said only Stripe. That was out of date for build 17 already (the app sells Premium through Apple In-App Purchase, `lib/iap.ts`). Added Apple and Google to the providers table |
| "Beyond the providers above, data is shared with other people only when you choose" | The two sharing features |

**Deliberately NOT added: crash reporting (Sentry).** Production builds do not have `EXPO_PUBLIC_SENTRY_DSN` set (checked: the production EAS environment has only the Oura client ID, Supabase URL and anon key, and the USDA key), so the app sends no crash reports today. Add the paragraph in `docs/release/sentry-setup.md` and the "Crash Data" label **at the same time** as you set that variable, not before. If you set it and forget the paperwork, the policy and the App Privacy answers will be wrong.

## 2. App Store Connect > App Privacy answers

Target state for 1.0.1. **Compare each row with what is in App Store Connect now** and change only what differs. A mismatch between these answers and the app is a common rejection reason.

For every row: **Linked to the user = Yes**, **Used for tracking = No**, **Purpose = App Functionality** (unless noted).

| Apple category | Data type | Collected? | What it is in FitNFree |
|---|---|---|---|
| Contact Info | Email Address | Yes | Account sign-up |
| Contact Info | Name | Yes | Display name (optional); name on merch orders |
| Contact Info | Physical Address | Yes | Merch shipping address (collected by Stripe, passed to Printful to ship). Skip only if Stripe's collection is all you consider "collected" by you; we do store it in `merch_orders` |
| Health & Fitness | Health | Yes | Weight, body fat, measurements, sleep, mood, check-in answers, Oura data if connected |
| Health & Fitness | Fitness | Yes | Workouts, sets, streaks, challenges, routes' distance and pace |
| Location | Precise Location | Yes | Route of outdoor activities, saved to the account. Foreground only |
| User Content | Photos or Videos | Yes | Photos for equipment, meal and menu scans and form-check videos, sent to the AI provider; trainer profile photos and videos. **Progress photos are NOT collected (they never leave the phone)** |
| User Content | Other User Content | Yes | AI Coach conversations, journal notes, trainer messages, check-in text, reports about content |
| Identifiers | User ID | Yes | Account ID; also used for the friends and trainer features |
| Purchases | Purchase History | Yes | Premium status, orders, enrolments |
| Usage Data | Product Interaction | Check | AI call counts are logged per user for the daily limit (`ai_usage_log`). Declare it if you consider that product interaction; it is linked and used for App Functionality |
| Diagnostics | Crash Data | **No, for now** | Only becomes Yes (not linked, not tracking) when Sentry is switched on |
| Contacts, Browsing History, Search History, Financial Info, Sensitive Info, Other Data | | No | Not collected. Card details never reach us (Apple, Google and Stripe handle them). Nutrition search text goes to USDA with no account data, and is not stored against the account |

"Data used to track you": **No** for everything. The app has no advertising or analytics SDK, and health data is never used for advertising (Guideline 5.1.3).

Third-party processors: Apple does not treat sending data to a service provider acting on your behalf (Supabase, Anthropic, Stripe, Printful) as "tracking", but those flows are still part of "collected" above.

## 3. Check before you publish

1. **Read the edited policy yourself**, once, start to finish. It is your legal statement.
2. **Two sentences I could not fully verify against the live app**: "we do not send you push notifications from a server" (true as built: push is removed, but confirm no server-sent push is planned for 1.0.1) and "trainer profile photos and videos visible to other users" (check what the trainer profile screen actually shows).
3. **Publish order**: the page becomes live the moment it reaches `main` of `DeLix-K/apps` (GitHub Pages). Publish it just before you submit 1.0.1, so the live policy matches the version in review. It is harmless to publish earlier, but the new features will not be in users' hands yet.
4. **Recommended extras for a UK/EU audience** (not added, because they are legal wording, best checked with a solicitor or a template you trust): who the data controller is (a legal name and address, not just "Team K"); the legal basis for processing, and explicit consent for health data (special category data under UK GDPR); retention periods; the right to complain to the ICO; and international transfer safeguards (Supabase, Anthropic and Stripe are US-based). The contact email is a personal Gmail address; a LixTeam address would look more professional and keep your personal inbox out of a legal document.
5. **Account deletion page** (`fitnfree/delete-account.html`) was not changed. Check that it still matches: deletion now also removes body log rows, check-ins, links, friendships, updates and cheers (all cascade from the account).
6. **Support URL and Privacy Policy URL** in App Store Connect must point at the live page (`app.json` has both). Nothing to change.

## What was tested, and what was not

| Tested | How |
|---|---|
| The edited page is well-formed HTML (no unclosed or mismatched tags) | Python HTML parser |
| Each new statement traces to the code or to a feature doc (table above) | Read the sources |
| Production builds send no crash reports | `eas env:list` for the production environment (variable names only) |

| **Not** tested | |
|---|---|
| The page in a browser, and on GitHub Pages | Not published |
| Any of the new features on a phone or on the real database; the policy describes them as designed and tested in code |  |
| The current App Store Connect App Privacy answers | No API; you must compare by eye |
| Legal sufficiency | Not legal advice |
