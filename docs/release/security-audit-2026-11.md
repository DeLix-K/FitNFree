# Security audit, November 2026

Run 2026-11-08 on branch `security/audit-nov-2026` (from `release/1.0.1`, d4e55f4). Follows the October audit (`security/backend-fixes`, `supabase/security_hardening_*.sql`), which is already merged and live. **Nothing here is pushed, merged or deployed.** The honest framing: this reduces risk. No one can promise an app is "resilient to any cyber attack".

## What was checked, and the result

| Your list | Result | Evidence |
|---|---|---|
| Proper authentication | OK. Supabase Auth; email sign-in only, email confirmation required, no phone/social providers | Live `/auth/v1/settings`: `mailer_autoconfirm: false`, only `email` enabled |
| Hide API keys | OK in git. One local item to fix (see "Needs you") | History scan of all 154 commits, all branches: no `sk_live`, `sk_test`, `whsec_`, `sbp_`, `sk-ant`, private keys, AWS/Google/GitHub/Slack tokens. Only hits were code that strips `-----BEGIN PRIVATE KEY-----` from a string |
| Secure my database | OK | Anonymous reads of `profiles`, `oura_connections`, `merch_orders`, `trainer_orders`, `ai_history`, `ai_usage_log`, `friendships` all return 401 / 42501 on the live project. Every table in the SQL files has RLS enabled. No `security definer` function lacks `set search_path`. The only `using (true)` policies are public SELECTs on catalogue data (exercises, challenges, courses, products, trainer profiles, reviews) |
| Enforce HTTPS | OK | `http://` to the API returns 301 to https; HSTS set on API and the web app |
| Hash passwords | OK (not our code) | Supabase Auth stores bcrypt hashes; the app and functions never see or store a password |
| Validate forms server-side | OK for the functions reviewed | Types, lengths and counts checked in `ask-claude`, checkouts, `trainer-signup`; Postgres constraints and RLS behind them |
| Protect against XSS | OK | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in app code. Web build has a CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) |
| Log and monitor suspicious activity | Partial | Sentry is wired but dormant until a DSN is set (to-do). `ai_usage_log` records AI calls. No alerting on repeated failed sign-ins or webhook signature failures |
| Lock down admin routes | OK | `is_admin` is not user-writable (October audit). Admin-only functions are checked in SQL |
| Parameterised queries | OK | All data access is supabase-js / PostgREST (parameterised); no string-built SQL in app or functions |
| Check environment variables | One finding (below) | Only `EXPO_PUBLIC_` values reach the app: Supabase URL and anon key (public by design), USDA key (free public key), Oura client ID (public by design), Sentry DSN (public by design) |
| Rate limiting | Partial | `ask-claude` has per-minute and per-day ceilings enforced from a log users cannot write to. Checkout functions have none (see Findings) |
| Restrict CORS | OK | Every browser-facing function reflects only `ALLOWED_ORIGINS` or localhost, never `*` |
| Security headers | OK on web | HSTS, CSP, nosniff, frame-deny, referrer policy, permissions policy on the web app. The Supabase API host does not send CSP/frame headers (it serves JSON; not a browser page) |
| Session cookies / CSRF | Not applicable | The app uses bearer tokens in headers, not cookies, so classic CSRF does not apply. See the AsyncStorage finding for token storage |
| Password reset links expire | Cannot verify from code | Set in the Supabase dashboard (Auth > Email OTP expiry). Needs you to look; see "Needs you" |
| Restrict file uploads | OK | Photos are on-device only; Storage policies are folder-scoped (October audit); `ask-claude` caps images at ~6 MB and 8,000 characters of text |
| Verify prices and payment | OK, one hardening applied | Merch (read line by line): price re-fetched from Printful server-side. The other checkout functions create the Stripe session server-side too (structure checked, not each line re-read this round). Webhook verifies Stripe's signature. Hardening: now refuses to fulfil unless `payment_status` is paid |
| Disable production debug | Likely OK, not proven | EAS `production` profile builds a release app (no dev client), and Sentry code says it never runs in development. I did not inspect a built binary for debug flags |
| Update vulnerable dependencies | Done as far as it is safe | See "Dependencies" |
| Remove unused packages | Reviewed | Nothing clearly unused found. `base64-arraybuffer` and `react-native-url-polyfill` are used by the Supabase client path |
| Check for exposed files | OK | `credentials/` (ASC key, Play service account) is gitignored and was never in history. `.env` never committed. `docs/opportunity-radar/` etc. untracked |
| Scan Git history for leaked secrets | Clean | See "Hide API keys" |
| Revoke and replace compromised keys | One standing item | The Supabase access token pasted in chat on 2026-10-11 must be revoked (supabase.com/dashboard/account/tokens). Nothing in history needs rotating |
| Thorough security review | This document | |

## Changes made on this branch (all local, not pushed)

1. **Dependencies.** `npx expo install --fix` moved 11 packages to the exact versions Expo SDK 57 expects (expo 57.0.22 to 57.0.32, react-native 0.86.2 to 0.86.3, expo-camera, expo-image-picker, expo-linking, expo-location, expo-notifications, expo-sharing, expo-splash-screen, expo-updates, expo-video, @expo/metro-runtime). Then `npm audit fix` (non-breaking only). Audit went from **39 findings (1 critical, 11 high) to 32 (0 critical, 7 high)**. The critical one (`shell-quote`) is gone.
2. **`stripe-webhook`**: fulfilment (merch shipment, plan/course/product delivery, premium) now requires `payment_status` of `paid` or `no_payment_required`. Also handles `checkout.session.async_payment_succeeded` so delayed payment methods still complete. Signature failures and server errors no longer echo internal detail to the caller (still logged).
3. **`google-notifications`**: shared secret now compared in constant time; server errors no longer echo detail.

## Dependencies: what remains and why

* **7 high / 23 moderate / 2 low remain.** Every remaining high is in build and config tooling (`eas-cli`, `@expo/config-plugins`, `@xmldom/xmldom`, `node-forge`, `minimatch`, `tar`, `joi`, `nanoid`). They run on your computer or on EAS while building, not inside the shipped app. Nothing in `App.tsx`, `lib`, `screens`, `components` or `hooks` imports them.
* **Not verified by a bundle check:** the final proof (export the bundle and confirm those packages are absent) failed on this machine with a Windows file error (`EINVAL readlink` on a file under OneDrive in `node_modules`), so it proves nothing either way. Type check and all 13 test suites pass. Run the bundle export from a non-OneDrive copy or on EAS to close this.
* The remaining fixes npm offers are `npm audit fix --force`, which would **downgrade** `eas-cli` to 0.52.0 and `expo` to 53. That is wrong for this project, so it was not run.
* **"Update everything to latest" was not done, deliberately.** Expo pins each package to the version tested with SDK 57. Jumping to a newer major of React Native, expo-* or the Supabase client without a new SDK would break the build. Next real step: a planned SDK upgrade (SDK 58) as its own project once it is released and 1.0.1 is out.
* `@bacons/apple-targets` 5.0.0 (the widget/watch plugin) shows a moderate finding with no fix available. Build-time only.

## Findings NOT fixed (need your decision)

| # | Severity | Finding | Why not just fixed | Suggested fix |
|---|---|---|---|---|
| 1 | Medium | **Login token stored unencrypted on the phone.** `lib/supabase.ts` keeps the Supabase session in AsyncStorage. On a rooted/jailbroken phone or from a device backup it can be read | Needs a new native package (`expo-secure-store`), a migration so signed-in users are not logged out, and a new store build. It touches authentication | Store the session in the iOS Keychain / Android Keystore via SecureStore, in 1.0.2, tested on both platforms |
| 2 | Medium | **Account deletion does not cancel a Stripe subscription.** `delete-account` removes the user but a web (Stripe) subscriber could keep being billed | Touches billing and needs Stripe testing | Cancel the Stripe subscription (and Connect account where relevant) before deleting. Apple/Google subscriptions can only be cancelled by the user in their store, so the app should say so |
| 3 | Low-Med | **No rate limit on checkout functions.** `create-merch-checkout` makes up to 30 Printful calls per request | Needs a shared limiter table (database change) | Reuse the `ai_usage_log` pattern for a small per-user, per-minute cap |
| 4 | Low | **Android auto-backup is on** (Expo default `allowBackup: true`), so app data can be copied to Google Drive or via `adb backup` | Turning it off means a user's on-device Body log and settings are NOT restored when they change phones. That is a product decision | Either leave it (recommended: convenience wins for this data) or set `android.allowBackup` to `false` in `app.json` |
| 5 | Low | `oura-callback` trusts the `redirectUri` the app sends (Oura validates it against its registered list) and the OAuth `state` is generated but I did not confirm it is checked on return | Needs a device flow to test | Confirm state check in the Oura screen; low risk because Oura only links to the signed-in user |
| 6 | Low | Info leaks in other functions' error text (for example `Could not record order: <db message>`) | Many files, cosmetic | Replace with generic messages in a later pass |
| 7 | Low | YouTube WebView is not restricted to YouTube hosts | Deliberately skipped in October (could block consent redirects); needs a device test | Add `onShouldStartLoadWithRequest` allow-list after testing |
| 8 | Info | OTA updates are not code-signed (`updates.codeSigningCertificate`) | Needs a certificate, `app.json` change and a new native build | Worth doing before you rely on OTA for urgent fixes |
| 9 | Info | No alerting on repeated login failures or webhook signature failures | Needs Sentry/Supabase log alerts set up | Do after Sentry DSN is configured |

## Needs you (I cannot or must not do these)

1. **Local `.env` holds a real `ANTHROPIC_API_KEY`.** The app never uses it (it lives in Supabase secrets) but it sits in a OneDrive-synced folder and is loaded into every `expo` command. Delete that line from `.env`. If you ever pasted that file anywhere, rotate the key in the Anthropic console. I did not touch the file.
2. **Revoke the Supabase access token** pasted in chat on 2026-10-11.
3. **Supabase dashboard checks** (I have no safe access): Auth > Policies, "Leaked password protection" ON (Pro plan feature) and minimum password length; Auth > Email OTP expiry at 3600 seconds or less; Auth > Rate limits left at defaults or tighter; CAPTCHA (hCaptcha/Turnstile) on sign-up if you see abuse; "Enable MFA" if you want it for trainers.
4. **Stripe dashboard**: confirm which payment methods are enabled. The new webhook guard makes delayed methods safe, but you must add the event `checkout.session.async_payment_succeeded` to the webhook endpoint if you ever enable bank debits.
5. **Deploying the two function changes** (below) and running a Stripe test payment afterwards.

## How to ship these (order matters)

1. **Do not put the dependency bump into build 18.** It is already in TestFlight and being tested. Treat the bump as part of the next build (19), after the testing round, and test the app once more on a phone (camera, image picker, location, notifications, video are all touched).
2. The two function edits can go live without an app build: `npx supabase functions deploy stripe-webhook --project-ref fuhvcclwsbltqvribpsq --use-api --no-verify-jwt` and `... google-notifications ... --no-verify-jwt`. Then make one Stripe test payment (test mode) and confirm it still marks the order paid.
3. Merge this branch into `release/1.0.1` only with your explicit yes.

## What was tested, and what was not

| Tested | How |
|---|---|
| Type check clean after the dependency changes | `tsc --noEmit` |
| All 13 script test suites pass after the changes | `node scripts/test-*.mjs` |
| Both edited functions are syntactically valid | TypeScript transpile check |
| Live: anonymous database access refused; HTTPS redirect; HSTS; all 22 function endpoints reject callers without a real session (400/401, never 200) | HTTP probes with the public anon key |

| **Not** tested | Why it matters |
|---|---|
| The two edited functions have not run (not deployed, no Deno on this machine) | A mistake in the webhook would stop orders being marked paid. Test with a Stripe test payment after deploying |
| The app with the updated packages on any phone or simulator | Native packages changed; needs a build and a device test |
| The iOS/Android bundle export | Failed on a Windows/OneDrive file error unrelated to the code |
| Supabase dashboard settings, Stripe dashboard, Apple/Google console settings | No safe access; listed under "Needs you" |
| Penetration testing of the live API with real user accounts | Out of scope without test accounts; the October audit covered the main paths |
