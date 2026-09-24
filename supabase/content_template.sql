-- Template for adding library content on a schedule. Copy this file, fill it
-- in, and run it in the Supabase SQL Editor. Nothing here runs by itself.
--
-- HOW RELEASES WORK
-- Each item has a published_at time. Until that time it is invisible in the app
-- (everyone but the admin); at that time it appears, with a "New" badge for two
-- weeks. So you can write a month of content in one sitting and stagger the
-- dates: one item per week, or one per month, whatever suits you.
--
-- FREE OR PREMIUM
-- is_free = true   -> visible and readable to every signed-in user (use for
--                     beginner / starter material that draws people in).
-- is_free = false  -> readable only with an active Premium subscription.
--
-- CATEGORIES (content_category): fitness | weight_management | nutrition |
--                                wellness | running
--
-- Keep the wording honest: general information, not medical advice.

-- ─────────────────────────────────────────────
-- A. A guide (single page of content)
-- ─────────────────────────────────────────────
insert into digital_products (title, description, content_category, is_free, published_at)
select
  'TITLE HERE',
  'One-sentence description shown on the card.',
  'fitness',                          -- category
  false,                              -- true = free starter
  '2026-10-07 09:00:00+00'            -- go-live time (use now() for immediately)
where not exists (select 1 from digital_products where title = 'TITLE HERE');

insert into digital_product_content (product_id, body)
select id, $$THE FULL GUIDE TEXT GOES HERE.

Use plain paragraphs and short headings in capitals. Include a short SAFETY
note at the end.$$
from digital_products where title = 'TITLE HERE'
and not exists (select 1 from digital_product_content where product_id = digital_products.id);

-- ─────────────────────────────────────────────
-- B. A course (several lessons with progress and a completion certificate)
-- ─────────────────────────────────────────────
-- Fixed ids keep re-runs safe. Generate your own with: select gen_random_uuid();
insert into courses (id, title, description, content_category, is_free, published_at)
values (
  '33333333-3333-4333-8333-333333333301',
  'COURSE TITLE',
  'What the course covers, in a sentence or two.',
  'running',
  false,
  '2026-10-14 09:00:00+00'
)
on conflict (id) do update set
  title = excluded.title, description = excluded.description,
  content_category = excluded.content_category, is_free = excluded.is_free,
  published_at = excluded.published_at;

insert into course_lessons (id, course_id, title, content, order_index)
values
  ('33333333-3333-4333-8333-333333333311', '33333333-3333-4333-8333-333333333301',
   'Lesson 1 title', 'Lesson 1 text.', 1),
  ('33333333-3333-4333-8333-333333333312', '33333333-3333-4333-8333-333333333301',
   'Lesson 2 title', 'Lesson 2 text.', 2)
on conflict (id) do update set
  title = excluded.title, content = excluded.content, order_index = excluded.order_index;

-- ─────────────────────────────────────────────
-- C. Changing things later
-- ─────────────────────────────────────────────
-- Reschedule:        update digital_products set published_at = '2026-11-01 09:00+00' where title = 'TITLE HERE';
-- Make it free:      update digital_products set is_free = true where title = 'TITLE HERE';
-- Pull it back:      update digital_products set published_at = '2999-01-01' where title = 'TITLE HERE';
-- See what's queued: select title, content_category, is_free, published_at
--                      from digital_products where published_at > now() order by published_at;
