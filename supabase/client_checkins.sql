-- Client check-in forms: a trainer builds a weekly check-in form, links their clients to it with a one-time invite code, and the clients fill it in inside the app.
-- Run this in the Supabase SQL Editor AFTER trainer_tools.sql (it refers to trainer_clients and trainer_profiles). Safe to run more than once.
--
-- WHO CAN SEE WHAT (this is health information about one person that is handed to one other person, so the rules are strict):
--   * The form is the trainer's. Clients never read the table; they get the form for a link they are on through a function.
--   * A person becomes a client of a trainer ONLY by typing an invite code the trainer made for them. The trainer cannot link anyone by choosing them, and cannot
--     read who the person is: the trainer sees only the name the trainer typed when making the invite. The code is random (8 characters), single-use and expires
--     after 7 days; it is stored only as a hash; a person who types wrong codes is stopped after 8 tries an hour.
--   * Answers go to ONE trainer: the one on that link. Other trainers, other users and anonymous visitors cannot read them.
--   * Either side can end a link at any time. Once a link has ended the trainer can no longer read what the client sent while it was active; the client keeps it
--     and can delete any of it. (Deleting an account deletes its links and submissions, on both sides.)
--   * A client's answers are saved by a function (submit_checkin) that builds the question list itself from the trainer's current form, so a client cannot invent
--     questions, and checks every answer's type and range. Each submission keeps a copy of the questions it answered, so later edits to the form never change old answers.
--   * Nothing here takes a photo or a file. Progress photos stay on the phone.
-- The project's default privileges give new tables and functions extra rights to anon, so those are revoked explicitly.

-- ─────────────────────────────────────────────
-- The standard questions (a copy of STANDARD_QUESTIONS in lib/checkinForms.ts; a test compares the two)
-- ─────────────────────────────────────────────
create or replace function checkin_standard_catalog() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'weight',    jsonb_build_object('label', 'Body weight', 'type', 'number', 'unit', 'kg', 'min', 20, 'max', 500),
    'energy',    jsonb_build_object('label', 'Energy levels', 'type', 'scale', 'max', 5),
    'sleep',     jsonb_build_object('label', 'Sleep quality', 'type', 'scale', 'max', 5),
    'stress',    jsonb_build_object('label', 'Stress levels', 'type', 'scale', 'max', 5),
    'soreness',  jsonb_build_object('label', 'Muscle soreness', 'type', 'scale', 'max', 5),
    'training',  jsonb_build_object('label', 'How much of your training plan did you do?', 'type', 'choice', 'options', jsonb_build_array('All of it', 'Most of it', 'Some of it', 'Hardly any')),
    'nutrition', jsonb_build_object('label', 'How closely did you follow your nutrition plan?', 'type', 'choice', 'options', jsonb_build_array('All of it', 'Most of it', 'Some of it', 'Hardly any')),
    'wins',      jsonb_build_object('label', 'Wins this week', 'type', 'text'),
    'struggles', jsonb_build_object('label', 'What was hard this week?', 'type', 'text'),
    'questions', jsonb_build_object('label', 'Questions for your coach', 'type', 'text')
  )
$$;

-- ─────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────
-- One form per trainer: which standard questions are on, and up to 10 questions of their own.
create table if not exists checkin_forms (
  trainer_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Weekly check-in' check (char_length(title) between 1 and 60),
  intro text check (intro is null or char_length(intro) <= 300),
  standard jsonb not null default '[]'::jsonb,
  custom jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A trainer-and-client link. Made by create_checkin_invite, completed by the client with redeem_checkin_invite, ended by either with end_checkin_link.
create table if not exists trainer_client_links (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid references auth.users(id) on delete cascade,
  tracked_client_id uuid references trainer_clients(id) on delete set null,
  label text not null check (char_length(label) between 1 and 80),
  status text not null default 'invited' check (status in ('invited', 'active', 'ended')),
  code_hash text,
  code_expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by_role text check (ended_by_role is null or ended_by_role in ('trainer', 'client')),
  check ((status = 'invited') = (code_hash is not null)),
  check (status <> 'active' or client_user_id is not null)
);
create index if not exists trainer_client_links_trainer_idx on trainer_client_links (trainer_id, status);
create index if not exists trainer_client_links_client_idx on trainer_client_links (client_user_id, status);
create unique index if not exists trainer_client_links_code_idx on trainer_client_links (code_hash) where code_hash is not null;
create unique index if not exists trainer_client_links_active_pair_idx on trainer_client_links (trainer_id, client_user_id) where status = 'active';

create table if not exists checkin_submissions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references trainer_client_links(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  form jsonb not null,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  read_at timestamptz,
  trainer_feedback text check (trainer_feedback is null or char_length(trainer_feedback) <= 1000),
  feedback_at timestamptz
);
create index if not exists checkin_submissions_trainer_idx on checkin_submissions (trainer_id, submitted_at desc);
create index if not exists checkin_submissions_client_idx on checkin_submissions (client_user_id, submitted_at desc);
create index if not exists checkin_submissions_link_idx on checkin_submissions (link_id, submitted_at desc);

-- Wrong invite codes, to slow down guessing. Nobody can read this table.
create table if not exists checkin_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists checkin_invite_attempts_idx on checkin_invite_attempts (user_id, at desc);

-- ─────────────────────────────────────────────
-- Rules for a form (a trainer cannot save a malformed or oversized one)
-- ─────────────────────────────────────────────
create or replace function checkin_form_validate() returns trigger language plpgsql as $$
declare
  cat jsonb := checkin_standard_catalog();
  e jsonb;
  q jsonb;
  k text;
  seen text[] := '{}';
  opt jsonb;
  nopts int;
  total int;
begin
  new.updated_at = now();
  if jsonb_typeof(new.standard) is distinct from 'array' or jsonb_typeof(new.custom) is distinct from 'array' then
    raise exception 'checkin_form_invalid: expected lists';
  end if;
  if jsonb_array_length(new.custom) > 10 then raise exception 'checkin_form_invalid: at most 10 questions of your own'; end if;
  -- A safety net only: the limits on each question already keep a form far below this.
  if octet_length(new.custom::text) > 40000 then raise exception 'checkin_form_invalid: questions are too long'; end if;

  for e in select * from jsonb_array_elements(new.standard) loop
    if jsonb_typeof(e) <> 'string' or not (cat ? (e #>> '{}')) then raise exception 'checkin_form_invalid: unknown standard question'; end if;
    k := e #>> '{}';
    if k = any(seen) then raise exception 'checkin_form_invalid: a standard question is listed twice'; end if;
    seen := seen || k;
  end loop;

  for q in select * from jsonb_array_elements(new.custom) loop
    if jsonb_typeof(q) <> 'object' then raise exception 'checkin_form_invalid: a question is malformed'; end if;
    if exists (select 1 from jsonb_object_keys(q) key where key not in ('id', 'label', 'type', 'options', 'unit', 'max')) then
      raise exception 'checkin_form_invalid: a question has an unknown field';
    end if;
    if jsonb_typeof(q -> 'id') is distinct from 'string' or (q ->> 'id') !~ '^[a-z][a-z0-9_]{0,19}$' then raise exception 'checkin_form_invalid: a question has a bad id'; end if;
    k := q ->> 'id';
    if cat ? k or k = any(seen) then raise exception 'checkin_form_invalid: two questions share an id'; end if;
    seen := seen || k;
    if jsonb_typeof(q -> 'label') is distinct from 'string' or char_length(btrim(q ->> 'label')) not between 1 and 120 then
      raise exception 'checkin_form_invalid: a question needs a label of 1 to 120 characters';
    end if;
    case q ->> 'type'
      when 'text' then
        if q ? 'options' or q ? 'unit' or q ? 'max' then raise exception 'checkin_form_invalid: a text question has extra fields'; end if;
      when 'yesno' then
        if q ? 'options' or q ? 'unit' or q ? 'max' then raise exception 'checkin_form_invalid: a yes/no question has extra fields'; end if;
      when 'number' then
        if q ? 'options' or q ? 'max' then raise exception 'checkin_form_invalid: a number question has extra fields'; end if;
        if q ? 'unit' and (jsonb_typeof(q -> 'unit') <> 'string' or char_length(q ->> 'unit') > 12) then raise exception 'checkin_form_invalid: a unit is too long'; end if;
      when 'scale' then
        if q ? 'options' or q ? 'unit' then raise exception 'checkin_form_invalid: a scale question has extra fields'; end if;
        if jsonb_typeof(q -> 'max') is distinct from 'number' or (q ->> 'max') not in ('5', '10') then raise exception 'checkin_form_invalid: a scale goes to 5 or 10'; end if;
      when 'choice' then
        if q ? 'unit' or q ? 'max' then raise exception 'checkin_form_invalid: a choice question has extra fields'; end if;
        if jsonb_typeof(q -> 'options') is distinct from 'array' then raise exception 'checkin_form_invalid: a choice question needs options'; end if;
        nopts := jsonb_array_length(q -> 'options');
        if nopts not between 2 and 8 then raise exception 'checkin_form_invalid: a choice question needs 2 to 8 options'; end if;
        for opt in select * from jsonb_array_elements(q -> 'options') loop
          if jsonb_typeof(opt) <> 'string' or char_length(btrim(opt #>> '{}')) not between 1 and 40 then raise exception 'checkin_form_invalid: an option needs 1 to 40 characters'; end if;
        end loop;
        if (select count(distinct btrim(o)) from jsonb_array_elements_text(q -> 'options') o) <> nopts then raise exception 'checkin_form_invalid: options must differ'; end if;
      else
        raise exception 'checkin_form_invalid: unknown question type';
    end case;
  end loop;

  total := jsonb_array_length(new.standard) + jsonb_array_length(new.custom);
  if total < 1 then raise exception 'checkin_form_invalid: add at least one question'; end if;
  return new;
end;
$$;
drop trigger if exists checkin_form_validate_trg on checkin_forms;
create trigger checkin_form_validate_trg before insert or update on checkin_forms for each row execute function checkin_form_validate();

-- The full, ordered question list for a form: standard questions in a fixed order, then the trainer's own.
create or replace function checkin_form_questions(p_standard jsonb, p_custom jsonb) returns jsonb language plpgsql stable as $$
declare
  cat jsonb := checkin_standard_catalog();
  keys text[] := array['weight', 'energy', 'sleep', 'stress', 'soreness', 'training', 'nutrition', 'wins', 'struggles', 'questions'];
  k text;
  c jsonb;
  out jsonb := '[]'::jsonb;
begin
  foreach k in array keys loop
    if p_standard ? k then out := out || jsonb_build_array(jsonb_build_object('id', k) || (cat -> k)); end if;
  end loop;
  for c in select * from jsonb_array_elements(p_custom) loop
    out := out || jsonb_build_array(c);
  end loop;
  return out;
end;
$$;

-- Checks a client's answers against the question list and returns only the answered ones, cleaned. Unanswered questions are simply left out.
create or replace function checkin_answers_clean(p_questions jsonb, p_answers jsonb) returns jsonb language plpgsql stable as $$
declare
  q jsonb;
  qid text;
  a jsonb;
  t text;
  num numeric;
  lo numeric;
  hi numeric;
  s text;
  out jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'checkin_invalid: answers must be an object'; end if;
  if octet_length(p_answers::text) > 20000 then raise exception 'checkin_invalid: the answers are too long'; end if;
  if exists (select 1 from jsonb_object_keys(p_answers) k where not exists (select 1 from jsonb_array_elements(p_questions) x where x ->> 'id' = k)) then
    raise exception 'checkin_invalid: an answer is for a question that is not on the form';
  end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    qid := q ->> 'id';
    a := p_answers -> qid;
    continue when a is null or jsonb_typeof(a) = 'null';
    t := q ->> 'type';
    if t = 'number' then
      if jsonb_typeof(a) <> 'number' then raise exception 'checkin_invalid: % needs a number', qid; end if;
      num := (a #>> '{}')::numeric;
      lo := coalesce((q ->> 'min')::numeric, -1000000);
      hi := coalesce((q ->> 'max')::numeric, 1000000);
      if num < lo or num > hi then raise exception 'checkin_invalid: % is out of range', qid; end if;
      out := out || jsonb_build_object(qid, a);
    elsif t = 'scale' then
      if jsonb_typeof(a) <> 'number' then raise exception 'checkin_invalid: % needs a number', qid; end if;
      num := (a #>> '{}')::numeric;
      if num <> trunc(num) or num < 1 or num > (q ->> 'max')::numeric then raise exception 'checkin_invalid: % is out of range', qid; end if;
      out := out || jsonb_build_object(qid, a);
    elsif t = 'yesno' then
      if jsonb_typeof(a) <> 'boolean' then raise exception 'checkin_invalid: % needs yes or no', qid; end if;
      out := out || jsonb_build_object(qid, a);
    elsif t = 'choice' then
      if jsonb_typeof(a) <> 'string' or not ((q -> 'options') ? (a #>> '{}')) then raise exception 'checkin_invalid: % is not one of the options', qid; end if;
      out := out || jsonb_build_object(qid, a);
    elsif t = 'text' then
      if jsonb_typeof(a) <> 'string' then raise exception 'checkin_invalid: % needs text', qid; end if;
      s := btrim(a #>> '{}');
      continue when s = '';
      if char_length(s) > 1000 then raise exception 'checkin_invalid: % is too long', qid; end if;
      out := out || jsonb_build_object(qid, to_jsonb(s));
    else
      raise exception 'checkin_invalid: unknown question type';
    end if;
  end loop;
  if out = '{}'::jsonb then raise exception 'checkin_empty'; end if;
  return out;
end;
$$;

-- ─────────────────────────────────────────────
-- Functions the app calls
-- ─────────────────────────────────────────────
-- Trainer: make a one-time invite code for a client. Returns the code (the only time it is ever visible; only its hash is kept).
create or replace function create_checkin_invite(p_label text, p_tracked_client_id uuid default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  lbl text := btrim(coalesce(p_label, ''));
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 letters and digits with nothing easily confused (no I, O, 0, 1)
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10]; -- the fully random bytes of a random uuid
  bytes bytea;
  code text;
  i int;
  tries int := 0;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from trainer_profiles where user_id = uid) then raise exception 'not_a_trainer'; end if;
  if char_length(lbl) not between 1 and 80 then raise exception 'invalid_label'; end if;
  if p_tracked_client_id is not null and not exists (select 1 from trainer_clients where id = p_tracked_client_id and trainer_id = uid) then raise exception 'invalid_client'; end if;
  if (select count(*) from trainer_client_links where trainer_id = uid and status in ('invited', 'active')) >= 300 then raise exception 'link_limit'; end if;
  if (select count(*) from trainer_client_links where trainer_id = uid and status = 'invited' and code_expires_at > now()) >= 50 then raise exception 'too_many_invites'; end if;
  loop
    bytes := uuid_send(gen_random_uuid());
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, (get_byte(bytes, idx[i]) % 32) + 1, 1);
    end loop;
    begin
      insert into trainer_client_links (trainer_id, tracked_client_id, label, status, code_hash, code_expires_at)
      values (uid, p_tracked_client_id, lbl, 'invited', encode(sha256(convert_to(code, 'UTF8')), 'hex'), now() + interval '7 days');
      return code;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;
end;
$$;

-- Client: use an invite code. Returns {ok, error?, link_id?, trainer_name?}. A wrong code is counted (8 an hour) and answered, not raised, so the count is kept.
create or replace function redeem_checkin_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  l trainer_client_links%rowtype;
  tname text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from checkin_invite_attempts where at < now() - interval '1 day';
  if (select count(*) from checkin_invite_attempts where user_id = uid and at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  select * into l from trainer_client_links
   where char_length(norm) = 8 and code_hash = encode(sha256(convert_to(norm, 'UTF8')), 'hex') and status = 'invited' and code_expires_at > now()
   for update;
  if not found then
    insert into checkin_invite_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if l.trainer_id = uid then return jsonb_build_object('ok', false, 'error', 'own_invite'); end if;
  if exists (select 1 from trainer_client_links where trainer_id = l.trainer_id and client_user_id = uid and status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  update trainer_client_links set client_user_id = uid, status = 'active', accepted_at = now(), code_hash = null, code_expires_at = null where id = l.id;
  select display_name into tname from trainer_profiles where user_id = l.trainer_id;
  return jsonb_build_object('ok', true, 'link_id', l.id, 'trainer_name', coalesce(tname, 'Your trainer'));
end;
$$;

-- Either side: end a link (or withdraw an invite that has not been used).
create or replace function end_checkin_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update trainer_client_links
     set status = 'ended', ended_at = now(), code_hash = null, code_expires_at = null,
         ended_by_role = case when trainer_id = uid then 'trainer' else 'client' end
   where id = p_link_id and status in ('invited', 'active') and (trainer_id = uid or client_user_id = uid);
  if not found then raise exception 'link_not_found'; end if;
end;
$$;

-- Client: the trainers they are linked to.
create or replace function my_checkin_links() returns table (link_id uuid, trainer_user_id uuid, trainer_name text, accepted_at timestamptz, last_submitted_at timestamptz, form_ready boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.id, l.trainer_id, coalesce(tp.display_name, 'Your trainer'), l.accepted_at,
         (select max(s.submitted_at) from checkin_submissions s where s.link_id = l.id),
         exists (select 1 from checkin_forms f where f.trainer_id = l.trainer_id)
    from trainer_client_links l
    left join trainer_profiles tp on tp.user_id = l.trainer_id
   where l.client_user_id = auth.uid() and l.status = 'active'
   order by l.accepted_at desc
$$;

-- Client: the current form of the trainer on one of their links.
create or replace function checkin_form_for_link(p_link_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('title', f.title, 'intro', f.intro, 'questions', checkin_form_questions(f.standard, f.custom))
    from trainer_client_links l
    join checkin_forms f on f.trainer_id = l.trainer_id
   where l.id = p_link_id and l.client_user_id = auth.uid() and l.status = 'active'
$$;

-- Client: every check-in they have sent, newest first (including ones on links that have since ended).
create or replace function my_checkin_submissions() returns table (id uuid, link_id uuid, trainer_name text, form jsonb, answers jsonb, submitted_at timestamptz, trainer_feedback text, feedback_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.link_id, coalesce(tp.display_name, 'Your trainer'), s.form, s.answers, s.submitted_at, s.trainer_feedback, s.feedback_at
    from checkin_submissions s
    left join trainer_profiles tp on tp.user_id = s.trainer_id
   where s.client_user_id = auth.uid()
   order by s.submitted_at desc
   limit 500
$$;

-- Client: delete one of their own check-ins.
create or replace function delete_my_checkin(p_submission_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from checkin_submissions where id = p_submission_id and client_user_id = auth.uid();
  if not found then raise exception 'submission_not_found'; end if;
end;
$$;

-- Client: send a check-in.
create or replace function submit_checkin(p_link_id uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  l trainer_client_links%rowtype;
  f checkin_forms%rowtype;
  qs jsonb;
  clean jsonb;
  sid uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into l from trainer_client_links where id = p_link_id and client_user_id = uid and status = 'active';
  if not found then raise exception 'link_not_active'; end if;
  select * into f from checkin_forms where trainer_id = l.trainer_id;
  if not found then raise exception 'no_form'; end if;
  if (select count(*) from checkin_submissions where link_id = l.id and submitted_at > now() - interval '1 day') >= 20 then raise exception 'checkin_rate_limit'; end if;
  if (select count(*) from checkin_submissions where link_id = l.id) >= 2000 then raise exception 'checkin_limit'; end if;
  qs := checkin_form_questions(f.standard, f.custom);
  clean := checkin_answers_clean(qs, p_answers);
  insert into checkin_submissions (link_id, trainer_id, client_user_id, form, answers)
  values (l.id, l.trainer_id, uid, jsonb_build_object('title', f.title, 'questions', qs), clean)
  returning id into sid;
  return sid;
end;
$$;

-- Trainer: write feedback on a check-in (this also marks it read).
create or replace function review_checkin(p_submission_id uuid, p_feedback text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  fb text := nullif(btrim(coalesce(p_feedback, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if fb is not null and char_length(fb) > 1000 then raise exception 'feedback_too_long'; end if;
  update checkin_submissions s
     set trainer_feedback = fb, feedback_at = case when fb is null then null else now() end, read_at = coalesce(s.read_at, now())
   where s.id = p_submission_id and s.trainer_id = uid
     and exists (select 1 from trainer_client_links l where l.id = s.link_id and l.status = 'active');
  if not found then raise exception 'submission_not_found'; end if;
end;
$$;

-- Trainer: mark a check-in as read.
create or replace function mark_checkin_read(p_submission_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update checkin_submissions s set read_at = coalesce(s.read_at, now())
   where s.id = p_submission_id and s.trainer_id = uid
     and exists (select 1 from trainer_client_links l where l.id = s.link_id and l.status = 'active');
end;
$$;

-- ─────────────────────────────────────────────
-- Access
-- ─────────────────────────────────────────────
alter table checkin_forms enable row level security;
alter table trainer_client_links enable row level security;
alter table checkin_submissions enable row level security;
alter table checkin_invite_attempts enable row level security;

revoke all on checkin_forms, trainer_client_links, checkin_submissions, checkin_invite_attempts from anon, authenticated;

-- The trainer's own form: they read and write it themselves (only trainers can create one).
grant select, insert, update, delete on checkin_forms to authenticated;
drop policy if exists "Trainers read their own form" on checkin_forms;
create policy "Trainers read their own form" on checkin_forms for select to authenticated using (trainer_id = auth.uid());
drop policy if exists "Trainers create their own form" on checkin_forms;
create policy "Trainers create their own form" on checkin_forms for insert to authenticated
  with check (trainer_id = auth.uid() and exists (select 1 from trainer_profiles tp where tp.user_id = auth.uid()));
drop policy if exists "Trainers edit their own form" on checkin_forms;
create policy "Trainers edit their own form" on checkin_forms for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists "Trainers delete their own form" on checkin_forms;
create policy "Trainers delete their own form" on checkin_forms for delete to authenticated using (trainer_id = auth.uid());

-- Links: a trainer reads their own, without the code hash and without the client's account id. Nobody writes them directly.
grant select (id, trainer_id, tracked_client_id, label, status, code_expires_at, created_at, accepted_at, ended_at, ended_by_role) on trainer_client_links to authenticated;
drop policy if exists "Trainers read their own links" on trainer_client_links;
create policy "Trainers read their own links" on trainer_client_links for select to authenticated using (trainer_id = auth.uid());

-- Submissions: the trainer reads those on a link that is still active, without the client's account id; the client reads their own through my_checkin_submissions()
-- (so a person who is both a trainer and a client never mixes the two) and deletes them through delete_my_checkin(). Nobody inserts, edits or deletes directly:
-- submit_checkin, review_checkin, mark_checkin_read and delete_my_checkin do it.
grant select (id, link_id, trainer_id, form, answers, submitted_at, read_at, trainer_feedback, feedback_at) on checkin_submissions to authenticated;
drop policy if exists "Clients read their own check-ins" on checkin_submissions;
drop policy if exists "Trainers read check-ins on active links" on checkin_submissions;
create policy "Trainers read check-ins on active links" on checkin_submissions for select to authenticated
  using (trainer_id = auth.uid() and exists (select 1 from trainer_client_links l where l.id = link_id and l.status = 'active' and l.trainer_id = auth.uid()));
drop policy if exists "Clients delete their own check-ins" on checkin_submissions;

-- Functions: signed-in users only.
revoke all on function checkin_form_questions(jsonb, jsonb), checkin_answers_clean(jsonb, jsonb), checkin_form_validate() from public, anon, authenticated;
revoke all on function create_checkin_invite(text, uuid), redeem_checkin_invite(text), end_checkin_link(uuid), my_checkin_links(), checkin_form_for_link(uuid), my_checkin_submissions(), delete_my_checkin(uuid),
  submit_checkin(uuid, jsonb), review_checkin(uuid, text), mark_checkin_read(uuid) from public, anon;
grant execute on function create_checkin_invite(text, uuid), redeem_checkin_invite(text), end_checkin_link(uuid), my_checkin_links(), checkin_form_for_link(uuid), my_checkin_submissions(), delete_my_checkin(uuid),
  submit_checkin(uuid, jsonb), review_checkin(uuid, text), mark_checkin_read(uuid) to authenticated;
revoke all on function checkin_standard_catalog() from public, anon;
grant execute on function checkin_standard_catalog() to authenticated;
