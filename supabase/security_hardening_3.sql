-- Security hardening, round 3 -- from the live-database audit (2026-10-11).
-- Safe for the current app: nothing the app does needs any of these rights.
-- Idempotent. Run in the Supabase SQL Editor.

-- 1. TRUNCATE / TRIGGER / REFERENCES were granted to anon and authenticated on
--    every public table (a leftover of Supabase's default grants). TRUNCATE
--    ignores row-level security. The REST API cannot issue it, so it is not
--    reachable through the app's public key, but there is no reason to leave
--    it granted -- it would matter the moment anything connects with SQL.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- ...and stop new tables from getting them again.
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 2. Signed-out visitors can only need join_waitlist(). Every other
--    SECURITY DEFINER function is for signed-in users (they already check
--    auth.uid(), so this is defence in depth, except where noted below).
--    is_admin_user() / is_premium_user() are deliberately kept: row-level
--    policies on courses and digital_products call them, and signed-out
--    visitors can read those tables, so revoking them would break that read.
--    They only report on the caller and take no arguments.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and p.proname not in ('join_waitlist', 'is_admin_user', 'is_premium_user')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;
-- Keep triggers working: handle_new_user() fires as a trigger, not via a grant.

-- 3. compute_adaptive_target(p_user_id, ...) trusted whatever user id the
--    caller supplied, so anyone who knew a user's id could read how often
--    they trained over the last four weeks. It now only answers for the
--    caller themselves (service-role / internal calls with no auth.uid() still work).
create or replace function compute_adaptive_target(p_user_id uuid, p_challenge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_target int;
  v_duration_days int;
  v_recent_avg_per_week numeric;
  v_scaled int;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Not allowed.';
  end if;

  select target_workouts, (end_date - start_date + 1)
    into v_base_target, v_duration_days
    from challenges where id = p_challenge_id;

  if v_base_target is null then
    return null;
  end if;

  select count(*)::numeric / 4.0 into v_recent_avg_per_week
    from workout_logs
    where user_id = p_user_id
      and logged_date >= current_date - 28
      and logged_date < current_date;

  -- No recent history to scale from -- use the challenge's own base target.
  if v_recent_avg_per_week is null or v_recent_avg_per_week <= 0 then
    return v_base_target;
  end if;

  v_scaled := round(v_recent_avg_per_week * (v_duration_days::numeric / 7.0));

  -- Clamp to 50%-150% of the base target so the challenge stays
  -- recognizably "the same challenge" for everyone, just fairly scaled.
  return greatest(round(v_base_target * 0.5), least(round(v_base_target * 1.5), v_scaled));
end;
$$;
revoke execute on function compute_adaptive_target(uuid, uuid) from public, anon;
grant execute on function compute_adaptive_target(uuid, uuid) to authenticated;
