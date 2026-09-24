-- Seed content for the two library categories that had nothing in them:
-- Running and Wellness, each with a free starter guide and a Premium
-- programme. Run after content_library.sql. Safe to re-run: every insert is
-- guarded, so nothing is duplicated.
--
-- General wellness information only -- not medical advice. Each guide says so.

-- ── Running: free starter ────────────────────
insert into digital_products (title, description, price_cents, content_category, is_free)
select
  'Beginner''s Guide to Running: Your First 5K',
  'Never run before? An 8-week walk/run plan that builds you up to 5K without burning out.',
  0, 'running', true
where not exists (select 1 from digital_products where title = 'Beginner''s Guide to Running: Your First 5K');

insert into digital_product_content (product_id, body)
select id, $$BEGINNER'S GUIDE TO RUNNING: YOUR FIRST 5K

You don't need to be fast, fit or "a runner" to start. You need a plan that ramps up gently enough that your body adapts before it complains. This guide builds you from walking to running 5K (about 3 miles) in 8 weeks, three sessions a week.

BEFORE YOU START
- Shoes: any comfortable, supportive trainers you can move in. A running shop can fit you properly if you want to, but it's not required to begin.
- Clothes: something breathable. Skip cotton socks if you can; they cause blisters.
- Pace: you should be able to speak in short sentences while running. If you can't, slow down or walk. This "talk test" is the single most useful rule for beginners.
- Warm-up: 5 minutes of brisk walking, then leg swings and ankle circles.
- Cool-down: 5 minutes of easy walking, then a few gentle calf, quad and hamstring stretches.

THE 8-WEEK PLAN (3 sessions per week, with at least one rest day between)
Each session starts and ends with the warm-up and cool-down above.
- Week 1: Alternate 1 minute jogging, 2 minutes walking. Repeat 8 times.
- Week 2: Alternate 90 seconds jogging, 2 minutes walking. Repeat 7 times.
- Week 3: Alternate 3 minutes jogging, 90 seconds walking. Repeat 5 times.
- Week 4: Alternate 5 minutes jogging, 2 minutes walking. Repeat 3 times.
- Week 5: Jog 8 minutes, walk 2 minutes, jog 8 minutes, walk 2 minutes, jog 8 minutes.
- Week 6: Jog 10 minutes, walk 2 minutes, jog 10 minutes, walk 2 minutes, jog 6 minutes.
- Week 7: Jog 20 minutes non-stop, at an easy pace.
- Week 8: Jog 25 to 30 minutes non-stop. That is roughly 5K for most people.

If a week feels too hard, repeat it before moving on. There is no prize for finishing in exactly 8 weeks.

COMMON BEGINNER MISTAKES
- Starting too fast. Most beginners run their easy runs too quickly and end up exhausted or sore. Slow down.
- Skipping rest days. Adaptation happens while you recover, not while you run.
- Comparing yourself to others. Your only comparison is last week's you.
- Running through sharp or worsening pain. Muscle tiredness is normal. Sharp, localised or getting-worse pain is a signal to stop and rest.

FUELLING AND HYDRATION
You don't need special products for runs under an hour. Drink water through the day, and eat a small carbohydrate snack (a banana, toast) an hour before if you run on an empty stomach and feel weak.

STAYING MOTIVATED
- Pick fixed days and times, and treat them as appointments.
- Track each session in the app so you can see your streak build.
- Sign up for a local 5K for the end of week 8. A date on the calendar helps.

SAFETY
This guide is general fitness information, not medical advice. If you have a health condition, are pregnant, are returning from injury, or feel chest pain, dizziness or unusual breathlessness, speak to a doctor before you start or stop and seek medical help.$$
from digital_products where title = 'Beginner''s Guide to Running: Your First 5K'
and not exists (select 1 from digital_product_content where product_id = digital_products.id);

-- ── Running: Premium programme ───────────────
insert into digital_products (title, description, price_cents, content_category, is_free)
select
  '10-Week 10K Training Programme',
  'Already running 5K? A structured 10-week plan with easy runs, intervals and a long run to reach your first 10K.',
  0, 'running', false
where not exists (select 1 from digital_products where title = '10-Week 10K Training Programme');

insert into digital_product_content (product_id, body)
select id, $$10-WEEK 10K TRAINING PROGRAMME

This plan takes you from comfortably running 5K to running 10K (about 6.2 miles). You will run four days a week: two easy runs, one interval or tempo session, and one long run that grows a little every week.

WHO IT'S FOR
You can already run about 30 minutes without stopping. If you can't yet, start with the free Beginner's Guide to Running first.

THE FOUR SESSIONS
- Easy run: conversational pace. This should feel too easy. Most of your training belongs here.
- Intervals (weeks 1-5) / Tempo (weeks 6-9): intervals build speed in short hard bursts; tempo teaches you to hold a "comfortably hard" pace. Both are described below.
- Long run: the most important run of the week. Run slowly, and add distance gradually.
- Rest or cross-training: swimming, cycling, walking or strength work on non-running days keeps you strong without extra impact.

THE 10-WEEK SCHEDULE (long run distance / intervals or tempo)
- Week 1: Long 5K. Intervals: 5 x 1 minute hard, 90 seconds easy.
- Week 2: Long 6K. Intervals: 6 x 1 minute hard, 90 seconds easy.
- Week 3: Long 7K. Intervals: 5 x 2 minutes hard, 2 minutes easy.
- Week 4 (lighter week): Long 5K. Intervals: 4 x 2 minutes hard, 2 minutes easy.
- Week 5: Long 8K. Intervals: 6 x 2 minutes hard, 2 minutes easy.
- Week 6: Long 8K. Tempo: 15 minutes at a comfortably hard pace.
- Week 7: Long 9K. Tempo: 20 minutes.
- Week 8: Long 10K. Tempo: 20 minutes. Your first 10K, run slowly.
- Week 9 (taper): Long 6K. Tempo: 15 minutes.
- Week 10 (race week): Two easy 20-minute runs, then your 10K on race day.

HOW HARD IS "HARD"?
Use effort, not numbers. Easy: you can chat. Tempo: you can say a few words but not hold a conversation. Intervals: hard but controlled; you should be able to finish the last one with good form.

STRENGTH AND MOBILITY (twice a week, 20 minutes)
Squats, lunges, glute bridges, calf raises and planks. Stronger legs and hips are the best injury protection a runner has.

FUELLING
- Eat a carbohydrate-based meal two to three hours before long runs.
- For runs over 75 minutes, small carbohydrate snacks during the run can help. Your 10K long run will likely be under that, so water is usually enough.
- Eat protein and carbohydrates within a couple of hours after long runs to help recovery.

RACE DAY
Start slower than you think you should. Aim for an even pace, walk through aid stations if you need to, and enjoy it. Finishing well beats starting fast.

WHEN TO BACK OFF
Add distance no faster than the plan. If you feel run-down, are sleeping badly, or have pain that gets worse as you run, take an extra rest day or repeat a week.

SAFETY
General fitness information, not medical advice. Check with a doctor before starting if you have a health condition, or if you feel chest pain, dizziness or unusual breathlessness at any point.$$
from digital_products where title = '10-Week 10K Training Programme'
and not exists (select 1 from digital_product_content where product_id = digital_products.id);

-- ── Wellness: free starter ───────────────────
insert into digital_products (title, description, price_cents, content_category, is_free)
select
  'Sleep & Stress Reset: A Starter Guide',
  'Simple, science-backed habits for better sleep and calmer days. Five minutes to start, no equipment.',
  0, 'wellness', true
where not exists (select 1 from digital_products where title = 'Sleep & Stress Reset: A Starter Guide');

insert into digital_product_content (product_id, body)
select id, $$SLEEP & STRESS RESET: A STARTER GUIDE

Sleep and stress feed each other: stress makes it harder to sleep, and poor sleep makes everything feel more stressful. The good news is that small, consistent changes work on both.

PART 1: SLEEP BASICS
- Keep a regular schedule. Going to bed and waking up at similar times, even on weekends, is the strongest sleep habit there is.
- Get morning light. Ten minutes of daylight soon after waking helps set your body clock.
- Cut caffeine by early afternoon. It stays in your system for many hours.
- Make the bedroom cool, dark and quiet. A slightly cool room helps most people sleep better.
- Wind down for 30 to 60 minutes. Dim the lights, put screens away or use a night mode, and do something calm.
- If you can't sleep after about 20 minutes, get up, do something quiet in low light, and go back when sleepy. Lying awake teaches your brain that bed is for worrying.

PART 2: A 5-MINUTE STRESS RESET
Use this whenever you feel overwhelmed:
1. Sit or stand comfortably. Put one hand on your belly.
2. Breathe in through your nose for 4 seconds.
3. Breathe out slowly through your mouth for 6 seconds.
4. Repeat for 5 minutes. A longer out-breath than in-breath helps your body settle.
The Wellness tab in the app has guided breathwork and wind-down sounds if you'd like company.

PART 3: A SIMPLE EVENING ROUTINE (10 minutes)
- Write tomorrow's top three tasks on paper. Getting them out of your head helps you switch off.
- Two minutes of gentle stretching: neck, shoulders, hips.
- Five minutes of slow breathing as above.
- Lights out at your set time.

PART 4: TRACK IT
Log your sleep and mood in the app for two weeks. Patterns show up fast: which days you slept best, and what you did the day before.

WHEN TO GET HELP
Struggling with sleep or stress for weeks, feeling persistently low or anxious, or thinking about harming yourself: please speak to a doctor or a mental health professional. If you're in immediate danger, contact your local emergency number.

This guide is general wellness information and is not a substitute for medical or mental health care.$$
from digital_products where title = 'Sleep & Stress Reset: A Starter Guide'
and not exists (select 1 from digital_product_content where product_id = digital_products.id);

-- ── Wellness: Premium programme ──────────────
insert into digital_products (title, description, price_cents, content_category, is_free)
select
  '30-Day Recovery & Resilience Programme',
  'A daily 10-minute plan across four weeks: sleep, breathing, movement and mindset, built one habit at a time.',
  0, 'wellness', false
where not exists (select 1 from digital_products where title = '30-Day Recovery & Resilience Programme');

insert into digital_product_content (product_id, body)
select id, $$30-DAY RECOVERY & RESILIENCE PROGRAMME

Four weeks, one focus each week, about ten minutes a day. You add a new habit every week and keep the earlier ones, so by day 30 you have a routine that supports sleep, stress and energy.

HOW TO USE IT
Do the daily practice at the same time each day. If you miss a day, carry on the next day; don't start over. Log your mood and sleep in the app so you can see what changes.

WEEK 1: SLEEP FOUNDATIONS (Days 1-7)
Daily: fixed wake-up time, ten minutes of morning daylight, no caffeine after early afternoon.
Evening: a 30-minute wind-down with dim lights and no screens if you can manage it.
Goal: a regular sleep schedule. Notice how you feel by day 7.

WEEK 2: BREATH AND CALM (Days 8-14)
Keep week 1. Add: five minutes of slow breathing (in for 4, out for 6) once a day, plus a one-minute reset whenever you notice tension.
Goal: learn to lower stress on demand.

WEEK 3: GENTLE MOVEMENT (Days 15-21)
Keep weeks 1-2. Add: a ten-minute walk after your largest meal, and a five-minute mobility routine (cat-cow, hip circles, shoulder rolls, hamstring stretch) in the morning or evening.
Goal: movement as recovery, not punishment.

WEEK 4: MINDSET AND SUSTAINABILITY (Days 22-30)
Keep everything above. Add: each evening write down three things that went reasonably well, however small; and choose which habits you want to keep for the next 30 days.
Goal: make it sustainable. Aim to keep the two or three habits that helped most.

TROUBLESHOOTING
- Feeling more tired in week 1? Sleep changes can take a few days. Be patient and keep the schedule.
- Can't fit ten minutes? Do two minutes. Consistency beats duration.
- Slipping in week 3? Return to week 1 basics for a few days, then continue.

WEEKLY CHECK-IN QUESTIONS
How was my sleep this week (1 to 5)? How was my mood? Which habit made the biggest difference? Which is hardest to keep?

SAFETY
This programme is general wellness information and not medical or mental health advice. If you have persistent low mood, anxiety, sleep problems that continue, or any health concern, talk to a doctor or qualified professional. If you're in immediate danger, contact your local emergency number.$$
from digital_products where title = '30-Day Recovery & Resilience Programme'
and not exists (select 1 from digital_product_content where product_id = digital_products.id);
