-- In-app reports of user-generated content: leaderboard names, challenges,
-- squads and trainer profiles (chat messages have their own table, see
-- trainer_moderation.sql). App Review Guideline 1.2 expects a way to report
-- offensive content, with a timely response.
--
-- People can file a report but never read the table: only the project owner
-- (dashboard / service role) reviews them. This project's default privileges
-- hand new public tables extra rights to anon/authenticated, so they are
-- revoked explicitly and only INSERT is granted back to signed-in users.
--
-- Run this in the Supabase SQL Editor.

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('user', 'challenge', 'squad', 'trainer')),
  target_id text not null check (char_length(target_id) between 1 and 100),
  reported_user_id uuid references auth.users(id) on delete set null,
  label text check (label is null or char_length(label) <= 200),
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists content_reports_created_idx on content_reports (created_at desc);

alter table content_reports enable row level security;

revoke all on content_reports from anon, authenticated;
grant insert on content_reports to authenticated;

drop policy if exists "Signed-in users can file reports" on content_reports;
create policy "Signed-in users can file reports"
  on content_reports for insert
  to authenticated
  with check (reporter_user_id = auth.uid());
