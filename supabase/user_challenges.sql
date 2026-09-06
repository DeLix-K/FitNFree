-- Lets any user create their own challenge (previously admin-only) and
-- invite other FitNFree users to join it. Progress tracking reuses the
-- existing, already-working challenge_progress mechanic (days a workout was
-- logged within the challenge's date range) for every challenge regardless
-- of theme -- target_note is a purely descriptive goal label (e.g. "Goal:
-- 50 push-ups/day" or "Goal: 60kg bench press") shown on the card, not a
-- second progress metric, since there's no real way to verify a reported
-- rep count or weight lifted.
-- ─────────────────────────────────────────────
alter table challenges add column if not exists creator_user_id uuid references auth.users(id) on delete set null;
alter table challenges add column if not exists target_note text not null default '';

-- The existing "for all" admin policy stays (covers curated/official
-- challenges with creator_user_id null); these add self-service create and
-- manage-your-own-creation on top of it. Permissive policies are OR'd
-- together, so admins keep full access via the existing policy.
drop policy if exists "Users can create their own challenges" on challenges;
create policy "Users can create their own challenges"
  on challenges for insert
  with check (creator_user_id = auth.uid());

drop policy if exists "Users can update their own created challenges" on challenges;
create policy "Users can update their own created challenges"
  on challenges for update
  using (creator_user_id = auth.uid())
  with check (creator_user_id = auth.uid());

drop policy if exists "Users can delete their own created challenges" on challenges;
create policy "Users can delete their own created challenges"
  on challenges for delete
  using (creator_user_id = auth.uid());

-- ─────────────────────────────────────────────
-- Challenge invites: invite another FitNFree user (searched by display name
-- via the existing public `leaderboard` view) to join a challenge. Real,
-- persisted, visible to the invitee on their own Challenges screen -- no
-- email/push infrastructure required since both users are already in-app.
-- ─────────────────────────────────────────────
create table if not exists challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (challenge_id, invitee_user_id)
);

alter table challenge_invites enable row level security;

drop policy if exists "Participants can see invites they sent or received" on challenge_invites;
create policy "Participants can see invites they sent or received"
  on challenge_invites for select
  using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

drop policy if exists "Users can send invites" on challenge_invites;
create policy "Users can send invites"
  on challenge_invites for insert
  with check (auth.uid() = inviter_user_id and inviter_user_id <> invitee_user_id);

drop policy if exists "Invitee can respond to their invite" on challenge_invites;
create policy "Invitee can respond to their invite"
  on challenge_invites for update
  using (auth.uid() = invitee_user_id)
  with check (auth.uid() = invitee_user_id);

drop policy if exists "Inviter can cancel their invite" on challenge_invites;
create policy "Inviter can cancel their invite"
  on challenge_invites for delete
  using (auth.uid() = inviter_user_id);

grant select, insert, update, delete on challenge_invites to authenticated;
grant select, insert, update, delete on challenge_invites to service_role;
