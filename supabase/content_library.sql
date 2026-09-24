-- Content library: courses and guides sorted into five categories, with free
-- starters, Premium-gated everything else, and scheduled releases.
--
--   * Categories: fitness, weight_management, nutrition, wellness, running.
--   * Access: an item is either free (is_free) or unlocked by an active
--     Premium subscription (profiles.is_premium -- the same flag the AI gate
--     uses). Anyone who already bought an item before this change keeps
--     access through the old enrollment/purchase policies, which stay.
--   * Releases: published_at hides an item until that time, so a batch can be
--     loaded ahead and go live weekly or monthly on its own.
--
-- Backwards compatible on purpose: builds already out in the stores and the
-- live web app keep working. Only new columns are added -- the legacy
-- digital_products.category column and price_cents are left untouched.
-- Run this in the Supabase SQL Editor.

-- ─────────────────────────────────────────────
-- Helpers. Security definer so RLS policies on content tables can look at the
-- caller's own profile row without exposing the profiles table.
-- ─────────────────────────────────────────────
create or replace function is_premium_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_premium from profiles where id = auth.uid()), false);
$$;

create or replace function is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

revoke all on function is_premium_user() from public;
revoke all on function is_admin_user() from public;
grant execute on function is_premium_user() to anon, authenticated;
grant execute on function is_admin_user() to anon, authenticated;

-- ─────────────────────────────────────────────
-- Columns
-- ─────────────────────────────────────────────
alter table courses add column if not exists content_category text not null default 'fitness';
alter table courses add column if not exists is_free boolean not null default false;
alter table courses add column if not exists published_at timestamptz not null default now();

alter table digital_products add column if not exists content_category text not null default 'fitness';
alter table digital_products add column if not exists is_free boolean not null default false;
alter table digital_products add column if not exists published_at timestamptz not null default now();

-- New content is included in Premium rather than sold per item.
alter table courses alter column price_cents set default 0;
alter table digital_products alter column price_cents set default 0;

alter table courses drop constraint if exists courses_content_category_check;
alter table courses add constraint courses_content_category_check
  check (content_category in ('fitness', 'weight_management', 'nutrition', 'wellness', 'running'));

alter table digital_products drop constraint if exists digital_products_content_category_check;
alter table digital_products add constraint digital_products_content_category_check
  check (content_category in ('fitness', 'weight_management', 'nutrition', 'wellness', 'running'));

-- ─────────────────────────────────────────────
-- Backfill existing content. Starter guides are free; programmes, plans and
-- courses are Premium. Adjust a row later with a plain UPDATE if you disagree.
-- ─────────────────────────────────────────────
update courses set content_category = 'fitness'   where title = '14-Day Full-Body Transformation & Toning';
update courses set content_category = 'nutrition' where title = 'Macronutrient Mastery & Meal Prep Protocols';

update digital_products set content_category = 'fitness',           is_free = true  where title = 'Full-Body Home Workout Guide';
update digital_products set content_category = 'fitness',           is_free = true  where title = 'Gym Beginner''s Starter Guide';
update digital_products set content_category = 'nutrition',         is_free = true  where title = 'Macro Counting Made Simple';
update digital_products set content_category = 'weight_management', is_free = true  where title = 'Sustainable Weight Loss Guide';
update digital_products set content_category = 'fitness',           is_free = false where title = '8-Week Progressive Overload Programme';
update digital_products set content_category = 'weight_management', is_free = false where title = '12-Week Body Recomposition Plan';
update digital_products set content_category = 'weight_management', is_free = false where title = '4-Week Fat Loss Meal Plan';

-- ─────────────────────────────────────────────
-- Catalog visibility: only released items, except to the admin.
-- ─────────────────────────────────────────────
drop policy if exists "Courses are readable by anyone" on courses;
drop policy if exists "Released courses are readable" on courses;
create policy "Released courses are readable"
  on courses for select
  using (published_at <= now() or is_admin_user());

drop policy if exists "Digital products are readable by anyone" on digital_products;
drop policy if exists "Released digital products are readable" on digital_products;
create policy "Released digital products are readable"
  on digital_products for select
  using (published_at <= now() or is_admin_user());

-- Syllabus preview: titles only, and only for released courses.
create or replace view course_lesson_previews
with (security_invoker = false) as
select l.id, l.course_id, l.title, l.order_index
from course_lessons l
join courses c on c.id = l.course_id
where c.published_at <= now();

-- ─────────────────────────────────────────────
-- Content access: free items for everyone signed in, the rest for Premium.
-- These sit alongside the existing enrollment/purchase policies (policies
-- are OR'd), so earlier buyers keep their content.
-- ─────────────────────────────────────────────
drop policy if exists "Library members can read lesson content" on course_lessons;
create policy "Library members can read lesson content"
  on course_lessons for select
  using (
    exists (
      select 1 from courses c
      where c.id = course_lessons.course_id
        and c.published_at <= now()
        and (c.is_free or is_premium_user())
    )
  );

drop policy if exists "Library members can read guide content" on digital_product_content;
create policy "Library members can read guide content"
  on digital_product_content for select
  using (
    exists (
      select 1 from digital_products p
      where p.id = digital_product_content.product_id
        and p.published_at <= now()
        and (p.is_free or is_premium_user())
    )
  );

-- ─────────────────────────────────────────────
-- Admin policies: use the helper, not a direct look at profiles.
-- Postgres ORs a table's policies together and may evaluate them in any
-- order (in practice alphabetically by name). The old admin policies read the
-- profiles table directly, and anon has no access to it, so a signed-out read
-- of the catalog failed with "permission denied for table profiles" whenever
-- that policy happened to run first. is_admin_user() is security definer, so
-- it works for every role.
-- ─────────────────────────────────────────────
drop policy if exists "Only the admin can manage courses" on courses;
create policy "Only the admin can manage courses"
  on courses for all
  using (is_admin_user())
  with check (is_admin_user());

drop policy if exists "Only the admin can manage digital products" on digital_products;
create policy "Only the admin can manage digital products"
  on digital_products for all
  using (is_admin_user())
  with check (is_admin_user());

drop policy if exists "Only the admin can manage course lessons" on course_lessons;
create policy "Only the admin can manage course lessons"
  on course_lessons for all
  using (is_admin_user())
  with check (is_admin_user());

drop policy if exists "Only the admin can manage digital product content" on digital_product_content;
create policy "Only the admin can manage digital product content"
  on digital_product_content for all
  using (is_admin_user())
  with check (is_admin_user());
