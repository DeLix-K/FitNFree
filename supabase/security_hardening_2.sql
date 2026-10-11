-- Security hardening, round 2 (from the 2026-10 security audit).
-- Safe to run NOW: nothing here changes behaviour for the app version that is
-- currently live. Run in the Supabase SQL Editor. Idempotent.
--
-- The matching edge-function changes (ask-claude) read ai_usage_log and the
-- locked-down ai_response_cache, so run this BEFORE deploying that function.
-- security_hardening_after_app_update.sql is the second half and must wait
-- until an app build that includes the matching client changes is live.

-- ─────────────────────────────────────────────
-- 1. Server-side AI usage log (abuse ceilings in ask-claude).
--    Service-role only: users can neither read, write nor delete it, unlike
--    ai_history which the client owns.
-- ─────────────────────────────────────────────
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_log_user_time_idx on ai_usage_log (user_id, created_at desc);
alter table ai_usage_log enable row level security;
revoke all on ai_usage_log from anon, authenticated;
grant select, insert, delete on ai_usage_log to service_role;

-- ─────────────────────────────────────────────
-- 2. Shared AI cache: service-role only (was writable by every signed-in
--    user, which let anyone plant a reply under another prompt's hash).
--    Also drop any rows that might already have been planted.
-- ─────────────────────────────────────────────
alter table if exists ai_response_cache enable row level security;
revoke all on ai_response_cache from anon, authenticated;
drop policy if exists "Authenticated users can read the shared AI cache" on ai_response_cache;
drop policy if exists "Authenticated users can add to the shared AI cache" on ai_response_cache;
grant select, insert, delete on ai_response_cache to service_role;
delete from ai_response_cache;

-- ─────────────────────────────────────────────
-- 3. blocked_users: stop exposing the whole block graph. A user only needs to
--    see blocks they made or blocks made against them (so a thread can hide
--    the input box); the policy was open to every authenticated user.
-- ─────────────────────────────────────────────
drop policy if exists "Authenticated users can see who blocked whom" on blocked_users;
create policy "Users can see blocks they are part of"
  on blocked_users for select
  using (blocker_user_id = auth.uid() or blocked_user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 4. Link fields must be https:// (NOT VALID = applies to new/changed rows
--    only, so existing data can never make this statement fail).
-- ─────────────────────────────────────────────
alter table trainer_profiles drop constraint if exists trainer_profiles_intro_video_https;
alter table trainer_profiles add constraint trainer_profiles_intro_video_https
  check (intro_video_url is null or intro_video_url ~* '^https://[^[:space:]]+$') not valid;
alter table trainer_profiles drop constraint if exists trainer_profiles_call_link_https;
alter table trainer_profiles add constraint trainer_profiles_call_link_https
  check (default_video_call_link is null or default_video_call_link ~* '^https://[^[:space:]]+$') not valid;
alter table trainer_time_slots drop constraint if exists trainer_time_slots_call_link_https;
alter table trainer_time_slots add constraint trainer_time_slots_call_link_https
  check (video_call_link is null or video_call_link ~* '^https://[^[:space:]]+$') not valid;

-- ─────────────────────────────────────────────
-- 5. Owner-only read of the full trainer profile (used by the next app
--    version, so the private columns can later be hidden from the public
--    table grant -- see security_hardening_after_app_update.sql).
-- ─────────────────────────────────────────────
create or replace function my_trainer_profile()
returns setof trainer_profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from trainer_profiles where user_id = auth.uid();
$$;
revoke all on function my_trainer_profile() from public, anon;
grant execute on function my_trainer_profile() to authenticated;
