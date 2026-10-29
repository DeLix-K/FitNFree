-- Friends feed: people who choose to switch Friends on can add each other as friends (by searching for a name, sending a request, and the other person accepting),
-- and see short automatic updates from each other ("logged a workout", "new record", "14-day streak") with emoji cheers. No typed posts or comments.
-- Run this in the Supabase SQL Editor. It needs the existing profiles, workout_logs, user_streaks, exercises, exercise_set_logs and blocked_users. Safe to run more than once.
--
-- WHAT IS PRIVATE (everything is enforced here, in the database, and tested):
--   * Friends is OFF for everyone until they switch it on, and every kind of update (workouts, records, streaks) is its own switch, also OFF until chosen.
--   * Only people who have switched Friends on can be found by name search, so nobody who has not opted in can be sent a request.
--   * A friend request must be accepted by the other person. Declining shows the requester nothing but "pending". Blocking someone (the block list that already
--     exists) ends the friendship and hides both people from each other everywhere here.
--   * Friends see ONLY updates of the kinds the person switched on, and only while both of them have Friends on. Updates are made by the database from real data
--     (a workout log, a streak) or checked against a real logged set (a record); the person's own typed text is never shown, and records of custom exercises
--     (whose names a person writes) are not shared. Names shown are the display names already used on the leaderboard.
--   * A person can see everything they have shared, delete any of it, or leave Friends, which deletes all their friendships, updates and cheers.
--   * Updates older than 60 days disappear. Nothing here can be read by anyone not signed in.
-- The tables are not readable directly (the app uses the functions below). The project's default privileges give new tables and functions extra rights to anon, so
-- those are revoked explicitly.

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────
create table if not exists friend_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  share_workouts boolean not null default false,
  share_records boolean not null default false,
  share_streaks boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_idx on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on friendships (addressee_id, status);
create index if not exists friendships_requester_idx on friendships (requester_id, status);

create table if not exists feed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('workout', 'record', 'streak')),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 800),
  created_at timestamptz not null default now()
);
create index if not exists feed_events_user_idx on feed_events (user_id, created_at desc);
create index if not exists feed_events_created_idx on feed_events (created_at desc);
-- one workout update per person per day, one streak update per person per day
create unique index if not exists feed_events_once_a_day_idx on feed_events (user_id, kind, ((created_at at time zone 'UTC')::date)) where kind in ('workout', 'streak');

create table if not exists feed_cheers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references feed_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('💪', '🔥', '👏', '🎉')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists feed_cheers_event_idx on feed_cheers (event_id);
create index if not exists feed_cheers_user_idx on feed_cheers (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- Helpers (not callable by the app)
-- ─────────────────────────────────────────────
create or replace function friends_blocked(a uuid, b uuid) returns boolean language sql stable as $$
  select exists (select 1 from blocked_users where (blocker_user_id = a and blocked_user_id = b) or (blocker_user_id = b and blocked_user_id = a))
$$;

create or replace function friends_on(u uuid) returns boolean language sql stable as $$
  select coalesce((select enabled from friend_settings where user_id = u), false)
$$;

create or replace function friends_are_friends(a uuid, b uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from friendships f
     where f.status = 'accepted'
       and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  )
$$;

create or replace function friends_display_name(u uuid) returns text language sql stable as $$
  select coalesce(nullif((select display_name from profiles where id = u), ''), 'Fitness Fan')
$$;

-- Ends a friendship and removes the cheers the two people gave each other.
create or replace function friends_cleanup_pair(a uuid, b uuid) returns void language plpgsql as $$
begin
  delete from feed_cheers c using feed_events e where c.event_id = e.id and ((c.user_id = a and e.user_id = b) or (c.user_id = b and e.user_id = a));
  delete from friendships f where least(f.requester_id, f.addressee_id) = least(a, b) and greatest(f.requester_id, f.addressee_id) = greatest(a, b);
end;
$$;

-- Blocking someone (the existing block list) ends any friendship with them.
create or replace function friends_on_block() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform friends_cleanup_pair(new.blocker_user_id, new.blocked_user_id);
  return new;
end;
$$;
drop trigger if exists friends_on_block_trg on blocked_users;
create trigger friends_on_block_trg after insert on blocked_users for each row execute function friends_on_block();

-- ─────────────────────────────────────────────
-- Automatic updates from real data: a workout log and a streak
-- ─────────────────────────────────────────────
create or replace function friends_workout_event() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s friend_settings%rowtype;
  streak int;
begin
  -- This must never stop a workout being logged, whatever happens here.
  begin
    select * into s from friend_settings where user_id = new.user_id and enabled;
    if not found then return new; end if;
    if s.share_workouts then
      insert into feed_events (user_id, kind, payload) values (new.user_id, 'workout', jsonb_build_object('date', new.logged_date)) on conflict do nothing;
    end if;
    if s.share_streaks then
      select current_streak into streak from user_streaks where user_id = new.user_id;
      if streak in (3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365) or (streak > 365 and streak % 100 = 0) then
        insert into feed_events (user_id, kind, payload) values (new.user_id, 'streak', jsonb_build_object('days', streak)) on conflict do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'friends_workout_event: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists friends_workout_event_trg on workout_logs;
create trigger friends_workout_event_trg after insert on workout_logs for each row execute function friends_workout_event();

-- ─────────────────────────────────────────────
-- Functions the app calls: friends
-- ─────────────────────────────────────────────
-- Find people who have switched Friends on, by name. You never see anyone who has not opted in, blocked you, or already has a request or friendship with you.
create or replace function friend_search(p_query text) returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  q text := btrim(coalesce(p_query, ''));
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then raise exception 'friends_not_enabled'; end if;
  if char_length(q) < 2 or char_length(q) > 40 then return; end if;
  return query
  select p.id, coalesce(nullif(p.display_name, ''), 'Fitness Fan')
    from profiles p
    join friend_settings fs on fs.user_id = p.id and fs.enabled
   where p.id <> me
     and coalesce(nullif(p.display_name, ''), 'Fitness Fan') ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and not friends_blocked(me, p.id)
     and not exists (select 1 from friendships f where (f.requester_id = me and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = me))
   order by 2, 1
   limit 20;
end;
$$;

-- Send a request (or accept one they already sent you). Returns 'sent' or 'accepted'.
create or replace function friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  f friendships%rowtype;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then raise exception 'friends_not_enabled'; end if;
  -- One message for every reason a person cannot be reached, so it does not reveal who has Friends on or who blocked whom.
  if p_user is null or p_user = me or not friends_on(p_user) or friends_blocked(me, p_user) then raise exception 'friend_unavailable'; end if;
  if (select count(*) from friendships where status = 'accepted' and (requester_id = me or addressee_id = me)) >= 200 then raise exception 'friend_limit'; end if;
  if (select count(*) from friendships where requester_id = me and status in ('pending', 'declined')) >= 50 then raise exception 'request_limit'; end if;
  if (select count(*) from friendships where requester_id = me and created_at > now() - interval '1 day') >= 20 then raise exception 'request_limit'; end if;

  select * into f from friendships
   where least(requester_id, addressee_id) = least(me, p_user) and greatest(requester_id, addressee_id) = greatest(me, p_user);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requester_id = me then return 'sent'; end if; -- already asked (or was declined: they are shown nothing different)
    if f.status = 'pending' then
      if (select count(*) from friendships where status = 'accepted' and (requester_id = p_user or addressee_id = p_user)) >= 200 then raise exception 'friend_unavailable'; end if;
      update friendships set status = 'accepted', responded_at = now() where id = f.id;
      return 'accepted';
    end if;
    -- they declined an earlier request from me... or I declined theirs: now I am the one asking
    update friendships set requester_id = me, addressee_id = p_user, status = 'pending', created_at = now(), responded_at = null where id = f.id;
    return 'sent';
  end if;
  insert into friendships (requester_id, addressee_id) values (me, p_user);
  return 'sent';
end;
$$;

create or replace function friend_respond(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  f friendships%rowtype;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into f from friendships where id = p_id and addressee_id = me and status = 'pending' for update;
  if not found then raise exception 'request_not_found'; end if;
  if friends_blocked(f.requester_id, me) then
    delete from friendships where id = f.id;
    raise exception 'request_not_found';
  end if;
  if p_accept then
    if not friends_on(me) then raise exception 'friends_not_enabled'; end if;
    if (select count(*) from friendships where status = 'accepted' and (requester_id = me or addressee_id = me)) >= 200 then raise exception 'friend_limit'; end if;
    if (select count(*) from friendships where status = 'accepted' and (requester_id = f.requester_id or addressee_id = f.requester_id)) >= 200 then raise exception 'friend_unavailable'; end if;
    update friendships set status = 'accepted', responded_at = now() where id = f.id;
  else
    update friendships set status = 'declined', responded_at = now() where id = f.id;
  end if;
end;
$$;

-- Remove a friend, or withdraw a request you sent.
create or replace function friend_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  perform friends_cleanup_pair(me, p_user);
end;
$$;

create or replace function friend_list() returns table (friend_id uuid, display_name text, since timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then return; end if;
  return query
  select o.other, friends_display_name(o.other), o.responded_at
    from (select case when f.requester_id = me then f.addressee_id else f.requester_id end as other, f.responded_at
            from friendships f where f.status = 'accepted' and (f.requester_id = me or f.addressee_id = me)) o
   where friends_on(o.other) and not friends_blocked(me, o.other)
   order by 2, 1;
end;
$$;

-- Requests waiting for you ('incoming') and ones you sent ('outgoing'; a declined one still reads as waiting).
create or replace function friend_requests() returns table (id uuid, direction text, user_id uuid, display_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then return; end if;
  return query
  select f.id, case when f.addressee_id = me then 'incoming' else 'outgoing' end,
         case when f.addressee_id = me then f.requester_id else f.addressee_id end,
         friends_display_name(case when f.addressee_id = me then f.requester_id else f.addressee_id end),
         f.created_at
    from friendships f
   where ((f.addressee_id = me and f.status = 'pending') or (f.requester_id = me and f.status in ('pending', 'declined')))
     and not friends_blocked(me, case when f.addressee_id = me then f.requester_id else f.addressee_id end)
   order by f.created_at desc
   limit 100;
end;
$$;

-- ─────────────────────────────────────────────
-- Functions the app calls: the feed
-- ─────────────────────────────────────────────
-- A record (new best weight, estimated 1RM or rep record). The app has already worked it out; the database checks it is real: you have Friends and records switched on,
-- the exercise is one from the library (not a custom one with a name you wrote), and a set exactly like this was logged in the last two days.
create or replace function post_record_event(p_exercise_id uuid, p_weight numeric, p_unit text, p_reps int, p_kinds text[]) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  s friend_settings%rowtype;
  ex_name text;
  v_payload jsonb;
  existing uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select * into s from friend_settings where user_id = me and enabled;
  if not found or not s.share_records then raise exception 'sharing_off'; end if;
  if p_unit not in ('kg', 'lb') or p_weight is null or p_weight < 0 or p_weight > 1000 or p_reps is null or p_reps not between 1 and 100 then raise exception 'record_invalid'; end if;
  if p_kinds is null or cardinality(p_kinds) not between 1 and 3 or not (p_kinds <@ array['weight', 'e1rm', 'reps']) then raise exception 'record_invalid'; end if;
  select e.name into ex_name from exercises e where e.id = p_exercise_id and e.created_by is null;
  if ex_name is null then raise exception 'record_invalid'; end if;
  if not exists (
    select 1 from exercise_set_logs l
     where l.user_id = me and l.exercise_id = p_exercise_id and l.weight = p_weight and l.weight_unit = p_unit and l.reps = p_reps and l.created_at > now() - interval '2 days'
  ) then raise exception 'record_invalid'; end if;
  if (select count(*) from feed_events where user_id = me and kind = 'record' and created_at > now() - interval '1 day') >= 30 then raise exception 'record_limit'; end if;

  v_payload := jsonb_build_object('exercise_id', p_exercise_id, 'exercise', ex_name, 'weight', p_weight, 'unit', p_unit, 'reps', p_reps, 'kinds', to_jsonb(p_kinds));
  select id into existing from feed_events where user_id = me and kind = 'record' and payload = v_payload and created_at > now() - interval '1 day';
  if existing is not null then return existing; end if;
  insert into feed_events (user_id, kind, payload) values (me, 'record', v_payload) returning id into new_id;
  return new_id;
end;
$$;

create or replace function friend_feed(p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, user_id uuid, display_name text, kind text, payload jsonb, created_at timestamptz, cheers jsonb, my_cheer text, is_mine boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then raise exception 'friends_not_enabled'; end if;
  delete from feed_events fe where fe.created_at < now() - interval '60 days';
  return query
  select e.id, e.user_id, friends_display_name(e.user_id), e.kind, e.payload, e.created_at,
         coalesce((select jsonb_object_agg(c.emoji, c.n) from (select fc.emoji, count(*)::int as n from feed_cheers fc where fc.event_id = e.id group by fc.emoji) c), '{}'::jsonb),
         (select fc.emoji from feed_cheers fc where fc.event_id = e.id and fc.user_id = me),
         e.user_id = me
    from feed_events e
   where e.created_at > now() - interval '60 days'
     and (p_before is null or e.created_at < p_before)
     and (
       e.user_id = me
       or (
         friends_are_friends(me, e.user_id)
         and not friends_blocked(me, e.user_id)
         and exists (
           select 1 from friend_settings fs
            where fs.user_id = e.user_id and fs.enabled
              and ((e.kind = 'workout' and fs.share_workouts) or (e.kind = 'record' and fs.share_records) or (e.kind = 'streak' and fs.share_streaks))
         )
       )
     )
   order by e.created_at desc, e.id desc
   limit lim;
end;
$$;

-- Cheer a friend's update (the same emoji again takes your cheer back; a different one changes it). Returns the emoji now showing, or '' when removed.
create or replace function cheer_event(p_event uuid, p_emoji text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  e feed_events%rowtype;
  c feed_cheers%rowtype;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not friends_on(me) then raise exception 'friends_not_enabled'; end if;
  if p_emoji not in ('💪', '🔥', '👏', '🎉') then raise exception 'cheer_invalid'; end if;
  select * into e from feed_events where id = p_event and created_at > now() - interval '60 days';
  if not found or e.user_id = me or not friends_are_friends(me, e.user_id) or friends_blocked(me, e.user_id) or not exists (
    select 1 from friend_settings fs
     where fs.user_id = e.user_id and fs.enabled
       and ((e.kind = 'workout' and fs.share_workouts) or (e.kind = 'record' and fs.share_records) or (e.kind = 'streak' and fs.share_streaks))
  ) then raise exception 'event_not_found'; end if;
  select * into c from feed_cheers where event_id = e.id and user_id = me;
  if found then
    if c.emoji = p_emoji then
      delete from feed_cheers where id = c.id;
      return '';
    end if;
    update feed_cheers set emoji = p_emoji where id = c.id;
    return p_emoji;
  end if;
  if (select count(*) from feed_cheers where user_id = me and created_at > now() - interval '1 day') >= 200 then raise exception 'cheer_limit'; end if;
  insert into feed_cheers (event_id, user_id, emoji) values (e.id, me, p_emoji);
  return p_emoji;
end;
$$;

-- Everything you have shared, so you can see it and delete it.
create or replace function my_shared_events() returns table (id uuid, kind text, payload jsonb, created_at timestamptz, cheer_count int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  return query
  select e.id, e.kind, e.payload, e.created_at, (select count(*)::int from feed_cheers fc where fc.event_id = e.id)
    from feed_events e where e.user_id = me order by e.created_at desc limit 200;
end;
$$;

create or replace function delete_feed_event(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from feed_events where id = p_id and user_id = auth.uid();
  if not found then raise exception 'event_not_found'; end if;
end;
$$;

-- Leave Friends: switches everything off and deletes your friendships, your shared updates and the cheers you gave.
create or replace function friends_leave() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  delete from feed_cheers where user_id = me;
  delete from feed_events where user_id = me;
  delete from friendships where requester_id = me or addressee_id = me;
  update friend_settings set enabled = false, share_workouts = false, share_records = false, share_streaks = false, updated_at = now() where user_id = me;
end;
$$;

-- ─────────────────────────────────────────────
-- Access
-- ─────────────────────────────────────────────
alter table friend_settings enable row level security;
alter table friendships enable row level security;
alter table feed_events enable row level security;
alter table feed_cheers enable row level security;

revoke all on friend_settings, friendships, feed_events, feed_cheers from anon, authenticated;

-- Your own switches: you read and change them yourself.
grant select, insert, update on friend_settings to authenticated;
drop policy if exists "Read my own friend settings" on friend_settings;
create policy "Read my own friend settings" on friend_settings for select to authenticated using (user_id = auth.uid());
drop policy if exists "Create my own friend settings" on friend_settings;
create policy "Create my own friend settings" on friend_settings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Change my own friend settings" on friend_settings;
create policy "Change my own friend settings" on friend_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Turning a switch off or Friends off leaves old updates in place but hidden (the reads above check the switches every time); touch updated_at.
create or replace function friend_settings_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- if Friends itself is off, nothing is shared
  if not new.enabled then new.share_workouts = false; new.share_records = false; new.share_streaks = false; end if;
  return new;
end;
$$;
drop trigger if exists friend_settings_touch_trg on friend_settings;
create trigger friend_settings_touch_trg before insert or update on friend_settings for each row execute function friend_settings_touch();

-- Helpers and triggers are not for the app to call.
revoke all on function friends_blocked(uuid, uuid), friends_on(uuid), friends_are_friends(uuid, uuid), friends_display_name(uuid), friends_cleanup_pair(uuid, uuid),
  friends_on_block(), friends_workout_event(), friend_settings_touch() from public, anon, authenticated;

-- The functions the app uses: signed-in users only.
revoke all on function friend_search(text), friend_request(uuid), friend_respond(uuid, boolean), friend_remove(uuid), friend_list(), friend_requests(),
  post_record_event(uuid, numeric, text, int, text[]), friend_feed(int, timestamptz), cheer_event(uuid, text), my_shared_events(), delete_feed_event(uuid), friends_leave()
  from public, anon;
grant execute on function friend_search(text), friend_request(uuid), friend_respond(uuid, boolean), friend_remove(uuid), friend_list(), friend_requests(),
  post_record_event(uuid, numeric, text, int, text[]), friend_feed(int, timestamptz), cheer_event(uuid, text), my_shared_events(), delete_feed_event(uuid), friends_leave()
  to authenticated;
