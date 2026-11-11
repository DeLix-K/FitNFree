# Apple Watch screenshot plan for 1.0.1 (draft)

Drafted 2026-11-11. The 1.0.1 listing has iPhone and iPad screenshots only. A build that contains a watch app needs Apple Watch screenshots, in the App Store Connect version page, **Apple Watch** section.

## Hard blocker: the watch app has never run on a watch

Do not plan around screenshots until the watch app has opened on a real watch from TestFlight build 19 (see `watch.md`, "Before this ships"). If it does not install or work:
* **Fallback:** build 20 without the watch target, then no watch screenshots are needed. Also remove the watch bullet from What's New and the review notes.
* Do not fake or mock up screenshots. Apple requires screenshots of the real app.

## Sizes (verify on the live page before uploading)

Apple lets you upload **one** Apple Watch size, and the same set is used for every watch. As of Apple's current reference: **Ultra 3 is 422 x 514**, **Series 11 and 10 are 416 x 496**, Ultra and Ultra 2 are 410 x 502, and older watches are smaller (down to 312 x 390). Take the screenshots on **your own watch**, and upload whichever size matches it. They come out at exactly the right size by themselves, so there is no resizing.

Sources: [Apple, Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications), [aso.dev guide](https://aso.dev/app-store-connect/screenshots/). I could not open Apple's page directly, so treat the numbers as "check on the live page".

## Which screenshots (3 or 4; Apple allows 1 to 10)

| # | Screen | State to set up first | Why |
|---|---|---|---|
| 1 | **Main screen** with the flame streak, "x/y this week" and the seven day dots | Log workouts on the iPhone for 3 or 4 recent days so dots are filled. Open the iPhone app first so the numbers are fresh (no "Updated x ago" line) | It is the app's main screen and the hero image |
| 2 | **"Log today's workout?"** confirmation | Tap the log button on a day you have not logged | Shows the accidental-tap protection |
| 3 | **"Done today"** | After the iPhone confirms the log | Shows the loop is closed |
| 4 (optional) | **"Open FitNFree on your iPhone to see your streak"** | Skip it | Looks like an error, not a feature; do not use |

Keep to 1 to 3. Do not add text overlays, frames or device bezels, and do not show anything that is not in the app.

## How to capture on a real watch

1. On the iPhone: **Watch app > General > Enable Screenshots** (switch on).
2. On the watch, show the screen, then press the **side button and the Digital Crown together**. The picture lands in the **iPhone's Photos app**.
3. AirDrop or email them to your computer. Check the pixel size matches the table above.
4. Use the **same watch for all** screenshots. Make sure the screen is not dimmed (always-on dimming makes them dark), and use a normal, light-on-dark view.
5. Check each picture for personal details. The watch app shows only a streak and day dots, no names, so this should be clean.

## Upload (App Store Connect)

1. Open the 1.0.1 version page, scroll to **Apple Watch**, choose the screenshot size, drag the files in, and save.
2. If the page asks "Apple Watch Series x", pick the one matching the files. Do not mix sizes.
3. Tell me when they are in and I will read the screenshot sets back through the API to confirm the count and size.

## Related

Review notes should say the watch app needs a signed-in iPhone (`app-review-notes-1.0.1.md`). What's New mentions the watch app (`whats-new-1.0.1.md`).
