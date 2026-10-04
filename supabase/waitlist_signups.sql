-- Website waitlists (first use: FitNFree "GLP-1 mode" demand test on the
-- LixTeam site). One row per (list, email).
--
-- Write-only for the public: the website posts with the project's public anon
-- key, and RLS lets anon and signed-in users INSERT but never read, update or
-- delete. Read the sign-ups from the Supabase dashboard / service role.
--
-- Abuse limits are enforced here rather than trusted to the page: the email
-- must be lowercase and well-formed, text fields are length-capped, and
-- (list, email) is unique so a repeat sign-up is a no-op. The page inserts
-- with ON CONFLICT DO NOTHING so a duplicate returns success too, which means
-- the endpoint can't be used to find out whether an address already signed up.
--
-- Run this in the Supabase SQL Editor.

create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  list text not null,
  email text not null,
  interest text,
  source text,
  created_at timestamptz not null default now(),
  constraint waitlist_list_shape check (list ~ '^[a-z0-9-]{1,60}$'),
  constraint waitlist_email_shape check (
    email = lower(email)
    and length(email) between 5 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint waitlist_interest_len check (interest is null or length(interest) <= 200),
  constraint waitlist_source_shape check (source is null or source ~ '^[a-z0-9_-]{1,60}$'),
  unique (list, email)
);

alter table waitlist_signups enable row level security;

drop policy if exists "Anyone can join a waitlist" on waitlist_signups;
create policy "Anyone can join a waitlist"
  on waitlist_signups for insert
  to anon, authenticated
  with check (true);

-- Insert only. No select/update/delete grant for anon or authenticated.
grant insert on waitlist_signups to anon, authenticated;
