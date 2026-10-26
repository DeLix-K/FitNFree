-- Weekly AI cost check. READ-ONLY: it only selects, it changes nothing. Run each block in the Supabase SQL Editor and compare the totals
-- with the Anthropic console's usage page. It shows ids only, never emails or what anyone asked.
--
-- What it can and cannot tell you:
--   * ai_usage_log has one row per AI call that actually went to Anthropic. A reply served from the shared cache is removed from the log
--     again by ask-claude, so cache hits do not appear here. That is the point: this is a count of calls that cost money.
--   * It does not know how many tokens a call used or which model answered, so it cannot give a price. Use the Anthropic console for
--     money, and this report for "is something unusual happening and who".
--   * ai_history is written by the app (the client), so treat it as an approximate feature-use count, not an audit trail.

-- 1. Calls that reached Anthropic, per day, last 14 days, and how many different people made them.
select date_trunc('day', created_at)::date as day,
       count(*)                            as calls,
       count(distinct user_id)             as people
from ai_usage_log
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;

-- 2. The 10 heaviest users in the last 7 days (ids only). A free user is capped at 60 calls a day and a Premium user at 400.
select user_id, count(*) as calls_7d, count(*) filter (where created_at > now() - interval '1 day') as calls_24h
from ai_usage_log
where created_at > now() - interval '7 days'
group by user_id
order by calls_7d desc
limit 10;

-- 3. How many calls are close to the per-user daily cap (possible abuse or a stuck loop in the app).
select user_id, count(*) as calls_today
from ai_usage_log
where created_at >= date_trunc('day', now())
group by user_id
having count(*) >= 40
order by calls_today desc;

-- 4. Shared cache: how big it is and which model its answers came from. A growing cache means repeat questions are being answered for free.
select model, count(*) as cached_replies, min(created_at)::date as oldest, max(created_at)::date as newest
from ai_response_cache
group by model
order by cached_replies desc;

-- 5. What people use the AI features for (from the app's own history), last 7 days.
select kind, count(*) as uses_7d
from ai_history
where created_at > now() - interval '7 days'
group by kind
order by uses_7d desc;

-- 6. Tidy-up (NOT run by this file): the usage log only needs recent rows. Review, then run by hand if you want it smaller.
--    delete from ai_usage_log where created_at < now() - interval '30 days';
