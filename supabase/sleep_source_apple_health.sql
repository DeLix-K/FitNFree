-- Lets a sleep night be marked as coming from Apple Health (source = 'apple_health'), next to 'manual' and 'oura'.
-- Run this in the Supabase SQL Editor BEFORE shipping the app update that has the Apple Health sleep import. Safe to run more than once.
--
-- Nothing else about sleep_logs changes: the same row-level security applies (each person can only read and write their own nights), and the
-- Apple Health import never overwrites a night that was logged by hand or came from Oura.

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
  add constraint sleep_logs_source_check check (source in ('manual', 'oura', 'apple_health'));
