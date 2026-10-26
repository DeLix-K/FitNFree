-- Trainer Tools: a trainer's own private client tracker, check-in tracker and income/expense sheets.
-- Run this in the Supabase SQL Editor before shipping the app update that has the Trainer Tools tab. Safe to run more than once.
--
-- PRIVACY: every row belongs to ONE trainer and only that trainer can see or change it. Nobody else can read it: not other trainers,
-- not the clients, not other app users, and not anonymous visitors. These are the trainer's own bookkeeping notes about people they coach,
-- including body weights, so the app tells trainers to use first names or initials and nothing sensitive. This is "tracking only":
-- no payments are taken or sent by these tables. Deleting a trainer's account deletes all of it.
--
-- The tables are reachable only by signed-in users whose user id is the row's trainer_id and who have a trainer profile (checked on insert).
-- The project's default privileges give new tables extra rights to anon, so those are revoked explicitly.

-- ─────────────────────────────────────────────
-- Clients
-- ─────────────────────────────────────────────
create table if not exists trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  package_name text check (package_name is null or char_length(package_name) <= 80),
  start_date date,
  check_in_day smallint check (check_in_day is null or check_in_day between 0 and 6), -- 0 = Sunday ... 6 = Saturday
  payment_due_date date,
  payment_status text not null default 'paid' check (payment_status in ('paid', 'due', 'overdue')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trainer_clients_trainer_idx on trainer_clients (trainer_id, status);

-- ─────────────────────────────────────────────
-- Check-ins
-- ─────────────────────────────────────────────
create table if not exists trainer_checkins (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references trainer_clients(id) on delete cascade,
  checkin_date date not null,
  status text not null default 'to_do' check (status in ('to_do', 'done')),
  photos_submitted boolean not null default false,
  weight_kg numeric(5, 1) check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  coach_feedback text check (coach_feedback is null or char_length(coach_feedback) <= 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists trainer_checkins_trainer_idx on trainer_checkins (trainer_id, checkin_date desc);
create index if not exists trainer_checkins_client_idx on trainer_checkins (client_id, checkin_date desc);

-- ─────────────────────────────────────────────
-- Income and expenses
-- ─────────────────────────────────────────────
create table if not exists trainer_finance_entries (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  kind text not null check (kind in ('income', 'expense')),
  category text check (category is null or char_length(category) <= 40),
  description text check (description is null or char_length(description) <= 120),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents < 100000000),
  created_at timestamptz not null default now()
);
create index if not exists trainer_finance_trainer_idx on trainer_finance_entries (trainer_id, entry_date desc);

-- ─────────────────────────────────────────────
-- Housekeeping: keep updated_at current, and stop one account filling the database.
-- ─────────────────────────────────────────────
create or replace function trainer_clients_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trainer_clients_touch_trg on trainer_clients;
create trigger trainer_clients_touch_trg before update on trainer_clients for each row execute function trainer_clients_touch();

create or replace function trainer_tools_limit() returns trigger language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from %I where trainer_id = $1', tg_table_name) into n using new.trainer_id;
  if n >= tg_argv[0]::bigint then
    raise exception 'trainer_tools_limit';
  end if;
  return new;
end;
$$;
drop trigger if exists trainer_clients_limit_trg on trainer_clients;
create trigger trainer_clients_limit_trg before insert on trainer_clients for each row execute function trainer_tools_limit(300);
drop trigger if exists trainer_checkins_limit_trg on trainer_checkins;
create trigger trainer_checkins_limit_trg before insert on trainer_checkins for each row execute function trainer_tools_limit(20000);
drop trigger if exists trainer_finance_limit_trg on trainer_finance_entries;
create trigger trainer_finance_limit_trg before insert on trainer_finance_entries for each row execute function trainer_tools_limit(20000);

-- ─────────────────────────────────────────────
-- Access: the owner only.
-- ─────────────────────────────────────────────
alter table trainer_clients enable row level security;
alter table trainer_checkins enable row level security;
alter table trainer_finance_entries enable row level security;

revoke all on trainer_clients, trainer_checkins, trainer_finance_entries from anon, authenticated;
grant select, insert, update, delete on trainer_clients, trainer_checkins, trainer_finance_entries to authenticated;

drop policy if exists "Trainers read their own clients" on trainer_clients;
create policy "Trainers read their own clients" on trainer_clients for select to authenticated using (trainer_id = auth.uid());
drop policy if exists "Trainers add their own clients" on trainer_clients;
create policy "Trainers add their own clients" on trainer_clients for insert to authenticated
  with check (trainer_id = auth.uid() and exists (select 1 from trainer_profiles tp where tp.user_id = auth.uid()));
drop policy if exists "Trainers edit their own clients" on trainer_clients;
create policy "Trainers edit their own clients" on trainer_clients for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists "Trainers delete their own clients" on trainer_clients;
create policy "Trainers delete their own clients" on trainer_clients for delete to authenticated using (trainer_id = auth.uid());

drop policy if exists "Trainers read their own check-ins" on trainer_checkins;
create policy "Trainers read their own check-ins" on trainer_checkins for select to authenticated using (trainer_id = auth.uid());
-- A check-in can only point at one of the trainer's own clients.
drop policy if exists "Trainers add their own check-ins" on trainer_checkins;
create policy "Trainers add their own check-ins" on trainer_checkins for insert to authenticated
  with check (
    trainer_id = auth.uid()
    and exists (select 1 from trainer_profiles tp where tp.user_id = auth.uid())
    and exists (select 1 from trainer_clients c where c.id = client_id and c.trainer_id = auth.uid())
  );
drop policy if exists "Trainers edit their own check-ins" on trainer_checkins;
create policy "Trainers edit their own check-ins" on trainer_checkins for update to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid() and exists (select 1 from trainer_clients c where c.id = client_id and c.trainer_id = auth.uid()));
drop policy if exists "Trainers delete their own check-ins" on trainer_checkins;
create policy "Trainers delete their own check-ins" on trainer_checkins for delete to authenticated using (trainer_id = auth.uid());

drop policy if exists "Trainers read their own finance entries" on trainer_finance_entries;
create policy "Trainers read their own finance entries" on trainer_finance_entries for select to authenticated using (trainer_id = auth.uid());
drop policy if exists "Trainers add their own finance entries" on trainer_finance_entries;
create policy "Trainers add their own finance entries" on trainer_finance_entries for insert to authenticated
  with check (trainer_id = auth.uid() and exists (select 1 from trainer_profiles tp where tp.user_id = auth.uid()));
drop policy if exists "Trainers edit their own finance entries" on trainer_finance_entries;
create policy "Trainers edit their own finance entries" on trainer_finance_entries for update to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists "Trainers delete their own finance entries" on trainer_finance_entries;
create policy "Trainers delete their own finance entries" on trainer_finance_entries for delete to authenticated using (trainer_id = auth.uid());
