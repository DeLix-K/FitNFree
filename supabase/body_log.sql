-- Body log: a person's own weight, body fat and body measurements over time. Run this in the Supabase SQL Editor before shipping the app update
-- that has the Body tab. Safe to run more than once.
--
-- PRIVACY: each row belongs to one person and only that person can see or change it (not other users, not trainers, not anonymous visitors).
-- Deleting the account deletes the rows. PROGRESS PHOTOS ARE NOT HERE: they are kept only on the person's own phone and never uploaded.
--
-- One row per person per day. Saving a second entry for the same day replaces the first (the app does that with an upsert on user_id + logged_date).
-- Weights are kept in kilograms and lengths in centimetres whatever units the person prefers to see.

create table if not exists body_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_date date not null check (logged_date >= date '2000-01-01' and logged_date <= current_date + 1),
  weight_kg numeric(5, 1) check (weight_kg is null or (weight_kg >= 20 and weight_kg < 500)),
  body_fat_pct numeric(3, 1) check (body_fat_pct is null or (body_fat_pct >= 2 and body_fat_pct <= 70)),
  waist_cm numeric(4, 1) check (waist_cm is null or (waist_cm >= 10 and waist_cm <= 300)),
  chest_cm numeric(4, 1) check (chest_cm is null or (chest_cm >= 10 and chest_cm <= 300)),
  hips_cm numeric(4, 1) check (hips_cm is null or (hips_cm >= 10 and hips_cm <= 300)),
  thigh_cm numeric(4, 1) check (thigh_cm is null or (thigh_cm >= 10 and thigh_cm <= 300)),
  arm_cm numeric(4, 1) check (arm_cm is null or (arm_cm >= 10 and arm_cm <= 300)),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_date),
  -- An entry with nothing in it is not allowed.
  check (num_nonnulls(weight_kg, body_fat_pct, waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm) >= 1)
);

create index if not exists body_log_user_date_idx on body_log (user_id, logged_date desc);

-- Keep updated_at current (set_updated_at() already exists in this project, from workout_plans).
drop trigger if exists body_log_set_updated_at on body_log;
create trigger body_log_set_updated_at before update on body_log for each row execute function set_updated_at();

-- Stop one account filling the table.
create or replace function body_log_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from body_log where user_id = new.user_id) >= 5000 then
    raise exception 'body_log_limit';
  end if;
  return new;
end;
$$;
drop trigger if exists body_log_limit_trg on body_log;
create trigger body_log_limit_trg before insert on body_log for each row execute function body_log_limit();

-- The owner only. This project's default privileges hand new tables extra rights to anon, so they are revoked explicitly.
alter table body_log enable row level security;
revoke all on body_log from anon, authenticated;
grant select, insert, update, delete on body_log to authenticated;

drop policy if exists "People read their own body log" on body_log;
create policy "People read their own body log" on body_log for select to authenticated using (user_id = auth.uid());
drop policy if exists "People add to their own body log" on body_log;
create policy "People add to their own body log" on body_log for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "People edit their own body log" on body_log;
create policy "People edit their own body log" on body_log for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "People delete from their own body log" on body_log;
create policy "People delete from their own body log" on body_log for delete to authenticated using (user_id = auth.uid());
