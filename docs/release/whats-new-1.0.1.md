# What's New text for 1.0.1

Drafted 2026-11-08 for App Store Connect > the 1.0.1 version > **What's New in This Version** (limit 4,000 characters; it is required for an update). British English, to match the listing's locale (`en-GB`). Every line below is a feature that exists in build 19; none is a promise.

## Paste this (full version)

```
New in FitNFree 1.0.1

TRACK YOUR PROGRESS
• Body log: record your weight, body fat and measurements, see trends on a chart, set a goal weight and choose your units. Progress photos stay on your phone and are never uploaded.
• Personal records: log a set that beats your best and you get a badge. See all your records in one list under Progress > Records.
• Export my data: download everything you have logged as a file (JSON or spreadsheet) from your Profile.

TRAIN SMARTER
• Interval Clock: Tabata, boxing rounds, HIIT, EMOM and your own custom intervals, with vibration and optional voice cues.
• Rest timer and workout reminders: an optional countdown after each set, and a reminder on the days you choose.
• Free guides: read the free guides in the Shop.

STAY ACCOUNTABLE
• Friends (optional): add friends, see when they train and hit milestones, and send a cheer. It is off until you turn it on, and you choose what is shared.
• Coaching check-ins: if your trainer gives you a code, send them a weekly check-in and read their feedback. You can stop sharing at any time.

ON YOUR HOME SCREEN AND WRIST
• Streak widget for your iPhone home screen (iOS 17 or later).
• Apple Watch app (watchOS 10 or later): see your streak and this week at a glance, and log today's workout.

PLUS
• Report tools for friends, clients and trainers, block for friends, and a round of security and stability updates.

Thanks for using FitNFree. Questions or ideas? Email teamlix6@gmail.com.
```

## Short version (if you want fewer words, about 600 characters)

```
New in 1.0.1: a Body log (weight, measurements, private progress photos), personal record badges and a Records list, an Interval Clock for Tabata, boxing, HIIT and EMOM, workout reminders and a rest timer, optional Friends with cheers, coaching check-ins with your trainer, free guides in the Shop, Export my data, a streak widget for your iPhone home screen (iOS 17+) and an Apple Watch app (watchOS 10+). Plus security and stability updates.
```

## Rules this text follows (so App Review does not flag it)

* Only features in build 19 (checked against `docs/release/new-features-1.0.1.md`, `watch.md`, `widget.md`). No "coming soon", no other platform names, no prices, no health or results claims.
* Free vs Premium is not stated, because nothing about the paywall changed in 1.0.1.
* The privacy line is true as built: progress photos never leave the phone; Friends and check-ins are opt-in.
* "Security and stability updates" is true: the Expo SDK 57 patch updates and security fixes are in this build.

## Before you paste (honest list)

1. **The Apple Watch line.** The watch app has never run on a watch. If it does not install or work on TestFlight, **delete the Apple Watch bullet** (and "and an Apple Watch app" in the short version), and also remove the watch from the review notes. Do not describe a feature that does not work.
2. **Friends and check-ins** need the SQL you ran, and two phones to test. If either misbehaves in TestFlight, delete that bullet.
3. **Free guides:** shows only if the Shop has free guides on the phone app (4 of the 11 are free today). True for now.
4. **The text goes in with the build you submit.** What's New can be edited any time before submitting, not after approval without a new version.
5. **Android:** Google Play has its own "What's new" (500 characters). The widget and the Apple Watch app are iPhone-only, so do not reuse this text there as it is.
