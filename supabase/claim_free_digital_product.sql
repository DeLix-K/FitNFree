-- Lets a signed-in player add a FREE guide to their library without going through Stripe (a Stripe checkout
-- cannot charge nothing). Run this in the Supabase SQL Editor before shipping the app update that uses it.
--
-- The price is checked HERE, in the database, against digital_products.price_cents. The app only decides what to show;
-- a paid guide can never be added by calling this function (it raises 'not_free'). Calling it twice changes nothing.
-- Safe to run more than once.

create or replace function public.claim_free_digital_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  if not exists (select 1 from public.digital_products where id = p_product_id and price_cents = 0) then
    raise exception 'not_free';
  end if;

  -- A leftover 'pending' row from an old checkout attempt becomes paid; an existing paid row is left alone.
  insert into public.digital_product_purchases (user_id, product_id, status)
  values (uid, p_product_id, 'paid')
  on conflict (user_id, product_id)
  do update set status = 'paid' where public.digital_product_purchases.status = 'pending';
end;
$$;

revoke all on function public.claim_free_digital_product(uuid) from public, anon;
grant execute on function public.claim_free_digital_product(uuid) to authenticated;
