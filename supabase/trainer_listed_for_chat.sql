-- Lets the admin list a vetted trainer in the Trainers tab for messaging
-- before Stripe payouts are verified (App Review needs a reachable trainer
-- chat to see Report/Block). Listing alone never enables purchases: every
-- checkout function still requires payouts_enabled + stripe_account_id, and
-- the buy buttons are hidden while payouts_enabled is false.
--
-- Not client-writable: trainer_profiles writes are admin-only under RLS
-- (see security_hardening.sql), and trainer-signup inserts through the
-- service role without setting this column, so it defaults to false.

alter table trainer_profiles add column if not exists listed_for_chat boolean not null default false;
