-- Website waitlists (first use: FitNFree "GLP-1 mode" demand test on the
-- LixTeam site). One row per (list, email).
--
-- The table is completely closed to the public: RLS is on with no policies and
-- anon/authenticated have no table privileges at all. The only way in is the
-- join_waitlist() function below, which does one INSERT and nothing else.
-- Read the sign-ups from the Supabase dashboard / service role.
--
-- Why a function and not a plain INSERT policy: the duplicate-safe insert
-- (ON CONFLICT DO NOTHING) needs SELECT privilege on the table, which would
-- have meant letting the public read it. The function runs with the owner's
-- rights instead, so the public gets exactly one capability.
--
-- Limits are enforced in the database, not trusted to the page: the email is
-- normalised (trimmed, lowercased) and must be well-formed, text fields are
-- length-capped, and (list, email) is unique. A repeat sign-up is a silent
-- no-op that looks identical to a first one, so the endpoint can't be used to
-- discover whether an address has already signed up.
--
-- Note: there is no email verification. Anyone could enter someone else's
-- address, so when you eventually email the list, make it a single message
-- with a clear way to opt out.
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

-- No public access to the table itself. (This project's default privileges
-- hand new public tables extra rights, so remove them explicitly, and drop the
-- insert policy an earlier version of this file created.)
drop policy if exists "Anyone can join a waitlist" on waitlist_signups;
revoke all on waitlist_signups from anon, authenticated;

create or replace function join_waitlist(
  p_list text,
  p_email text,
  p_interest text default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into waitlist_signups (list, email, interest, source)
  values (
    p_list,
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_interest, '')), ''),
    nullif(btrim(coalesce(p_source, '')), '')
  )
  on conflict (list, email) do nothing;
end;
$$;

revoke all on function join_waitlist(text, text, text, text) from public;
grant execute on function join_waitlist(text, text, text, text) to anon, authenticated;
