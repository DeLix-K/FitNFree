# FitNFree 1.0: merge plan and release checklist

Prepared 2026-10-24. Nothing here has been done yet: no merge, no push, no release.

## Where things stand

* App Store Connect: iOS version **1.0 is Pending Developer Release** (release type **Manual**). Build **17** is attached and valid.
  The 9 October review submission is complete. The Premium Monthly subscription (`com.teamk.fitnfree.premium.monthly`) is Approved.
* Build 17 was built from branch `fix/app-review-round-3` (head `c6a69cd`). **That branch exists only on this computer.** It was
  never pushed to GitHub, so the exact source of the approved build has no copy anywhere else.

## Do first: back up the approved source

```
git push origin fix/app-review-round-3
git tag app-store-1.0-build17 c6a69cd
git push origin app-store-1.0-build17
```

Pushing a branch and a tag changes nothing on the live app or the store. It makes the approved build reproducible.

## The merge (dry run done, no conflicts)

Merge `fix/app-review-round-3` into `main` (5 commits: `a52c1e1` second-rejection fixes, `c4d8dc0` pre-purchase subscription
details, `8212bfb` subscription screen for subscribers, `f383110` AI consent + content reporting/filtering + accurate
permissions, `c6a69cd` restore location/motion keys).

Checked on a throwaway copy of the merge result (no branch was touched):

| Check | Result |
|---|---|
| Merge conflicts | None |
| TypeScript (`npx tsc --noEmit`) | Passes |
| Web export (`npx expo export --platform web`) | Builds |
| iOS permission keys (the ITMS-90683 trap): motion, location-always, location-when-in-use | Present through the `expo-location` plugin settings, with honest wording |
| Result compared with the approved commit `c6a69cd` | Differs only by `docs/documentation/*` and `vercel.json` (web security headers). **No app code differs** |
| `content_reports` table in the live database | Exists and is locked to the public (permission denied for the public key) |
| Privacy and terms pages the app links to | Both load (HTTP 200); privacy mentions Anthropic; terms mention cancellation |

There is no test or lint script in the project, so type check and web build are the automated checks available.

Suggested commands (do them from a clean checkout of `main`):

```
git checkout main
git pull
git merge --no-ff fix/app-review-round-3 -m "Merge fix/app-review-round-3: App Review fixes (approved as 1.0, build 17)"
git push origin main
```

Pushing `main` triggers the web app deploy on Vercel (fitnfree-lilac.vercel.app). The web app does not contain the native-only
changes, but it does include the new paywall and consent screens, so look at it after the deploy (see below).

### Order for the rest (each is a separate decision; none is needed to release 1.0)

All six held branches merge cleanly on top of the result above (checked). Suggested order for 1.0.1:

1. `security/backend-fixes` (includes `feature/ai-cost-controls`): server hardening. `security_hardening_after_app_update.sql` (trainer column grants) must be run only after an app build that uses `my_trainer_profile()` is live, or the shipped Trainers tab breaks. The round-3 DB hardening file is "not yet applied".
2. `feature/waitlist-signups`
3. `feature/content-library`, `feature/equipment-tutorial-videos`
4. `feature/home-redesign` (already contains the round-2 and round-3 commits)

Do not merge the security branch until you have decided to ship an update that goes with it.

## Pre-release checklist (before you press "Release This Version")

Store and account
- [ ] The version page shows build 17 and the correct screenshots, description, support URL and privacy URL.
- [ ] Availability: the countries you want are ticked; prices: UK £8.99, US $9.99 (equalised by Apple), check a couple of other storefronts.
- [ ] Banking, tax and Paid Applications agreement are active in App Store Connect (needed for the subscription to charge). Look for a banner.
- [ ] The App Review notes still hold a working demo sign-in for any re-review, and the demo account has Premium.

Product, on a real iPhone (TestFlight build 17)
- [ ] Fresh install, create a new account, finish onboarding.
- [ ] The subscription screen shows title, length, price and working Privacy and Terms links before purchase.
- [ ] Sandbox purchase works, Restore Purchases works, the screen changes to "subscribed" and shows how to cancel.
- [ ] AI consent screen appears before the first AI request, and the switch in Profile turns AI off.
- [ ] Report a post/trainer works (writes a row to `content_reports`), and a blocked word is filtered.
- [ ] Location and microphone prompts show honest wording; no background audio or location use.
- [ ] Delete account works (Apple requires it).

Backend (FitNFree Supabase project `fuhvcclwsbltqvribpsq`)
- [ ] Edge functions deployed and healthy: `verify-apple-purchase`, `apple-notifications`, `ask-claude`, `trainer-signup`, `merch-catalog`.
- [ ] In App Store Connect use **Request a Test Notification** and confirm the function accepts Apple's real signature (the new certificate-chain check is the likeliest thing to need adjusting).
- [ ] Anthropic API key has a spending limit set; the AI cost controls are only on the unmerged `feature/ai-cost-controls` branch, so until then set a hard monthly cap in the Anthropic console.
- [ ] Supabase email/auth settings: confirmations on, SMTP configured for real volume, site URL correct.
- [ ] Revoke the Supabase access token that was pasted into chat earlier.

Website and links
- [ ] https://delix-k.github.io/apps/fitnfree/privacy.html and terms.html load and are current.
- [ ] The FitNFree page on LixTeam-Site matches the store listing.

After the merge to `main` (web app on Vercel)
- [ ] Open fitnfree-lilac.vercel.app, sign in, open the paywall and AI features. The new security headers (CSP) were only tested on the login screen; if something fails, check the CSP first.

## Releasing

1. App Store Connect > FitNFree > iOS 1.0 > **Release This Version**.
2. Wait for "Ready for Sale", then search the store from a different account and install it.
3. Buy the subscription with a real (or Apple-provided) account once, then cancel it, to confirm the live path end to end.

## After release

- [ ] Watch for crashes (Xcode Organizer / TestFlight feedback) and the first reviews.
- [ ] Keep the `security/backend-fixes` and feature branches for 1.0.1; bump the version and build number for every new upload.
- [ ] Do not remove `NSMotionUsageDescription` / location-always keys from the `expo-location` settings (see the ITMS-90683 note).

## What I could not check

I cannot see Apple's Resolution Center messages, TestFlight results, the banking/tax agreements, store screenshots or availability
settings from here, or run the app on a device. Those items are yours to tick.
