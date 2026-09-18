-- Google Play Billing support for the Premium subscription, alongside the
-- existing Stripe (web) and Apple (iOS) paths. See apple_iap.sql for why
-- premium_source exists: each provider's webhook may only revoke premium
-- it granted itself.
-- ─────────────────────────────────────────────

alter table profiles add column if not exists google_purchase_token text;

create unique index if not exists profiles_google_purchase_token_idx
  on profiles (google_purchase_token)
  where google_purchase_token is not null;

alter table profiles drop constraint if exists profiles_premium_source_check;
alter table profiles add constraint profiles_premium_source_check
  check (premium_source in ('stripe', 'apple', 'google'));
