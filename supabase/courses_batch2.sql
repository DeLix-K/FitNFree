-- Adds two more courses to the catalog (was just "4-Week Strength Foundations").
-- Same admin-authored, one-time-purchase, paywalled-lesson model as courses.sql --
-- no schema changes, just content. Run this in the Supabase SQL Editor after
-- courses.sql has already been applied.
--
-- Picked from the 6-course list as the two safely writable by an AI author:
-- general HIIT/bodyweight training and general nutrition education carry no
-- medical-advice risk. Post-injury mobility and postpartum core/pelvic-floor
-- rehab were deliberately left out of this batch -- that's the kind of
-- content that should come from a licensed PT/pelvic-floor specialist, not
-- be generated wholesale here.

-- ─────────────────────────────────────────────
-- Course 1: 14-Day Full-Body Transformation & Toning
-- ─────────────────────────────────────────────
insert into courses (id, title, description, price_cents)
values (
  '11111111-1111-4111-8111-111111111101',
  '14-Day Full-Body Transformation & Toning',
  'A no-equipment, 14-day HIIT and bodyweight program built for visible results fast. Daily structure, beginner-friendly, nothing but floor space required.',
  2499
)
on conflict (id) do update set title = excluded.title, description = excluded.description, price_cents = excluded.price_cents;

insert into course_lessons (id, course_id, title, content, order_index)
values
(
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111101',
  'Welcome & How This Program Works',
  'This is a 14-day, no-equipment program split into two phases: Week 1 builds your foundation, Week 2 raises the intensity. Each "day" in this course is a single 20-30 minute session -- do them on 5-6 days each week and take the rest as recovery, in whatever order fits your schedule. There is no requirement to do all 14 sessions on 14 consecutive calendar days; consistency across two weeks matters more than a perfect streak.

Every session in this course is built from four movement patterns: a squat variation, a push variation, a hip-hinge/posterior-chain variation, and a core/anti-rotation move, plus a short cardio burst to raise heart rate. That repetition is deliberate -- you get measurably better at each movement week over week, which is where the "toning" actually comes from (technique and time-under-tension, not any specific exercise being magic).

Log every session you complete in this course as a workout in your FitNFree history, and let your Streaks tab track the consistency -- that visible chain of completed days is the single best predictor of whether you finish a 14-day program versus abandoning it in week one.

A standard note before you start: if you have any existing injury, are pregnant, or have a condition that affects exercise safely, check with a doctor before starting. Stop any movement that causes sharp or radiating pain -- general muscle fatigue and a bit of next-day soreness are normal, joint pain is not.',
  0
),
(
  '11111111-1111-4111-8111-111111111112',
  '11111111-1111-4111-8111-111111111101',
  'Week 1: Foundations (Days 1-7)',
  'Week 1''s goal is technique, not intensity. Every circuit below is 3 rounds, 40 seconds of work per move, 20 seconds of rest, resting 90 seconds between rounds.

Days 1, 3, 5 -- Full-Body Circuit A:
1. Bodyweight squat (sit back into your heels, chest up)
2. Incline or knee push-up (hands on a couch/counter if a full push-up isn''t there yet -- this is not a downgrade, it''s the correct regression)
3. Glute bridge (squeeze at the top for a full second each rep)
4. Dead bug (opposite arm/leg extend, keep your lower back flat on the floor)
5. High knees (cardio burst)

Days 2, 4, 6 -- Full-Body Circuit B:
1. Reverse lunge, alternating legs
2. Plank shoulder taps
3. Standing hip hinge with a light backpack or water jugs if you have them, bodyweight if not
4. Bird dog (slow and controlled beats fast and sloppy every time)
5. Mountain climbers (cardio burst)

Day 7 -- Active recovery: a 20-30 minute walk, plus 5 minutes of gentle stretching for hips, hamstrings, and shoulders. No circuit today -- recovery is part of the program, not a day off from it.

By day 7, most people notice the first circuit that felt genuinely hard on Day 1 now feels manageable. That''s the adaptation working. Week 2 is where you push it.',
  1
),
(
  '11111111-1111-4111-8111-111111111113',
  '11111111-1111-4111-8111-111111111101',
  'Week 2: Intensity & Toning (Days 8-14)',
  'Same movement patterns as Week 1, same 3-round structure -- but the work-to-rest ratio flips to build real conditioning: 40 seconds work, 15 seconds rest, 60 seconds between rounds. If that''s too aggressive on any given day, it is completely fine to stay on Week 1''s timing for another week -- progressing the intensity of a program should never come at the cost of good form.

Days 8, 10, 12 -- Full-Body Circuit A (intensified):
1. Jump squat (or bodyweight squat with a 2-second pause at the bottom if jumping isn''t right for your knees)
2. Push-up (try the next progression up from Week 1 -- e.g. knee push-up to full push-up)
3. Single-leg glute bridge, alternating
4. Dead bug with a slow 3-count on each rep
5. Burpees, no push-up (cardio burst)

Days 9, 11, 13 -- Full-Body Circuit B (intensified):
1. Jump lunge, alternating (or a faster-tempo reverse lunge if jumping lunges aren''t appropriate for you)
2. Plank shoulder taps with a hip dip added
3. Single-leg hip hinge (holds onto something for balance if needed)
4. Bird dog with a 2-second hold at full extension
5. Fast feet / mountain climbers (cardio burst)

Day 14 -- Your final session: repeat Circuit A one more time, then compare how it felt to Day 1. That comparison is the actual "transformation" this course is selling -- the same movements, meaningfully easier, because your body adapted. Toning is technique plus repetition, not a secret exercise nobody told you about.',
  2
),
(
  '11111111-1111-4111-8111-111111111114',
  '11111111-1111-4111-8111-111111111101',
  'Form Cues, Recovery & What''s Next',
  'Quick form fixes for the four patterns this whole program is built on:

Squat: weight in your heels and midfoot, not your toes. Knees track over (not past) your toes. If your heels lift off the ground, you probably need to sit back further or widen your stance slightly.

Push-up: hands roughly under your shoulders, not flared out wide. Keep a straight line from head to heels -- no sagging hips, no piked-up butt. If that line breaks before you hit good depth, you''re not ready for that push-up variation yet, and dropping to an incline push-up is the right call, not a failure.

Hip hinge: this is a hip movement, not a squat or a back-rounding bend. Push your hips back like you''re closing a car door with them, keep a flat back, and feel it in your hamstrings and glutes, not your lower back.

Plank / anti-rotation core: brace like someone''s about to poke your stomach. Ribs pulled down toward your hips, not flared up -- that''s what keeps your lower back safe under load.

Recovery matters as much as the workouts: aim for 7+ hours of sleep, drink water throughout the day (not just during sessions), and eat enough protein to actually repair the muscle you just trained -- this program builds the habit, our Macronutrient Mastery course covers the "how much" in detail if you want to go deeper on nutrition.

Where to go from here: if 14 days felt manageable and you want to build real strength (not just conditioning), the 4-Week Strength Foundations course is the natural next step -- it slows the tempo down and adds progressive overload with the same no-excuses bodyweight-first philosophy.',
  3
)
on conflict (id) do update set title = excluded.title, content = excluded.content, order_index = excluded.order_index;

-- ─────────────────────────────────────────────
-- Course 2: Macronutrient Mastery & Meal Prep Protocols
-- ─────────────────────────────────────────────
insert into courses (id, title, description, price_cents)
values (
  '22222222-2222-4222-8222-222222222201',
  'Macronutrient Mastery & Meal Prep Protocols',
  'Stop guessing at nutrition. Learn to calculate your real calorie and macro targets, build balanced plates without a food scale in your head, and set up a meal-prep system you can actually sustain.',
  3499
)
on conflict (id) do update set title = excluded.title, description = excluded.description, price_cents = excluded.price_cents;

insert into course_lessons (id, course_id, title, content, order_index)
values
(
  '22222222-2222-4222-8222-222222222211',
  '22222222-2222-4222-8222-222222222201',
  'Understanding Your Numbers: TDEE, Macros & Why They Matter',
  'TDEE (Total Daily Energy Expenditure) is the number of calories your body burns in a day, including everything -- your resting metabolism, digestion, daily movement, and exercise. It is the single most useful number in nutrition because every other decision (losing fat, building muscle, or maintaining) is just a percentage adjustment off of it: eat below TDEE to lose weight, at TDEE to maintain, above TDEE to gain.

A quick estimate: take your bodyweight in pounds and multiply by 14-16 if you''re mostly sedentary, 16-18 if you''re moderately active, or 18-20+ if you''re very active or in heavy training. That gives you a rough maintenance calorie number -- not exact, but a real starting point you can adjust from based on what actually happens to your weight over 2-3 weeks of eating at that level.

Macros (protein, carbohydrate, and fat) are what those calories are made of, and they matter beyond the raw number. Protein is the one most people under-eat and the one that matters most for keeping muscle while losing fat -- aim for roughly 0.7-1g per pound of bodyweight per day as a starting target. Fat needs a floor too (don''t go below about 0.3g per pound) because it''s essential for hormone production. Whatever calories are left after protein and fat go to carbohydrates, which fuel your training and daily energy.

You do not need to hit these numbers exactly every single day. The goal of this lesson is a real, personalized target to aim at -- not a perfect score to chase. Use FitNFree''s Nutrition tab to log a few normal days and see how close your current eating already is to these numbers before changing anything.',
  0
),
(
  '22222222-2222-4222-8222-222222222212',
  '22222222-2222-4222-8222-222222222201',
  'Building Balanced Plates: Protein, Carbs & Fat in Practice',
  'Numbers on paper are useless if you can''t translate them onto an actual plate. Here''s a practical method that doesn''t require weighing every ingredient forever:

The hand-portion method: a palm-sized portion of protein (chicken, fish, tofu, eggs, lean beef) roughly covers 20-30g of protein. A cupped-hand portion of carbs (rice, potatoes, oats, fruit) is a reasonable single serving. A thumb-sized portion of fats (oils, nut butter, cheese, avocado) covers a meaningful chunk of your fat target. A fist-sized portion of vegetables per meal handles fiber and micronutrients that macro-counting alone ignores.

For a 3-meals-a-day structure, that''s roughly: protein + carb + fat + vegetables at each meal, sized to your hand. It won''t be perfectly precise, but it gets most people within a reasonable range of their targets without a food scale sitting on the counter for the rest of their life.

Protein sources worth building meals around: chicken breast/thigh, 90/10 ground beef, eggs and egg whites, Greek yogurt, cottage cheese, tofu/tempeh, fish, and protein powder as a supplement when whole food isn''t practical (not a replacement for it).

A common mistake: treating "healthy" and "on-target" as the same thing. A large portion of olive oil and avocado is healthy and can still blow a calorie target for the day. Whole, minimally processed food should be the default, but portion size is still what determines whether you hit your number -- quality and quantity are two different questions.',
  1
),
(
  '22222222-2222-4222-8222-222222222213',
  '22222222-2222-4222-8222-222222222201',
  'The Meal Prep System: Shop Once, Eat All Week',
  'Meal prep fails for most people not because the cooking is hard, but because the system around it is missing. Here''s a repeatable weekly structure:

Step 1 -- Plan before you shop: pick 2-3 protein sources, 2-3 carb sources, and 2-3 vegetables for the week. Variety across the week (not within every single meal) keeps it from getting boring without turning grocery shopping into a research project every Sunday.

Step 2 -- One shopping trip, one prep session: buy everything at once, then batch-cook in a single 60-90 minute block. Roast a tray of vegetables and a tray of protein at the same oven temperature simultaneously. Cook a big pot of rice or a batch of potatoes. This is where the actual time savings comes from -- not from any individual recipe being fast, but from not repeating the "what do I make" decision seven times a week.

Step 3 -- Portion immediately after cooking, not right before eating: split everything into containers by portion size (using the hand-portion method from the last lesson) while it''s still on the counter. A future-you who is tired and hungry on a Wednesday night will not make good portioning decisions -- past-you on Sunday has to do it instead.

Step 4 -- Build in one "flex" meal or day: a system with zero flexibility breaks the first time life doesn''t cooperate. Planning for one meal a week that''s just "eat whatever, log it, move on" keeps the whole system sustainable instead of something you white-knuckle for two weeks and then abandon.

Storage basics: most cooked proteins and grains keep 3-4 days refrigerated, longer frozen. Keep sauces and dressings separate until you eat, since they''re what make reheated prepped food actually taste good instead of like a chore.',
  2
),
(
  '22222222-2222-4222-8222-222222222214',
  '22222222-2222-4222-8222-222222222201',
  'Troubleshooting: Plateaus, Eating Out & Staying Consistent',
  'Weight plateaus are normal, not a sign your plan is broken. Bodyweight fluctuates day to day from water, sodium, and hormones -- judge progress by a weekly average over 3-4 weeks, not any single day. If the average genuinely hasn''t moved in 2-3 weeks and your goal is fat loss, that''s usually the point to adjust calories down modestly (around 10%) rather than making a drastic cut.

Eating out doesn''t have to derail the plan. A few practical moves: look at the menu ahead of time when you can, prioritize a protein source you can identify, ask for sauces/dressings on the side (this is usually where the biggest hidden calories are, not the protein or vegetables), and don''t try to "save up" by starving yourself beforehand -- that just leads to overeating once you''re there. One meal is a rounding error across a week; the pattern over weeks is what actually matters.

The habit that makes or breaks all of this: consistency beats precision. Hitting your targets approximately right, five or six days a week, for months, will outperform a "perfect" plan you can only sustain for two weeks. If a rule in your nutrition plan is something you can''t imagine still doing in six months, it''s the wrong rule for you specifically, even if it''s correct in theory.

Use FitNFree''s Nutrition tab daily, not as a strict judge, but as a mirror -- logging consistently is what lets you actually see the patterns (a week that''s heavier on takeout, a week that hit targets easily) instead of relying on memory, which is where most people''s sense of their own eating quietly drifts from reality.',
  3
)
on conflict (id) do update set title = excluded.title, content = excluded.content, order_index = excluded.order_index;
