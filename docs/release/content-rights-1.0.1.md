# Content Rights answer for 1.0.1 (draft)

App Store Connect > App Information > **Content Rights**. Today it says the app "does not contain, show, or access third-party content". That is not accurate, so it must change before submitting.

## Step 1: the question you can answer today

**"Does your app contain, show, or access third-party content?" Answer: Yes.**

## Step 2: the follow-up (only you can answer it)

**"Do you have all the necessary rights to use that content?"** Tick Yes only when every row below is true. Apple can ask for proof at any time.

| Source | Where it appears | Licence (to my knowledge, verify) | Can you tick it today? |
|---|---|---|---|
| **ExerciseDB** exercise animations (102 GIFs from `static.exercisedb.dev`) | Exercise detail screens | **No licence found.** Its public repository states none for the media, says the free endpoints are "for exploration only", and its website had an expired certificate | **No.** See options below |
| **YouTube** videos (official embedded player) | Guides and exercise videos | YouTube's own embed terms. Fine only if the videos allow embedding and you are not hiding the player or adding ads | Probably yes. Check each video's owner allows embedding |
| **Open Food Facts** (barcode lookups) | Food scanner | Open Database Licence; product images are CC BY-SA. **Attribution is required** | Only if the app or the support page credits Open Food Facts. Today I did not find a credit in the app |
| **USDA FoodData Central** (food search) | Meal logging | US government data, public domain (CC0) | Yes. A credit is polite, not required |
| Oura data | Only the user's own data, from their own account | The user's own data | Yes |

## Options for ExerciseDB (pick one before submitting)

1. **Get written permission or a paid plan** from ExerciseDB for commercial use. Keep the email or invoice. Then you can tick Yes.
2. **Host your own demonstrations** (your own photos or videos). Safest long term.
3. **Remove the GIFs for 1.0.1.** The app falls back to text instructions. Then ExerciseDB drops out of the table, and you can tick Yes for what remains.

## Wording to add if Open Food Facts stays

A line on the About or support screen, for example: "Food data from Open Food Facts (openfoodfacts.org), available under the Open Database Licence." Needs a small code change or a line on the support page.

## What I did not do

I did not change Content Rights in App Store Connect. The API does not expose a safe way to set it, and the rights answer is yours to give.
