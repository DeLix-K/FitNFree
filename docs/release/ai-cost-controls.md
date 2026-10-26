# AI cost controls: what exists, where it runs, and what you still do

Merged into `release/1.0.1` on 2026-10-26 (merge of `security/backend-fixes`, which already contained `feature/ai-cost-controls`).

## What the controls are
| Control | Where | Effect |
|---|---|---|
| Response cache | `supabase/ai_response_cache.sql`, `supabase/functions/ask-claude/index.ts` | A "routine" one-shot call (nutrition lookup, per-exercise cue, equipment/food/menu photo identification) is answered from a shared cache if someone already asked the same thing. No Anthropic call is made on a hit. |
| Cheaper model | `ask-claude` | Routine calls that miss the cache use `claude-haiku-4-5-20251001` instead of the full model. |
| Free daily limit | `ask-claude` | Free users: 5 AI calls a day, checked on the server. |
| Abuse ceilings | `ask-claude`, `supabase/security_hardening_2.sql` | 20 calls a minute; 60 a day (free) or 400 a day (Premium), counted from a server-only log the user cannot edit. Message length, number of messages and image size are capped. |
| Cache cannot be poisoned | `ai_response_cache` | Only the server can write to it. Users have no access. |
| Weekly check | `supabase/ops/ai_usage_report.sql` | Read-only queries: calls per day, heaviest users, near-cap users, cache size, feature use. |

## What is not covered by routine caching and cheaper models
The AI Coach chat, coach memory, mood reflection, daily briefing, post-workout insight, session recalibration, sleep insight and
bedtime stories always use the full model and are never cached, because they are personal or creative. That is where most spend
will come from as users grow. The only brake on them is the per-user caps above, so a Premium user can still make up to 400 calls a day.

## Where each part stands
* **Server:** already live. `ask-claude` was deployed on 2026-10-11 from the code now in this branch, and the two tables
  (`ai_usage_log`, `ai_response_cache`) exist in the live database. The caps and the abuse ceilings are therefore already enforced for
  the released 1.0 app. I could not re-read the deployed function to prove it matches this branch exactly (that needs a Supabase login).
* **Client:** the `routine: true` flags in the app (`PhotoScanScreen`, `MenuScannerModal`, `LogMealModal`, `MindMuscleCueButton`,
  `FormGuardrailsCard`, `FillRemainingMacrosCard`) are only in 1.0.1. Released build 17 never sends them, so caching and the cheaper
  model start to help once users move to 1.0.1.
* **Do not deploy `ask-claude` from `main`.** `main` has the older version without the ceilings and the cache. Deploy only from
  `release/1.0.1` (or whatever it is merged into).

## What you still need to do
1. **Set a monthly spending limit in the Anthropic console now.** It protects you if anything is wrong in the code or the keys.
2. Once most users are on 1.0.1, run `supabase/security_hardening_after_app_update.sql` (trainer column grants). Running it earlier
   breaks the Trainers tab for people still on 1.0. The 1.0.1 app already uses the `my_trainer_profile()` function it needs.
3. Look at the weekly report (below) for the first few weeks, and compare its totals with the Anthropic console.

## Weekly check, 5 minutes
Open `supabase/ops/ai_usage_report.sql`, run each query in the SQL Editor, and note: calls per day (rising faster than users?), the
heaviest ids (someone near 60 or 400 a day, every day?), and the cache size. If one id is far above the others, check the app for a
loop before assuming abuse. Nothing in the report shows emails or what anyone asked.

## What was and was not tested
* Passed: `npx tsc --noEmit`; `scripts/security/apple-jws.test.mjs` (14 checks for the Apple notification verification that came in the same merge);
  the report queries against stand-in tables.
* Not tested here: the function's behaviour with real Anthropic calls, the cache hit rate, and the 1.0.1 client on a device.
