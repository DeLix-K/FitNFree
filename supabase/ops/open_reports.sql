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
