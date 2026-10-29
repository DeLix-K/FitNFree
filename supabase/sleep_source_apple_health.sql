-- Lets a sleep night be marked as coming from Apple Health (source = 'apple_health') or Android Health Connect (source = 'health_connect'), next to 'manual' and 'oura'.
-- Run this in the Supabase SQL Editor BEFORE shipping the app update that has the Apple Health or Health Connect sleep import. Safe to run more than once, and it
-- always sets the same four allowed values, so running it again after nights from either source exist is fine.
--
-- Nothing else about sleep_logs changes: the same row-level security applies (each person can only read and write their own nights), and the
-- imports never overwrite a night that was logged by hand, came from Oura, or came from the other health source.

do $$
declare
  c record;
begin
  -- Drop whichever check constraint currently restricts the source column (its name can differ between setups).
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.sleep_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.sleep_logs drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.sleep_logs
  add constraint sleep_logs_source_check check (source in ('manual', 'oura', 'apple_health', 'health_connect'));
