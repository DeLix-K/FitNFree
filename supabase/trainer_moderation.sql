-- Reporting and blocking for trainer<->client messaging. Required so the
-- app's user-generated content (trainer chat) has a reporting and blocking
-- mechanism, per Apple App Review Guideline 1.2.
-- ─────────────────────────────────────────────

create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists message_reports_reported_idx
  on message_reports (reported_user_id, created_at);

alter table message_reports enable row level security;

drop policy if exists "Participants can report their own thread" on message_reports;
create policy "Participants can report their own thread"
  on message_reports for insert
  with check (
    reporter_user_id = auth.uid()
    and (auth.uid() = trainer_user_id or auth.uid() = client_user_id)
    and reported_user_id in (trainer_user_id, client_user_id)
    and reported_user_id <> reporter_user_id
  );

drop policy if exists "Admins can view all reports" on message_reports;
create policy "Admins can view all reports"
  on message_reports for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin));

grant select, insert on message_reports to authenticated;
grant select, insert on message_reports to service_role;

-- ─────────────────────────────────────────────

create table if not exists blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

alter table blocked_users enable row level security;

drop policy if exists "Users manage their own block list" on blocked_users;
create policy "Users manage their own block list"
  on blocked_users for all
  using (blocker_user_id = auth.uid())
  with check (blocker_user_id = auth.uid());

-- Any thread participant needs to know if the *other* party has blocked
-- them (to hide the input), not just their own outgoing blocks, so select
-- is open to any authenticated user rather than scoped to blocker_user_id.
drop policy if exists "Authenticated users can see who blocked whom" on blocked_users;
create policy "Authenticated users can see who blocked whom"
  on blocked_users for select
  using (auth.role() = 'authenticated');

grant select, insert, delete on blocked_users to authenticated;
grant select on blocked_users to service_role;

-- Enforce blocking at the database level for new messages, not just in the
-- UI -- a blocked party (in either direction) cannot insert new messages
-- into that thread.
drop policy if exists "Participants can send messages in their own thread" on trainer_messages;
create policy "Participants can send messages in their own thread"
  on trainer_messages for insert
  with check (
    sender_id = auth.uid()
    and (auth.uid() = trainer_user_id or auth.uid() = client_user_id)
    and not exists (
      select 1 from blocked_users
      where (blocker_user_id = trainer_user_id and blocked_user_id = client_user_id)
         or (blocker_user_id = client_user_id and blocked_user_id = trainer_user_id)
    )
  );
