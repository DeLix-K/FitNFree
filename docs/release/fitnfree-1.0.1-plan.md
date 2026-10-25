# FitNFree 1.0.1: plan

Prepared 2026-10-25. Planning only: no code written, nothing built or submitted.
Branch to create: `release/1.0.1` from `main` (which now contains the approved 1.0 source, tag `app-store-1.0-build17`).

**Before any coding:** `AGENTS.md` says this project uses Expo SDK 57 and that Expo has changed. Read the versioned docs at
https://docs.expo.dev/versions/v57.0.0/ for each Expo package below before writing code.

## Scope

### A. Free items in the Shop (iPhone and Android)
Decision made: show only the **free** items; keep paid ones hidden until in-app purchase exists.
Live data on 2026-10-24: Courses = 3, all paid (so the Courses section stays hidden); Guides & Plans = 11, of which 4 are free (price 0).
* App: when not on web, the Guides & Plans list filters to `price_cents === 0`; relabel the section "Free Guides"; Courses stays hidden unless a free course exists.
  Files: `screens/ShopScreen.tsx`, `screens/DigitalProductsScreen.tsx`, `lib/storeRules.ts`, `lib/digitalProducts.ts`.
* Server: a free item cannot go through Stripe (£0). Add a **claim** path: an RPC or Edge Function that grants ownership of a product
  to the signed-in user **only if** its price is 0 (verified on the server, never from the client), is idempotent, and is rate limited.
  Reads of the content already depend on an "owned" row, so claiming creates that row.
* UI: "Get free" button instead of "Buy"; never show a price that implies payment.
* Test: a paid item cannot be claimed (try it directly against the function); a free item can; claiming twice does not duplicate.
* App Review notes: say these are free items with no purchase, so guideline 3.1.1 does not apply.

### B. Crash and error reporting
* Add Sentry (`@sentry/react-native`, with its Expo config plugin) or an equivalent. Capture JavaScript errors and native crashes; no
  personal data in events (strip user email, AI prompts and meal or health data from breadcrumbs).
* Needs from you: a Sentry account and project; the DSN (public, fine in config); an auth token stored as an **EAS secret** for source-map upload.
* **App Store paperwork:** crash and performance data collection changes the **App Privacy** answers in App Store Connect
  (Diagnostics: Crash Data, Performance Data) and the privacy policy page. Update both before submitting 1.0.1.
* Also set up Supabase log alerts and an uptime check on the web app.

### C. Over-the-air updates
* Add `expo-updates` with EAS Update: `runtimeVersion` policy, an update channel per release, and the update URL in `app.json`.
  This is a native change, so it ships inside the 1.0.1 binary. After that, JavaScript-only fixes can go out without App Review.
* Rules: OTA may not change the app's primary purpose or add features that would need review (Apple guideline 3.3.2 / 2.5.2).
  Native changes (new permissions, new native modules) still need a new build and review.
* Always test an update on a preview channel first, and keep a rollback (republish the previous update).

### D. AI cost controls
* Merge `feature/ai-cost-controls` (shared response cache plus a cheaper model for routine calls). It is already contained in
  `security/backend-fixes`, so merge those two together rather than separately.
* Apply `supabase/ai_response_cache.sql` if it is not applied yet (check the live database first).
* **You:** set a monthly spending limit in the Anthropic console now, independent of the code.
* Add a simple weekly cost check: count rows in `ai_history` by day and compare with the Anthropic invoice.

### E. Content-report alert
Reports already land in `content_reports`. Add an alert so someone reads them promptly (Apple expects timely action):
* A scheduled Edge Function (daily, plus immediately for the first report of a day) that emails you a digest of unread reports.
* Needs from you: an email sending service (for example Resend or Postmark) and the address to notify. Alternative with no new service:
  a saved Supabase query you check daily (less reliable).
* Add a `reviewed_at` and `action` column so handled reports drop off the list.

### F. Your "little addition"
Not described yet. Add it here once defined, with its size and any review risk.

## Housekeeping that rides along
* Merge `security/backend-fixes` (includes AI abuse ceilings and trainer-data tightening) once the 1.0.1 binary is live, then run
  `security_hardening_after_app_update.sql` (trainer column grants) **only after** an app version that uses `my_trainer_profile()` is live.
  The round-3 DB hardening file (e7f11fe) is still not applied. Review and apply it separately.
* Database: after launch, run Supabase's performance advisor and add indexes where it flags them; set a retention rule for old `ai_history`.
* Stripe in live mode (separate checklist: `stripe-go-live.md`): Connect platform profile, database clean-up of Sandbox ids, Printful check, merch and trainer tests, then Test B.
* Currency: trainers, courses and guides are charged in USD in code. Decide whether UK customers should see GBP (code change).
* Move Supabase to **Pro** before promoting the app (backups, no pausing, headroom).
* Support: a support inbox, a short FAQ, and the support URL in the store listing.

## Process
1. Branch `release/1.0.1` from `main`. Bump `version` to `1.0.1` in `app.json` (build numbers increment on every upload).
2. Build in this order, committing after each: A (Shop), C (OTA), B (crash reporting), D (AI), E (alert). Run `npx tsc --noEmit` and a web export after each.
3. Check the generated Info.plist still has the motion and location keys (the ITMS-90683 trap).
4. Build with EAS (`production` profile). Check the build log says the environment variables loaded, and that the build appears in
   App Store Connect (a silently dropped build is the failure to watch for).
5. TestFlight pass on a real iPhone: new account, free guide claim, paywall unaffected, crash test event appears in Sentry, an OTA test update arrives.
6. Update App Store Connect: What's New text, App Privacy answers (B), review notes (A, C), screenshots only if the UI changed.
7. Submit. Expect 1 to 3 days. Release manually after approval.

## Decisions
Decided 2026-10-25:
1. Crash reporting provider: **Sentry**.
2. Email service for the report alert: **Resend** (notification address still to be given).
3. Supabase **Pro** upgrade: **approved**. The upgrade itself is done by you in the Supabase dashboard (billing).

Still open: what the "little addition" is, and the address that should receive report alerts.

## Accounts and keys you need to create (nothing is created yet)
* **Sentry:** a project for React Native named FitNFree. Share only the **DSN** (it is public by design). The **auth token** (for source maps) goes
  into EAS secrets, never into chat or the repository. Turn off collecting IP addresses and set data scrubbing on.
* **Resend:** an account and an API key (secret: store it only as a Supabase Edge Function secret, `RESEND_API_KEY`). Without a verified sending
  domain Resend can only send from its test sender to your own account email, which is enough for alerts to yourself.
* **Supabase Pro:** Organization settings > Billing > upgrade the organisation that owns the FitNFree project.

## Risks
* Each new native module (Sentry, expo-updates) can break an upload or review if configured wrongly. Mitigation: one change at a time, TestFlight before submission.
* The App Privacy answers must match what the app really collects once Sentry is added. A mismatch is a common rejection.
* Free-item claiming must be enforced on the server, or paid content could be taken for free.
