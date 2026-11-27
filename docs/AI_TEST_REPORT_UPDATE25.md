# AI Test Report — UPDATE 25: BizKhata AI Assistant improvement (Android mirror)

Date: 2026-11-27. Owner order (2026-11-27 ~18:59 IST): improve the AI
Assistant — the Voice Assistant does not speak Hindi/Hinglish properly,
and the Chat Assistant must understand what he says better. Follow-up
(19:01 IST): "Phone Ki Awaz Mat Do Proper Ai Ki Voice Chahiye Muje" —
NO phone/device voice; a proper AI voice.

This report covers the ANDROID mirror of the UPDATE 25 website fix.
The website worker's choices were not yet landed when this mirror was
built, so the caps below follow the UPDATE 25 diagnosis
(`UPDATE25-DIAGNOSIS.md`) recommendations exactly; if the website
worker picked different values, the discrepancy must be reconciled
before the owner tests.

## 0. Honest limits (read first)

- **The Android code has NEVER been compiled on this VM (no JDK).**
  No Kotlin test was run on a JVM here. The Kotlin suite
  (`Update25Test.kt`, 29 tests) is written to the same cases as the
  Python mirror and must be run in Android Studio. The Python mirror
  (`docs/ai_assistant_mirror.py`) ran: **511/511 passed (100%)**.
- **Real AI voice quality, latency, and the exact free-tier daily
  quota for the owner's project are NOT verifiable from this VM.**
  The Interactions API was never called from here (no key, no live
  call). Voice quality, Hindi/Hinglish pronunciation, Roman Hinglish
  pronunciation, and the exact RPD can only be checked on the owner's
  phone, with his key. The 10/day cap is a conservative working
  assumption from the diagnosis (best available numbers ~10 RPD;
  Google no longer publishes per-model RPD).
- **Roman Hinglish speech is NOT verified** — the build does not
  transliterate, per the diagnosis. If the AI voice mispronounces
  Roman Hinglish, that is a live-test finding, not something this
  mirror can fix blindly.
- The owner's Gemini key lives only on his device (Android
  `SettingsStore` key `ai_key`). It was never asked for, never logged,
  never put in any file.

## 1. What was built

### Part 1 — Real AI voice (replaces the device voice entirely)

- Speech model `gemini-3.8-flash-lite-tts` via the Interactions API
  `POST https://generativelanguage.googleapis.com/v1beta/interactions`
  (the chat endpoint is text-only and is never used for audio).
  Audio is WAV 24 kHz mono 16-bit PCM, played with `MediaPlayer`
  (no new dependency). Key travels as an `x-goog-api-key` header,
  never in the URL, never logged.
- **Cap: 10 spoken replies/day**, separate from the chat quota.
  **Reset: midnight Pacific** (the provider resets daily quotas at
  midnight Pacific, so the counter resets on the same day).
  **Counter: visible in the chat** (chip next to "Voice replies:
  ON/OFF", "AI awaz: X/10") **and in Settings → Voice**.
  Hard stop at the cap with an honest line in the user's language —
  never a silent stop, never the device voice as a substitute.
  No key saved → honest guidance to save the key in Settings → AI
  Chat, never speaks.
- **Speak SHORT replies only: first ~2 sentences / max 400 chars.**
  Long replies stay text-only, with a spoken tail ("...aage ka
  jawab aap chat mein padh sakte hain."). Exactly 1 speech call per
  reply; minimum gap 21 s between calls (3 requests/minute ceiling).
- **Voices: Kore (default), Puck, Charon, Fenrir** — picker in
  Settings → Voice with a "Suno" hear-test per voice (a hear-test
  costs 1 of today's 10 replies, same as a reply). Persisted in
  `SettingsStore`. No provider/model names in any UI.
- **STT: hi-IN kept** (Android already defaulted to it). Confidence /
  duplicate windows unified with the website's chosen pair:
  **0.5 / 5 s** (was Android 0.45 / 4 s; website 0.6 / 6 s).
- Stop/interrupt still works (stops `MediaPlayer` immediately). The
  voice-replies toggle now controls the AI voice; off = text only.
- The device voice is GONE: no `TextToSpeech`, no utterance
  listener, no speed/pitch settings anywhere in the app
  (verified by `verify-android.py` §16 + §19, and by grep: zero
  `speechRate`/`speechPitch`/`TextToSpeech` references in Kotlin).

### Part 2 — Chat understanding (C-1..C-18)

| Case | Fix |
| --- | --- |
| C-1 | Follow-up amount merges into the pending preview ("Aaj Xerox ke 300 cash hue" → "Aur 200 UPI" → "Ha" saves BOTH ₹300 cash + ₹200 UPI). New merge helper; merged preview gets a new idempotency key. |
| C-2 | Leading "Haan/Ha" stripped first; "Ha aur 200 UPI bhi add kar do" is a real instruction, never a bare confirm. A fresh instruction drops the pending preview with an honest notice. |
| C-3 | Correction picks the number NOT attached to the rejection marker: "nahi, 500 nahi 600 tha" → ₹600 (was ₹500). New `correctionPair`. |
| C-4 | Number words route ("do sau Xerox cash hue" → ₹200). Verified via existing normalise. |
| C-5 | Greeting never hijacks a business question: "Aaj su chale chhe, ketlo profit thayo?" is a factual profit question, not casual. |
| C-6 | The proactive UIDAI suggestion ("ask me for the module…") is REMOVED from the external-limit text (all 4 languages). An EXPLICIT module request still specs → confirm → queues a real saved dev request, never claims built. No blanket blocklist. |
| C-7 | Key-status intent: "Mene Key Dal Di Starting Me" is understood; the answer comes from the device's actual key state, never shows the key. |
| C-8 | "Kaise Add Karu Dhadhe Ka" → Daily Business how-to help ("dhadhe"/"dhande" → "dhandha"). |
| C-9 | Local general knowledge: "Bharat ki rajdhani kya hai?" → "Bharat ki rajdhani New Delhi hai." (no key needed). |
| C-10 | "1000 cash se UPI kar do" → internal transfer (never income/expense), both directions. |
| C-11 | Multi-date entries keep their own day: "Aaj printing ke 150 cash hue, aur kal ke 200 upi bhi add kar do" saves ₹150 today + ₹200 yesterday; preview marks "(kal)". A lone "kal" still clarifies. |
| C-12 | Due split: "Ramesh ne 200 diye, baaki 300 udhaar" → total ₹500, received ₹200, due ₹300 (was: ₹200 dropped, ₹300 recorded as the whole due). A due with a received part now asks for its Cash/UPI mode instead of previewing an action the backend would refuse. |
| C-13 | "Aur English mein likho" translates ONE reply (never switches); "… mein baat karo / samjhao" switches. New `TRANSLATE_REPLY` intent; checklist translation unchanged. |
| C-14 | Hinglish markers added ("aur", "bhi", "samjhao", "samjha", "kiya", "mila", "bare", "mein"); a weak detection (confidence ≤ 0.5) keeps the last language instead of flipping. |
| C-15 | Cloud-reply language check (`CloudAiClient.isWrongLanguage`): a confident reply in the wrong language is flagged, mixed/low-signal text never is. |
| C-17 | Typed interrupt: "Bas, short mein batao" shortens the last reply to 2 sentences; "Bas, <question>" re-processes the question. |
| C-18 | Ordinal delete: "Dusra wala delete kar do" picks the 2nd entry in the shown order (pehli=1st, dusri=2nd, teesri=3rd). |

Not broken (guards held): financial preview → confirm → backend →
verify; contradiction guard; cloud never claims financial actions;
do-it commands; local fallback + grey cloud note; UPDATE 21 follow-up
behaviour; UPDATE 23 delete flows (11/11 mirror tests pass);
UPDATE 24 auth (untouched); plan/checklist flows; the "Kaise Ho
Bhai" Marathi guard.

One pre-existing test was updated, not weakened: the old
`u20-lang` mirror test asserted "Aur English mein likho" IS a
language switch — that was the C-13 bug. It now asserts
`TRANSLATE_REPLY` (translate, never switch).

## 2. Files changed

| File | Change |
| --- | --- |
| `domain/AiFeatures.kt` | Added `AI_MODEL_VOICE` (speech model id; the only provider-named line allowed there). |
| `domain/AiVoice.kt` (new) | Pure logic: `AiVoiceConfig` (DAILY_LIMIT=10, SPOKEN_CAP_CHARS=400, MIN_GAP_MS=21000, INTERACTIONS_URL, VOICES, Pacific-day/quota-label), `AiVoiceResult`, `AiVoiceText.shortenForVoice` + honest lines, `AiVoiceRequest.buildJson`/`extractAudioBase64`. |
| `domain/AiVoiceClient.kt` (new) | `speak(text, voice)` over the Interactions API; serialised calls + 21 s gap; 429 → quota-exhausted; no key/model name in UI or logs. |
| `domain/VoiceConversation.kt` | `VoiceSettings` lost speed/pitch, gained `voiceName`; STT 0.5 / 5000 ms; `speakable()` delegates to `AiVoiceText`. |
| `data/SettingsStore.kt` | Removed rate/pitch keys; added `voiceName`, `voiceUsedCount`, `voiceUsedDate`, atomic `consumeVoiceReply` (reserve-first, resets on a new Pacific day), `markVoiceQuotaExhausted`. |
| `ui/chatbot/VoiceOutput.kt` | Rewritten: `VoiceSpeaker.playAudio(bytes)` via `MediaPlayer`; new `VoiceTestPlayer` for the Settings hear-test. No device voice. |
| `ui/chatbot/ChatbotViewModel.kt` | AI-voice speak pipeline (`speakWithAiVoice`, quota reserve-first, no-key/quota notices once per session/day), `testVoice`/`setVoiceName`, C-1 merge helper, C-2 strip-yes step-1, C-7 key-status answer, C-13 translate-only path + real language switch, C-15 cloud language guard, C-17 typed interrupt, C-18 ordinals, C-12 mode question in the clarification chain, per-entry-day handling. |
| `domain/CloudAiClient.kt` | Added `isWrongLanguage` (C-15). |
| `domain/AiAssistant.kt` | Added `formatRupees` import (fixes the pre-existing latent issue — the first compile would have hit it); `correctionPair`, `stripLeadingYes`, `isKeyStatusMessage`, `ordinalIndex`; `AiDailyEntry.dayEpoch` + multi-date parsing/preview; due split (diye/baaki); low-confidence language fallback; `detectHelp` dhandha arm. |
| `domain/Conversation.kt` | `TRANSLATE_REPLY` intent + `languageRequestForm` (likho vs switch); C-5 casual veto; C-6 suggestion removed; C-8 write-help; C-9 GK capital; `LocalReply`/`Conversational.requestedLanguage`; context lifecycle for translate. |
| `domain/Multilingual.kt` | HINGLISH keywords + markers (C-14); "dhadhe"/"dhande" → "dhandha" (C-8). |
| `data/repository/Repositories.kt` | `executeAiDailyEntries` saves each entry on its own day; verification re-read covers every entry day. |
| `ui/chatbot/ChatbotScreen.kt` | Speaker plays audio bytes (`playAudio`); visible "AI awaz: X/10" counter chip; rate/pitch wiring removed. |
| `ui/settings/SettingsScreen.kt` | Voice picker (Kore/Puck/Charon/Fenrir + "Suno" test), counter, quota note, no-key guidance; speed UI removed. |
| `MainActivity.kt` | Wires voice name/counter/test audio to Settings (voice test runs through a Settings-scoped `ChatbotViewModel`); rate wiring removed. |
| `app/src/test/.../Update25Test.kt` (new) | 29 Kotlin tests (voice + C-1..C-18 + regressions). NOT run here — no JDK. |
| `docs/ai_assistant_mirror.py` | Mirrored every fix (correction pair, strip-yes, key-status, ordinal, multi-date, due split, translate, GK, voice helpers, interrupt handling, send() step-1 rework) + 24 new `u25-` tests; 1 old `u20-lang` test updated to the C-13 behaviour. |
| `docs/verify-android.py` | §16 rewritten to the UPDATE 25 voice design (device voice forbidden); new §19 UPDATE 25 checks. |
| `docs/AI_TEST_REPORT_UPDATE25.md` (this file) | This report. |

## 3. Test results (measured on this VM)

- **Python mirror: 511/511 passed (100%)**, including:
  - `u25-` (UPDATE 25 AI voice + chat understanding): **24/24**
  - `u23-delete`: 11/11 · `u22-appchange`: 24/24 ·
    `u21-followups`: 18/18 · `u21-multiturn-long`: 10/10 ·
    all UPDATE 20 groups: 15/15 each (one old `u20-lang` test
    updated to the C-13 behaviour, see §1).
- **Kotlin `Update25Test.kt`: 29 tests written, NOT run** (no JDK
  on this VM). They mirror the same cases as the `u25-` mirror
  batch. Run them in Android Studio before calling this done.
- **`docs/verify-android.py`: ALL JVM-FREE CHECKS PASSED**,
  including the rewritten §16 (device voice forbidden) and the new
  §19 (UPDATE 25 needles: caps, voices, quota, C-1..C-18 tests,
  mirror `u25-` batch ≥ 20).

## 4. Exact caps / counter / voice defaults (must match the website)

- Spoken replies: **10/day**, reset **midnight Pacific**.
- Counter: **"AI awaz: X/10"** — visible in chat + Settings → Voice.
- Speak: **first ~2 sentences / max 400 chars**; 1 call per reply;
  **min gap 21 s** between speech calls.
- Voices: **Kore (default), Puck, Charon, Fenrir** (Settings → Voice,
  "Suno" to hear each; a hear-test costs 1 reply).
- STT: **hi-IN**, confidence **0.5**, duplicate window **5 s**.
- Chat model stays the same as before; speech model is the
  Interactions-API voice model (see `AiFeatures.AI_MODEL_VOICE`).
- No provider/model names in any UI; no key in any file; no paid
  path anywhere.

## 5. Owner phone test steps (do these on his phone, with his key)

Key check first: Settings → AI Chat must show the key as saved.
If it does not, re-enter the key there (never in chat).

### Voice (V1–V11, from the diagnosis)
1. **V1 — hear the voice:** open AI chat, say "Kaise ho bhai?" — the
   reply should be SPOKEN in a real AI voice (not the phone's voice),
   in Hinglish, and the counter should read "AI awaz: 1/10".
2. **V2 — short only:** ask a long question (e.g. "Aaj ka poora
   hisab batao") — only the first ~2 sentences are spoken; the full
   answer stays as text.
3. **V3 — voice pick:** Settings → Voice → tap "Suno" on Puck, then
   Charon, then Fenrir — each speaks the test line; pick one; the
   next chat reply uses the picked voice. (Each "Suno" costs 1 reply.)
4. **V4 — Hindi:** speak in Hindi ("Aaj Xerox ke 300 cash hue") —
   the reply is spoken in clear Hindi/Hinglish.
5. **V5 — Gujarati:** "Aaje su chale chhe?" — the reply is spoken
   in Gujarati.
6. **V6 — quota:** use the voice 10 times in one day — the 11th
   reply must stay TEXT ONLY with the honest line ("Aaj ki AI awaz
   khatm ho gayi hai — kal subah phir milegi"), never the phone's
   voice, never silence.
7. **V7 — next day:** after midnight Pacific the counter resets to
   "AI awaz: 0/10".
8. **V8 — no key:** (only if the key is ever removed) a voice reply
   must say the key is needed in Settings → AI Chat, never speak.
9. **V9 — interrupt:** while a reply is speaking, tap Stop / say
   "Bas" — speech stops immediately.
10. **V10 — long reply + mic:** a long spoken reply must not
    re-trigger the mic mid-speech in continuous mode.
11. **V11 — rate limit:** if the service ever answers "too many
    requests", the chat must say so honestly (text), not fake a
    spoken reply.

### Comprehension (E.2 — do each in a fresh chat where noted)
1. **C-1:** "Aaj Xerox ke 300 cash hue" → "Aur 200 UPI" → "Ha" —
   Daily Business must show BOTH ₹300 cash + ₹200 UPI, once each.
2. **C-2:** with a preview pending, "Ha aur 200 UPI bhi add kar do"
   — the ₹200 must merge into the preview, NOT confirm the old one.
3. **C-3:** with a ₹300 preview, "nahi, 500 nahi 600 tha" — the
   preview must become ₹600 (not ₹500).
4. **C-4:** "do sau Xerox cash hue" — saves ₹200.
5. **C-5:** "Aaj su chale chhe, ketlo profit thayo?" — answers with
   the profit figures, not just a greeting.
6. **C-6:** "UIDAI portal par Aadhaar update kar do" — the reply
   must NOT tell him to ask for a module. Separately, "Aadhaar
   Mobile Number Update ka module bana do" → spec shown → "Haan,
   banao" → queued as a real dev request (never "built").
7. **C-7:** "Mene Key Dal Di Starting Me" — answers whether the key
   is saved (Settings → AI Chat), without showing the key.
8. **C-8:** "Batana Nahi Hai Kaise Add Karu Dhadhe Ka" — explains
   where/how to add the day's business (Daily Business), not figures.
9. **C-9:** "Bharat ki rajdhani kya hai?" — "Bharat ki rajdhani New
   Delhi hai."
10. **C-10:** "1000 cash se UPI kar do" — internal transfer, never
    income/expense.
11. **C-11:** "Aaj printing ke 150 cash hue, aur kal ke 200 upi bhi
    add kar do" — ₹150 lands today, ₹200 lands yesterday (check both
    days' Daily Business); preview shows "(kal)" on the ₹200.
12. **C-12:** "Rahul ne 200 diye, baaki 300 udhaar" (Xerox) — total
    ₹500, received ₹200 (ask mode first), due ₹300.
13. **C-13:** after any reply, "Aur English mein likho" — translates
    THAT reply only; the NEXT reply must still be Hinglish.
    "Mujhe English mein samjhao" — switches to English.
14. **C-14:** "Aur 200 UPI" and "Mujhe samjhao" — replies stay
    Hinglish (never flip to English).
15. **C-17:** after a long reply, type "Bas, short mein batao" —
    the last reply is shortened to 2 sentences.
16. **C-18:** with 3 entries today, "Dusra wala delete kar do" —
    the 2nd entry's delete preview appears.
17. **Regression (UPDATE 23):** add ₹600 Aadhaar UPI, then "Isko
    remove kar do" → "Ha" — the entry disappears, today's UPI drops
    by ₹600, the entry appears in Recycle Bin.
18. **Regression (greeting):** "Kaise Ho Bhai" — a warm Hinglish
    reply, never Marathi, never "no records".
