# Age rating answers for 1.0.1 (draft)

Drafted 2026-11-11. App Store Connect > the app > **App Information** > Age Rating > Edit (for the 1.0.1 version). I read the current declaration through the API (read only) and compared it with what the app does. Not legal advice, and Apple's wording changes: **read each question on screen, and if it says something different from what I describe, answer the question as written.**

## What is wrong today

There are two records (one for the live 1.0, one for the 1.0.1 draft) and they disagree on one answer:

| Question | Live 1.0 | 1.0.1 draft | Should be |
|---|---|---|---|
| **Contests** | Frequent | Frequent or intense | **None** (or Infrequent, see below) |

Everything else matches in both records. The "17+ computed next to a 16+ override" I noted earlier came from the contests answer: a top-tier "contests" answer pushes the computed rating up. Fixing contests also removes that conflict.

## Answers

| Section | Question | Answer | Why |
|---|---|---|---|
| In-app controls | Parental controls | No | The app has none |
| In-app controls | Age assurance | No | The app does not verify age |
| Capabilities | Unrestricted web access | No | Only an embedded YouTube player and the user's own sign-in pages; no browser |
| Capabilities | **User-generated content** | **Yes** | Names, bios, trainer profiles, challenges, notes. Reporting and blocking exist |
| Capabilities | **Messaging and chat** | **Yes** | Trainer chat, check-in messages, friend cheers |
| Capabilities | Advertising | No | No ads, no ad SDK |
| Medical or wellness | **Health or wellness topics** | **Yes** | The whole app |
| Medical or wellness | Medical or treatment information | None | The app and the AI Coach say they are not medical advice |
| Sexuality or nudity | all sexual or nudity questions | None | |
| Violence | cartoon, realistic, prolonged graphic | None | |
| Mature themes | profanity or crude humour; horror or fear; alcohol, tobacco or drugs | None | Nutrition logging could mention alcohol as a food item; that is not a theme |
| Chance-based | **Contests** | **None** | Challenges are friendly fitness goals with no prizes, wagers or entry fees (no prize or stake wording found in the code) |
| Chance-based | Simulated gambling, real gambling, loot boxes | None / No | None exist |

## Contests: read the wording on screen

* If the question says **competitions with prizes or rewards**: answer **None**.
* If it says **any organised competition between users** (leaderboards, challenges): answer **Infrequent**, which is the honest lowest level for the Challenges feature.
* Do **not** keep "Frequent": nothing in the app is a frequent or intense contest, and it makes the computed rating wrong.

## The final rating

* Keep the **16+ override** you have now. It is higher than any computed rating from these answers, and it is a reasonable choice for an app with health data, open user content and chat between trainers and clients. An override can only raise a rating, not lower it.
* If Apple shows a computed rating higher than 16+ after you save, check that you did not answer a violence, mature or contests question above "None".
* Keep **User-generated content** and **Messaging and chat** ON. Turning them off would be inaccurate and could be rejected under Guideline 1.2.

## New questions

Apple has been adding age-rating questions (for example about AI chat features or social features). If you see one that is not in the table, answer it by the same rule: describe what the app actually does today. The AI Coach is a text chat with an AI model that is told not to give medical advice, and it asks the user's permission before sending any data.

## Not done

I did not change anything in App Store Connect. The API can set these values, but the answers are your declaration to Apple, so you confirm them.
