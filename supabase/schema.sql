-- FitNFree database schema
-- Run this in your Supabase project's SQL Editor: Dashboard > SQL Editor > New Query > paste > Run
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.

-- ─────────────────────────────────────────────
-- Exercises: shared reference data, readable by everyone
-- ─────────────────────────────────────────────
create type exercise_category as enum ('home', 'outdoor', 'gym');

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text not null default '',
  benefits text not null default '',
  muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  category exercise_category not null,
  video_url text default '',
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;

create policy "Exercises are readable by anyone"
  on exercises for select
  using (true);

-- Only the admin account (by email) can edit exercises from within the app.
-- Everyone else can read but not write (adding/removing exercises still happens
-- from the Supabase dashboard).
grant update on exercises to authenticated;

create policy "Only the admin can update exercises"
  on exercises for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- Bookmarking ("Save exercise"), private per user.
create table if not exists saved_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

alter table saved_exercises enable row level security;

drop policy if exists "Users manage their own saved exercises" on saved_exercises;
create policy "Users manage their own saved exercises"
  on saved_exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Workout plans: created by users, private to each user
-- ─────────────────────────────────────────────
create table if not exists workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workout_plans enable row level security;

create policy "Users manage their own workout plans"
  on workout_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Workout plan exercises: join table (plan <-> exercises, ordered)
-- ─────────────────────────────────────────────
create table if not exists workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references workout_plans(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  order_index int not null default 0,
  sets int,
  reps int,
  notes text default ''
);

alter table workout_plan_exercises enable row level security;

create policy "Users manage exercises within their own plans"
  on workout_plan_exercises for all
  using (
    exists (
      select 1 from workout_plans
      where workout_plans.id = workout_plan_exercises.workout_plan_id
      and workout_plans.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_plans
      where workout_plans.id = workout_plan_exercises.workout_plan_id
      and workout_plans.user_id = auth.uid()
    )
  );

-- Keep updated_at current on workout_plans
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists workout_plans_set_updated_at on workout_plans;
create trigger workout_plans_set_updated_at
  before update on workout_plans
  for each row execute function set_updated_at();

-- Weekly schedule: which plan (if any) a user does on each day of the
-- week. Null plan_id means a rest day.
create table if not exists plan_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0 = Sunday, matches JS Date#getDay()
  plan_id uuid references workout_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

alter table plan_schedule enable row level security;

drop policy if exists "Users manage their own plan schedule" on plan_schedule;
create policy "Users manage their own plan schedule"
  on plan_schedule for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists plan_schedule_set_updated_at on plan_schedule;
create trigger plan_schedule_set_updated_at
  before update on plan_schedule
  for each row execute function set_updated_at();

-- Meal logging: numbers are always user-entered (manually, or copied in
-- after reading a food scan's AI estimate) -- no auto-fill from the scan.
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  description text not null default '',
  calories int not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  source text not null default 'manual' check (source in ('manual', 'scan', 'search')),
  created_at timestamptz not null default now()
);

alter table meal_logs enable row level security;

drop policy if exists "Users manage their own meal logs" on meal_logs;
create policy "Users manage their own meal logs"
  on meal_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- AI history: past scan/search results, private to each user
-- ─────────────────────────────────────────────
create table if not exists ai_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('equipment_scan', 'food_scan', 'nutrition_search', 'exercise_explanation', 'coach_chat', 'mood_reflection', 'sleep_insight')),
  query text,
  result text not null,
  created_at timestamptz not null default now()
);

alter table ai_history enable row level security;

create policy "Users manage their own AI history"
  on ai_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Profiles: premium flag for freemium gating, auto-created per user.
-- No self-service upgrade path yet (payment processing comes later) —
-- is_premium is toggled manually via SQL for now.
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_premium boolean not null default false,
  -- Admin access is gated on this flag, not on any user-suppliable claim
  -- (like a JWT email string) — set manually via SQL for the one admin
  -- account, same as is_premium/is_trainer. See security_hardening.sql for
  -- why: RLS policies must key off an immutable, server-controlled value.
  is_admin boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  display_name text,
  -- Optional body stats, used only to compute personalized calorie/protein
  -- targets client-side (Mifflin-St Jeor). Column-scoped grant below means
  -- users can only ever touch these specific columns on their own row.
  height_cm numeric,
  weight_kg numeric,
  age int,
  sex text check (sex in ('male', 'female')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'gain')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own display name" on profiles;
create policy "Users can update their own display name"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- Workout logs: one row per day a user logs activity, private per user.
-- Powers streaks and the leaderboard below.
-- ─────────────────────────────────────────────
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null default current_date,
  workout_plan_id uuid references workout_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, logged_date)
);

alter table workout_logs enable row level security;

drop policy if exists "Users manage their own workout logs" on workout_logs;
create policy "Users manage their own workout logs"
  on workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Islands-of-consecutive-dates pattern. A streak counts as still "current"
-- if the last logged day was today or yesterday (one-day grace period).
create or replace view user_streaks
with (security_invoker = false) as
with islands as (
  select
    user_id,
    logged_date,
    logged_date - (row_number() over (partition by user_id order by logged_date))::integer as island_id
  from workout_logs
),
grouped as (
  select user_id, island_id, max(logged_date) as last_day, count(*) as streak_length
  from islands
  group by user_id, island_id
),
latest as (
  select distinct on (user_id) user_id, last_day, streak_length
  from grouped
  order by user_id, last_day desc
),
longest as (
  select user_id, max(streak_length) as longest_streak
  from grouped
  group by user_id
)
select
  latest.user_id,
  case when latest.last_day >= current_date - 1 then latest.streak_length else 0 end as current_streak,
  longest.longest_streak
from latest
join longest on longest.user_id = latest.user_id;

-- Only exposes display name + aggregate stats, never raw logs or emails.
-- Runs with the owner's privileges (security_invoker = false, the Postgres
-- default), so it can read across all users while the underlying tables
-- stay fully RLS-locked to direct queries.
create or replace view leaderboard
with (security_invoker = false) as
select
  p.id as user_id,
  coalesce(nullif(p.display_name, ''), 'Fitness Fan') as display_name,
  coalesce(s.current_streak, 0) as current_streak,
  coalesce(t.total_workouts, 0) as total_workouts,
  coalesce(s.longest_streak, 0) as longest_streak
from profiles p
left join user_streaks s on s.user_id = p.id
left join (
  select user_id, count(distinct logged_date) as total_workouts
  from workout_logs
  group by user_id
) t on t.user_id = p.id;

-- ─────────────────────────────────────────────
-- Challenges: admin-authored, readable by everyone, same pattern as
-- exercises (open select, admin-only writes enforced by RLS).
-- ─────────────────────────────────────────────
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  target_workouts int not null,
  created_at timestamptz not null default now()
);

alter table challenges enable row level security;

drop policy if exists "Challenges are readable by anyone" on challenges;
create policy "Challenges are readable by anyone"
  on challenges for select
  using (true);

drop policy if exists "Only the admin can manage challenges" on challenges;
create policy "Only the admin can manage challenges"
  on challenges for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- ─────────────────────────────────────────────
-- Challenge participants: who joined which challenge. Private-per-user
-- writes (join/leave your own row only) via RLS.
-- ─────────────────────────────────────────────
create table if not exists challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

alter table challenge_participants enable row level security;

drop policy if exists "Users manage their own challenge participation" on challenge_participants;
create policy "Users manage their own challenge participation"
  on challenge_participants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Each participant's workout count within their challenge's date range,
-- plus display name for the mini leaderboard. Runs with the owner's
-- privileges so it can read across all participants while workout_logs
-- stays fully RLS-locked to direct queries.
create or replace view challenge_progress
with (security_invoker = false) as
select
  cp.challenge_id,
  cp.user_id,
  coalesce(nullif(p.display_name, ''), 'Fitness Fan') as display_name,
  cp.joined_at,
  (
    select count(*) from workout_logs wl
    where wl.user_id = cp.user_id
      and wl.logged_date between c.start_date and c.end_date
  ) as workouts_logged
from challenge_participants cp
join challenges c on c.id = cp.challenge_id
join profiles p on p.id = cp.user_id;

create or replace view challenge_stats
with (security_invoker = false) as
select challenge_id, count(*) as participant_count
from challenge_participants
group by challenge_id;

insert into challenges (title, description, start_date, end_date, target_workouts)
select '7-Day Kickstart', 'Log a workout at least 5 times in the next 7 days.', current_date, current_date + 6, 5
where not exists (select 1 from challenges where title = '7-Day Kickstart');

insert into challenges (title, description, start_date, end_date, target_workouts)
select '30-Day Consistency', 'Log 20 workouts over the next 30 days.', current_date, current_date + 29, 20
where not exists (select 1 from challenges where title = '30-Day Consistency');

-- ─────────────────────────────────────────────
-- Oura connections: OAuth tokens, service-role-only, never client-readable.
-- No policies, no grants to authenticated/anon on purpose — only Edge
-- Functions (oura-callback, oura-data, oura-disconnect) using the
-- service role key can touch this table.
-- ─────────────────────────────────────────────
create table if not exists oura_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);

alter table oura_connections enable row level security;

-- ─────────────────────────────────────────────
-- Trainer marketplace: admin-curated trainer listings, one-time paid
-- "custom plan" orders via Stripe Connect (15% platform commission), and a
-- trainer-facing dashboard to fulfill orders.
-- ─────────────────────────────────────────────
alter table profiles add column if not exists is_trainer boolean not null default false;

create table if not exists trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  specialty text not null default '',
  price_cents int not null,
  stripe_account_id text,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table trainer_profiles enable row level security;

drop policy if exists "Trainer profiles are readable by anyone" on trainer_profiles;
create policy "Trainer profiles are readable by anyone"
  on trainer_profiles for select
  using (true);

drop policy if exists "Only the admin can manage trainer profiles" on trainer_profiles;
create policy "Only the admin can manage trainer profiles"
  on trainer_profiles for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- No client-side writes at all — created by create-trainer-checkout, updated
-- by stripe-webhook (paid) and trainer-deliver-plan (fulfilled), all
-- service-role only. Read access goes through trainer_order_view below.
create table if not exists trainer_orders (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  trainer_user_id uuid not null references auth.users(id) on delete cascade,
  trainer_profile_id uuid not null references trainer_profiles(id) on delete cascade,
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'refunded')),
  workout_plan_id uuid references workout_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table trainer_orders enable row level security;

-- Exposes each order plus the counterparty's display name. Runs with owner
-- privileges (security_invoker = false) so the join works across RLS-locked
-- tables, but the `where` clause still restricts each caller to only their
-- own orders as buyer or trainer — same secure-view pattern as leaderboard
-- and challenge_progress.
create or replace view trainer_order_view
with (security_invoker = false) as
select
  o.id,
  o.client_user_id,
  o.trainer_user_id,
  o.trainer_profile_id,
  o.amount_cents,
  o.status,
  o.workout_plan_id,
  o.created_at,
  o.fulfilled_at,
  tp.display_name as trainer_display_name,
  tp.specialty as trainer_specialty,
  coalesce(nullif(cp.display_name, ''), 'Client') as client_display_name
from trainer_orders o
join trainer_profiles tp on tp.id = o.trainer_profile_id
join profiles cp on cp.id = o.client_user_id
where auth.uid() = o.client_user_id or auth.uid() = o.trainer_user_id;

-- ─────────────────────────────────────────────
-- Sleep tracking: manual nightly logging for everyone, plus automatic sync
-- from Oura for users who've connected it (oura-sleep-sync overwrites a
-- manual entry for the same night, since real device data is more accurate).
-- ─────────────────────────────────────────────
create table if not exists sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  duration_minutes int,
  bedtime timestamptz,
  wake_time timestamptz,
  quality_rating int check (quality_rating between 1 and 5),
  sleep_score int check (sleep_score between 0 and 100),
  notes text default '',
  source text not null default 'manual' check (source in ('manual', 'oura')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stage breakdown: only ever populated for source = 'oura' (a device
  -- measurement, not something a user can reasonably self-report).
  deep_minutes int,
  rem_minutes int,
  light_minutes int,
  awake_minutes int,
  unique (user_id, sleep_date)
);

alter table sleep_logs enable row level security;

drop policy if exists "Users manage their own sleep logs" on sleep_logs;
create policy "Users manage their own sleep logs"
  on sleep_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists sleep_logs_set_updated_at on sleep_logs;
create trigger sleep_logs_set_updated_at
  before update on sleep_logs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Habit tracking: user-defined daily habits with a check-off per day and a
-- per-habit streak, same "islands of consecutive dates" pattern as the
-- workout streak.
-- ─────────────────────────────────────────────
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table habits enable row level security;

drop policy if exists "Users manage their own habits" on habits;
create policy "Users manage their own habits"
  on habits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_date)
);

alter table habit_logs enable row level security;

drop policy if exists "Users manage their own habit logs" on habit_logs;
create policy "Users manage their own habit logs"
  on habit_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Runs with the CALLER's own RLS applied (security_invoker = true) rather
-- than the owner-privilege pattern used for leaderboard/challenge_progress,
-- since this view never needs to read across users — it's automatically
-- scoped to the caller's own habits with no extra filtering needed.
create or replace view habit_streaks
with (security_invoker = true) as
with islands as (
  select
    habit_id,
    logged_date,
    logged_date - (row_number() over (partition by habit_id order by logged_date))::integer as island_id
  from habit_logs
),
grouped as (
  select habit_id, island_id, max(logged_date) as last_day, count(*) as streak_length
  from islands
  group by habit_id, island_id
),
latest as (
  select distinct on (habit_id) habit_id, last_day, streak_length
  from grouped
  order by habit_id, last_day desc
)
select
  habit_id,
  case when last_day >= current_date - 1 then streak_length else 0 end as current_streak
from latest;

-- ─────────────────────────────────────────────
-- Mental wellness: a daily mood + journal check-in, private per user, plus
-- an optional AI reflection that reuses ask-claude and the freemium quota
-- (mood logging itself is always free — only the AI reflection counts as
-- an AI action, same as every other AI feature).
-- ─────────────────────────────────────────────
create table if not exists mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  mood int not null check (mood between 1 and 5),
  notes text default '',
  ai_reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stress int check (stress between 1 and 5),
  energy int check (energy between 1 and 5),
  unique (user_id, log_date)
);

alter table mood_logs enable row level security;

drop policy if exists "Users manage their own mood logs" on mood_logs;
create policy "Users manage their own mood logs"
  on mood_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists mood_logs_set_updated_at on mood_logs;
create trigger mood_logs_set_updated_at
  before update on mood_logs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Hydration: simple daily glass counter, private per user.
-- ─────────────────────────────────────────────
create table if not exists hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  glasses int not null default 0 check (glasses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table hydration_logs enable row level security;

drop policy if exists "Users manage their own hydration logs" on hydration_logs;
create policy "Users manage their own hydration logs"
  on hydration_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists hydration_logs_set_updated_at on hydration_logs;
create trigger hydration_logs_set_updated_at
  before update on hydration_logs
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Courses: admin-authored, paid directly to the platform (no Stripe Connect
-- — there's no third-party seller). Lesson content is only readable by
-- enrolled+paid users; course_lesson_previews exposes just titles publicly
-- so anyone can see the syllabus before buying.
-- ─────────────────────────────────────────────
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_cents int not null,
  created_at timestamptz not null default now()
);

alter table courses enable row level security;

drop policy if exists "Courses are readable by anyone" on courses;
create policy "Courses are readable by anyone"
  on courses for select
  using (true);

drop policy if exists "Only the admin can manage courses" on courses;
create policy "Only the admin can manage courses"
  on courses for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

-- No client-side writes — created by create-course-checkout (pending),
-- marked paid by stripe-webhook, both service-role only. Defined before
-- course_lessons since that table's RLS policy references it.
create table if not exists course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table course_enrollments enable row level security;

drop policy if exists "Users view their own enrollments" on course_enrollments;
create policy "Users view their own enrollments"
  on course_enrollments for select
  using (auth.uid() = user_id);

create table if not exists course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  content text not null default '',
  video_url text default '',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table course_lessons enable row level security;

drop policy if exists "Only the admin can manage course lessons" on course_lessons;
create policy "Only the admin can manage course lessons"
  on course_lessons for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

drop policy if exists "Enrolled users can read lesson content" on course_lessons;
create policy "Enrolled users can read lesson content"
  on course_lessons for select
  using (
    exists (
      select 1 from course_enrollments
      where course_enrollments.course_id = course_lessons.course_id
        and course_enrollments.user_id = auth.uid()
        and course_enrollments.status = 'paid'
    )
  );

create or replace view course_lesson_previews
with (security_invoker = false) as
select id, course_id, title, order_index
from course_lessons;

-- Powers the completion certificate (100% of a course's lessons complete).
create table if not exists course_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

alter table course_lesson_progress enable row level security;

drop policy if exists "Users manage their own lesson progress" on course_lesson_progress;
create policy "Users manage their own lesson progress"
  on course_lesson_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Branded e-commerce: merch is sourced live from the connected Printful
-- store (no product catalog duplicated here — Printful stays the source of
-- truth), paid via Stripe Checkout with native shipping-address collection,
-- then automatically submitted to Printful for real fulfillment once paid.
-- ─────────────────────────────────────────────
create table if not exists merch_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'submitted', 'fulfilled', 'failed')),
  stripe_checkout_session_id text,
  printful_order_id text,
  items jsonb not null,
  amount_cents int not null,
  shipping_name text,
  shipping_address1 text,
  shipping_address2 text,
  shipping_city text,
  shipping_state text,
  shipping_country text,
  shipping_zip text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table merch_orders enable row level security;

drop policy if exists "Users view their own merch orders" on merch_orders;
create policy "Users view their own merch orders"
  on merch_orders for select
  using (auth.uid() = user_id);

drop trigger if exists merch_orders_set_updated_at on merch_orders;
create trigger merch_orders_set_updated_at
  before update on merch_orders
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Digital Products (roadmap Section 3.5) — distinct from Courses (3.10):
-- static, sell-once content (meal plans, transformation guides) with no
-- lessons, progress, or certificate. Same admin-authored catalog +
-- gated-content + direct-to-platform Stripe pattern as courses.
-- ─────────────────────────────────────────────
create table if not exists digital_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_cents int not null,
  created_at timestamptz not null default now()
);

alter table digital_products enable row level security;

drop policy if exists "Digital products are readable by anyone" on digital_products;
create policy "Digital products are readable by anyone"
  on digital_products for select
  using (true);

drop policy if exists "Only the admin can manage digital products" on digital_products;
create policy "Only the admin can manage digital products"
  on digital_products for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

create table if not exists digital_product_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references digital_products(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table digital_product_purchases enable row level security;

drop policy if exists "Users view their own digital product purchases" on digital_product_purchases;
create policy "Users view their own digital product purchases"
  on digital_product_purchases for select
  using (auth.uid() = user_id);

create table if not exists digital_product_content (
  product_id uuid primary key references digital_products(id) on delete cascade,
  body text not null default '',
  file_url text default ''
);

alter table digital_product_content enable row level security;

drop policy if exists "Only the admin can manage digital product content" on digital_product_content;
create policy "Only the admin can manage digital product content"
  on digital_product_content for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin));

drop policy if exists "Buyers can read their purchased content" on digital_product_content;
create policy "Buyers can read their purchased content"
  on digital_product_content for select
  using (
    exists (
      select 1 from digital_product_purchases
      where digital_product_purchases.product_id = digital_product_content.product_id
        and digital_product_purchases.user_id = auth.uid()
        and digital_product_purchases.status = 'paid'
    )
  );

-- ─────────────────────────────────────────────
-- Grants: RLS policies control row access, but the roles also need
-- baseline table-level privileges or Postgres denies the query outright.
-- ─────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select on exercises to anon, authenticated;
grant select, insert, update, delete on workout_plans to authenticated;
grant select, insert, update, delete on workout_plan_exercises to authenticated;
grant select, insert, update, delete on ai_history to authenticated;
grant select, insert, update, delete on hydration_logs to authenticated;
grant select, insert, delete on saved_exercises to authenticated;
grant select, insert, update, delete on plan_schedule to authenticated;
grant select, insert, update, delete on meal_logs to authenticated;
grant select on profiles to authenticated;
grant update (display_name) on profiles to authenticated;
grant update (height_cm, weight_kg, age, sex, activity_level, goal) on profiles to authenticated;
grant select, update on profiles to service_role;
grant select, insert, update, delete on workout_logs to authenticated;
grant select on leaderboard to authenticated;
grant select on challenges to anon, authenticated;
grant insert, update, delete on challenges to authenticated;
grant select, insert, delete on challenge_participants to authenticated;
grant select on challenge_progress to authenticated;
grant select on challenge_stats to authenticated;
grant select, insert, update, delete on oura_connections to service_role;
grant select on trainer_profiles to anon, authenticated;
grant insert, update, delete on trainer_profiles to authenticated;
grant select, update on trainer_profiles to service_role;
grant select on trainer_order_view to authenticated;
grant select, insert, update on trainer_orders to service_role;
grant select, insert, delete on workout_plans to service_role;
grant select, insert on workout_plan_exercises to service_role;
grant select, insert, update, delete on sleep_logs to authenticated;
grant select, insert, update on sleep_logs to service_role;
grant select, insert, update, delete on habits to authenticated;
grant select, insert, update, delete on habit_logs to authenticated;
grant select on habit_streaks to authenticated;
grant select, insert, update, delete on mood_logs to authenticated;
grant select on courses to anon, authenticated;
grant insert, update, delete on courses to authenticated;
grant select on courses to service_role;
grant select on course_lessons to authenticated;
grant insert, update, delete on course_lessons to authenticated;
grant select on course_lesson_previews to anon, authenticated;
grant select on course_enrollments to authenticated;
grant select, insert, update on course_enrollments to service_role;
grant select, insert, update, delete on course_lesson_progress to authenticated;
grant select on merch_orders to authenticated;
grant select, insert, update on merch_orders to service_role;
grant select on digital_products to anon, authenticated;
grant insert, update, delete on digital_products to authenticated;
grant select on digital_products to service_role;
grant select on digital_product_purchases to authenticated;
grant select, insert, update on digital_product_purchases to service_role;
grant select on digital_product_content to authenticated;
grant insert, update, delete on digital_product_content to authenticated;
