# Report digest (Resend): setup and operation

Built on branch `release/1.0.1` on 2026-10-26. **Nothing is deployed, scheduled or sent yet.** The reports themselves already work in the
released app (they land in `content_reports` and, for trainer chat, `message_reports`). This adds the part that tells you about them.

## What it does
Every hour a schedule calls the `report-digest` Edge Function. It looks for reports that have not been mentioned in an email, and if there are
any it sends you **one** email through Resend listing them, then marks them as sent. No reports means no email. If the email fails, nothing is
marked and the next hour tries again. The email contains ids and what the reporter wrote, **never email addresses**; anything a user wrote is
escaped. It lists at most 50 per email and says how many are left. You still deal with each report yourself in the Supabase dashboard and
record what you did (`reviewed_at`, `action`). Open reports can be listed with `supabase/ops/open_reports.sql`.

## Files
| File | What |
|---|---|
| `supabase/report_digest.sql` | Adds `digest_sent_at`, `reviewed_at`, `action` to both report tables and two functions only the server can call |
| `supabase/functions/report-digest/digest.ts` | The logic (tested) |
| `supabase/functions/report-digest/index.ts` | Thin entry point; refuses any caller without the shared secret |
| `supabase/report_digest_cron.sql` | The hourly schedule (a template: two values to fill in) |
| `supabase/ops/open_reports.sql` | Read-only list of reports still waiting, and how to record what you did |
| `scripts/test-report-digest.mjs` | 15 checks |

## What you need to do (in this order)
1. **Resend:** create an account. Create an **API key** with "Sending access". Do not paste it into chat.
   Without a verified domain Resend only delivers from its test sender (`onboarding@resend.dev`) to **your own Resend account email**, which is enough
   to alert yourself. To send from your own address later, verify a domain in Resend and set `REPORT_FROM_EMAIL`.
2. **Decide the alert address** and make sure it is the one on your Resend account if you use the test sender.
3. **Run `supabase/report_digest.sql`** in the SQL Editor (safe to run twice).
4. **Secrets** (Supabase > Edge Functions > Secrets):
   * `RESEND_API_KEY`: the key from step 1.
   * `REPORT_ALERT_EMAIL`: where alerts go.
   * `DIGEST_SECRET`: a random value of 32+ characters from your password manager.
   * optional `REPORT_FROM_EMAIL`, for example `FitNFree Alerts <alerts@yourdomain>` (only after the domain is verified).
5. **Deploy the function without Supabase's sign-in check** (the schedule is not a signed-in user; the shared secret protects it):
   `npx supabase functions deploy report-digest --project-ref fuhvcclwsbltqvribpsq --no-verify-jwt`
   (Needs the Supabase CLI to be logged in as you. Do not give me a token; run it yourself, or ask me for the exact command to paste.)
6. **Test by hand before scheduling:** insert a test report as yourself in the app (report a test profile, or add one row to `content_reports` in the
   Table Editor), then call the function once:
   `curl -X POST https://fuhvcclwsbltqvribpsq.supabase.co/functions/v1/report-digest -H "x-digest-secret: <your DIGEST_SECRET>"`
   Expect `{"sent":true,"count":1}` and an email within a minute. Run it again: expect `{"sent":false,"count":0}`.
7. **Schedule it:** turn on `pg_cron` and `pg_net` (Database > Extensions), fill in `<<DIGEST_SECRET>>` in `supabase/report_digest_cron.sql`, and run it.
8. Check the first scheduled run in the job history (queries are in the cron file).

## Safety properties (tested)
* Only the server can read or mark reports. Signed-in app users cannot read the report tables, and the report rows returned to the function leave out who reported.
* A caller without the exact `x-digest-secret` gets 401 before any database access.
* A report is marked sent only after Resend accepted the email, and the same set of reports always uses the same idempotency key, so a retry cannot send a duplicate.
* Missing settings return an error and send nothing.

## What was and was not tested
Tested: the email logic (15 checks counting the 4 database ones against the real `content_reports.sql` in an in-process Postgres; a deliberate break of the HTML escaping was caught).
Not tested: a real Resend send, the deployed function, the schedule, Supabase `pg_cron`/`pg_net`, or Resend's handling of the idempotency key. The trainer-chat table was
simulated with its real columns and grants, not the full `trainer_moderation.sql`.

## Limits
* Latency is up to an hour. If you want instant alerts for the first report of a day, that needs a database trigger as well. It is a small addition if you want it.
* The test sender can only email you. If Resend rejects the send, the function returns `send_failed`, and nothing is marked.
* This only tells you reports exist. Acting on them (hiding content, suspending accounts) is manual.
