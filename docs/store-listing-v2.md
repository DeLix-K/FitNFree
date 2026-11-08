# FitNFree: store listing v2 (benefit-led)

Drafted 2026-11-08. Replaces the feature list in `store-listing.md` (that file keeps the privacy table and URLs).

**The promise:** *Know exactly what to do today, with a realistic plan built around your time and your equipment.*
Supporting points: stay consistent (streaks, targets, progress) and everything in one app (training, food,
recovery). The listing sells that outcome first and lists features second.

**Accuracy rules**
- Only features in the released version. Records list, Friends feed, check-in forms, interval clock, weight
  log and the other 1.0.1 features go in when 1.0.1 is live (add them under STAY CONSISTENT / TRAIN).
- No health claims or promised results (no "lose X kg", no "get fit in 30 days").
- No paid courses or trainer plans: on iPhone and Android those are web-only (Apple 3.1.1). Free guides can be
  mentioned once 1.0.1 (free guides in the Shop) is live.
- Free = 5 AI actions a day. Never imply unlimited AI is free.

Character counts were checked with a script; re-check against the console limit before pasting.

## iOS subtitle (30 max)
```
Know exactly what to do today
```
(29)

## iOS promotional text (170 max; can be changed any time without a new review)
```
Not sure what to do at the gym? Ask the AI Coach for a workout that fits your time and your kit, adjust it on tired days, and keep your streak going.
```
(149)

## Android short description (80 max)
```
Know exactly what to do today: AI workouts built around your time and your kit.
```
(79)

## iOS keywords (100 max, comma-separated, no spaces needed)
```
workout planner,gym plan,ai coach,beginner,home workout,routine,streak,fitness,exercise,meal tracker
```
(100)

## Full description (both stores, 4000 max)
```
Walk into the gym with no plan? Only got 20 minutes and a pair of dumbbells? FitNFree tells you exactly what to do today, with a workout built around your time, your equipment and how you feel.

KNOW WHAT TO DO TODAY
• Ask the AI Coach to build you a workout, or tap a quick question like "Build me a workout" or "Adjust my plan"
• Tired, sore or short on time? Recalibrate Session adjusts today's workout to how you actually feel
• A daily briefing that reads your real activity, sleep and streak, and suggests a plan for today
• Pick a coach style: Encouraging, Strict or Data-Focused. Talk to it by voice if you like

BUILT AROUND YOUR KIT
• Point your camera at your gym equipment and get a workout built around it
• Filter exercises by muscle on a body map, by place (home, gym, outdoors) and by equipment
• Photo form check: get feedback on your technique mid-rep
• Home, gym and outdoor plans, plus outdoor activity tracking

STAY CONSISTENT
• Real streaks with streak freezes, so one missed day doesn't wipe your progress
• Weekly targets you set yourself, milestone badges, challenges and leaderboards
• Post-workout insights based on what you actually logged, never invented claims

EVERYTHING IN ONE APP
• Food logging in seconds: snap a meal, scan a barcode, say it out loud or search real nutrition data
• Daily calorie and protein targets from your own stats
• Sleep and recovery: sleep log, readiness score, breathwork and wind-down sounds
• Habits and mood check-ins, with a free stress-reset tool that's never behind a paywall

FREE TO START
FitNFree is free with 5 AI actions a day. Premium unlocks unlimited AI coaching, deeper insights and extra streak protection.

FitNFree's AI Coach is not a doctor, therapist or licensed trainer. It's a supportive tool, not a substitute for professional medical, mental health or fitness advice. If you have an injury or a health condition, check with a professional before starting a new routine.
```

## Screenshots
Made by `scripts/store/make_store_screenshots.py` from real screens in `assets/store/source-screens/`, with the
headlines in `scripts/store/benefit-screens.json`. Output: `assets/store/benefit/<size>/`.

| # | Screen | Headline |
|---|---|---|
| # | Screen | Headline | Captured? |
|---|---|---|---|
| 1 | `coach-workout` | Know exactly what to do **today** | Yes (web, 432x768) |
| 2 | `equipment-scan` | Built around the kit **you have** | No: needs a phone camera |
| 3 | `recalibrate-form` | Your time. Your kit. **Your plan.** | Yes (web, 432x768) |
| 4 | `exercises` | Home, gym or **outdoors** | Yes (web, 432x768) |
| 5 | `recalibrate` | Tired or short on time? **Adjust it** | Yes (web, 432x768) |
| 6 | `form-check` | Check your **form** | No: needs a phone camera |
| 7 | `streaks` | Stay **consistent** | No: needs weeks of real history |
| 8 | `nutrition` | Food logged in **seconds** | Empty-account version (1080x1920) |

Google Play takes up to 8 phone screenshots, the App Store up to 10. The first two matter most: most people
only see those.

**Before uploading:** the web captures are 432x768, so they look soft at store size. The Coach chats behind
1, 3 and 5 are saved in the "Fitness Fan" account (2026-11-08): open them on a phone, screenshot them, save
them over the files in `assets/store/source-screens/` with the same names, and rerun the script.

**Where they go**
- **Google Play:** screenshots, short and full description can be updated any time (Play Console > Grow >
  Store presence > Main store listing). Google reviews the change, usually within a day or two.
- **App Store:** the promotional text can change any time. Screenshots, subtitle, keywords and description only
  change with a new version, so they go in with the 1.0.1 submission.
- **iPad:** capture real iPad-size screens (2064x2752) instead of a phone frame on an iPad canvas.
