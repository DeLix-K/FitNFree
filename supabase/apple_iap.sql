-- Apple In-App Purchase support for the Premium subscription, alongside the
-- existing Stripe path. Two independent webhooks (Stripe's and Apple's) can
-- each grant/revoke is_premium, so premium_source tracks which one currently
-- "owns" the entitlement -- a cancellation event from one provider must never
-- clobber an active subscription actually held through the other.
-- ─────────────────────────────────────────────

alter table profiles add column if not exists premium_source text
  check (premium_source in ('stripe', 'apple'));

alter table profiles add column if not exists apple_original_transaction_id text;

alter table profiles add column if not exists premium_expires_at timestamptz;

create unique index if not exists profiles_apple_original_transaction_id_idx
  on profiles (apple_original_transaction_id)
  where apple_original_transaction_id is not null;
