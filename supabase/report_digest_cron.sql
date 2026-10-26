-- Runs the report-digest function every hour. TEMPLATE: it is not safe to run until you fill in the two values marked <<...>>.
-- Run it in the Supabase SQL Editor AFTER: (1) report_digest.sql has been run, (2) the report-digest function is deployed with
-- --no-verify-jwt, and (3) the secrets RESEND_API_KEY, REPORT_ALERT_EMAIL and DIGEST_SECRET are set in Edge Functions > Secrets.
--
-- Before running: Database > Extensions > turn on pg_cron and pg_net.
--
-- <<DIGEST_SECRET>>  the same long random value you stored as the DIGEST_SECRET secret (make one in a password manager; 32+ characters).
--                    It is stored inside this job, so treat the SQL editor history like a place that holds a password.
-- The hourly schedule costs nothing when there are no reports: the function sends an email only if something is unsent.

select cron.schedule(
  'report-digest',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://fuhvcclwsbltqvribpsq.supabase.co/functions/v1/report-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', '<<DIGEST_SECRET>>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Check that it exists and how recent runs went:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'report-digest';
--   select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'report-digest') order by start_time desc limit 10;
--   select status_code, left(content::text, 120) as response, created from net._http_response order by created desc limit 5;
--
-- To stop it:  select cron.unschedule('report-digest');
