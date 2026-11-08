-- Reports nobody has dealt with yet. READ-ONLY: run in the Supabase SQL Editor. Shows ids and the reporter's words, never emails.
-- After you have dealt with a report, record it so it drops off this list (run by hand, one row at a time):
--   update content_reports set reviewed_at = now(), action = 'removed' where id = '<report id>';   -- or 'warned', 'suspended', 'dismissed', 'none'
--   update message_reports set reviewed_at = now(), action = 'dismissed' where id = '<report id>';

select 'content' as source, id, kind, label, left(reason, 200) as reason, reported_user_id, created_at,
       now() - created_at as waiting
from content_reports
where reviewed_at is null
union all
select 'chat message', id, 'trainer chat', null, left(reason, 200), reported_user_id, created_at, now() - created_at
from message_reports
where reviewed_at is null
order by created_at;

-- Anything waiting more than 24 hours (Apple expects reports to be handled promptly):
--   add:  where reviewed_at is null and created_at < now() - interval '24 hours'  to either half of the query above.

-- A report whose target_id starts with 'checkin-link:' was filed by a TRAINER about a check-in client (a trainer never sees the client's account id).
-- Look the person up (read-only), then act on their account in the dashboard:
--   select client_user_id, trainer_id, label, status from trainer_client_links where id = '<the uuid after "checkin-link:">';
