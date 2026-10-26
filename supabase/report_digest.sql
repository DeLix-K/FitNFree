-- Report digest: lets the report-digest Edge Function email you the reports nobody has been told about yet.
-- Run this in the Supabase SQL Editor (after content_reports.sql and trainer_moderation.sql). Safe to run more than once.
--
-- What it adds:
--   * digest_sent_at  when the report was included in an email (null = you have not been told yet)
--   * reviewed_at     when you dealt with it (you set this by hand)
--   * action          what you did: none, removed, warned, suspended, dismissed (you set this by hand)
-- and two functions that ONLY the service role (the Edge Function) can call. Nobody signed in to the app can read, change or call any of this.

alter table content_reports add column if not exists digest_sent_at timestamptz;
alter table content_reports add column if not exists reviewed_at timestamptz;
alter table content_reports add column if not exists action text;
alter table content_reports drop constraint if exists content_reports_action_check;
alter table content_reports add constraint content_reports_action_check
  check (action is null or action in ('none', 'removed', 'warned', 'suspended', 'dismissed'));

alter table message_reports add column if not exists digest_sent_at timestamptz;
alter table message_reports add column if not exists reviewed_at timestamptz;
alter table message_reports add column if not exists action text;
alter table message_reports drop constraint if exists message_reports_action_check;
alter table message_reports add constraint message_reports_action_check
  check (action is null or action in ('none', 'removed', 'warned', 'suspended', 'dismissed'));

-- Reports that have not been in an email yet. Ids and text only: never an email address.
create or replace function public.unsent_reports(p_limit int default 100)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'content', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select id, kind, target_id, reported_user_id, label, left(reason, 1000) as reason, created_at
        from public.content_reports
        where digest_sent_at is null
        order by created_at
        limit greatest(1, least(coalesce(p_limit, 100), 200))
      ) r
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
      from (
        select id, trainer_user_id, client_user_id, reported_user_id, left(reason, 1000) as reason, created_at
        from public.message_reports
        where digest_sent_at is null
        order by created_at
        limit greatest(1, least(coalesce(p_limit, 100), 200))
      ) m
    ), '[]'::jsonb)
  );
$$;

-- Marks reports as emailed. Called only after the email was accepted, so a failed send is simply retried on the next run.
create or replace function public.mark_reports_sent(p_content uuid[], p_messages uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.content_reports set digest_sent_at = now() where id = any(coalesce(p_content, '{}')) and digest_sent_at is null;
  update public.message_reports set digest_sent_at = now() where id = any(coalesce(p_messages, '{}')) and digest_sent_at is null;
end;
$$;

revoke all on function public.unsent_reports(int) from public, anon, authenticated;
revoke all on function public.mark_reports_sent(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.unsent_reports(int) to service_role;
grant execute on function public.mark_reports_sent(uuid[], uuid[]) to service_role;
