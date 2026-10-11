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

-- Service-role only: no policies and no grants for anon/authenticated. The
-- ask-claude function reads and writes it with the service-role key. Letting
-- signed-in users insert would let any of them plant a reply under the hash
-- of someone else's prompt (the hash is computable from the public source)
-- and have it served to other users -- shared-cache poisoning.
revoke all on ai_response_cache from anon, authenticated;
drop policy if exists "Authenticated users can read the shared AI cache" on ai_response_cache;
drop policy if exists "Authenticated users can add to the shared AI cache" on ai_response_cache;

-- A rough way to see the cache earning its keep: compare this to
-- ai_history's row count for the same period.
comment on table ai_response_cache is
  'Shared cache of routine (non-conversational) AI replies, keyed by a hash of prompt+image+model. Written by the ask-claude Edge Function when called with routine: true.';
