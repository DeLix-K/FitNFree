-- AI cost controls, part 1: a shared response cache for "routine" one-shot
-- AI calls (nutrition lookups, per-exercise cues, equipment/food/menu
-- identification). Many users ask the same or a near-identical routine
-- question -- "chicken breast", the mind-muscle cue for "Barbell Squat" --
-- so a real cache meaningfully cuts Anthropic API spend without changing
-- what the user sees. See ask-claude/index.ts for how it's used; part 2
-- (model tiering) is in that same function and needs no schema change.
--
-- Not personal data: only routine, non-conversational prompts are ever
-- written here (askClaude's `routine: true` calls -- never the AI Coach
-- chat, coach memory, mood reflection, or anything else personalized/
-- sensitive), and a cache row is addressed only by a hash of its own
-- content, so it can't be looked up by user. Shared across all users on
-- purpose, like the exercises or courses catalogs.
--
-- Run this in the Supabase SQL Editor.

create table if not exists ai_response_cache (
  prompt_hash text primary key,
  reply text not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table ai_response_cache enable row level security;

-- ask-claude runs as the calling user (not service_role -- see its own
-- comment on why), so authenticated is the role that needs access. Reads
-- and writes are of shared, non-personal cache rows, same trust level as
-- the exercises/courses catalogs.
drop policy if exists "Authenticated users can read the shared AI cache" on ai_response_cache;
create policy "Authenticated users can read the shared AI cache"
  on ai_response_cache for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can add to the shared AI cache" on ai_response_cache;
create policy "Authenticated users can add to the shared AI cache"
  on ai_response_cache for insert
  with check (auth.role() = 'authenticated');

grant select, insert on ai_response_cache to authenticated;

-- A rough way to see the cache earning its keep: compare this to
-- ai_history's row count for the same period.
comment on table ai_response_cache is
  'Shared cache of routine (non-conversational) AI replies, keyed by a hash of prompt+image+model. Written by the ask-claude Edge Function when called with routine: true.';
