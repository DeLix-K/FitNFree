-- Security hardening, second half. DO NOT RUN until an app build that
-- includes this branch's lib/trainers.ts + lib/trainerDashboard.ts changes
-- (explicit public column list; owner profile via my_trainer_profile()) has
-- been released and old builds are no longer in use -- the already-shipped
-- 1.0.0 selects every column of trainer_profiles, and would get a
-- "permission denied" error on the Trainers tab if this ran first.
-- Requires security_hardening_2.sql (creates my_trainer_profile()).
--
-- Why: trainer_profiles was readable by the public (including logged-out
-- visitors) in full, which exposed each trainer's Stripe Connect account id
-- and their default video-call link (a private meeting room anyone could
-- join) to anyone with the app's public API key.

revoke select on trainer_profiles from anon, authenticated;

grant select (
  id, user_id, display_name, bio, specialty, price_cents, payouts_enabled,
  listed_for_chat, intro_video_url, training_format, location_text,
  coaching_style, created_at
) on trainer_profiles to anon, authenticated;
