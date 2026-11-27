# AI Test Report — UPDATE 25 (BizKhata AI Assistant improvement)

**Date:** 2026-11-27 (evening IST). **Worker:** website fix worker (UPDATE 25).
**Scope:** (1) real AI voice replacing the device voice entirely; (2) chat-understanding fixes C-1..C-15 (+ C-16/C-17/C-18) from `UPDATE25-DIAGNOSIS.md`.
**Result: full `npm test` passes — 1312/1312 checks, `npx tsc --noEmit` clean, `npm run build` passes.**

## Per-suite counts (full `npm test`, one run, 2026-11-27)

| Suite | Checks | Result |
|---|---|---|
| accounting | 52 | 52 passed |
| assistant | 100 | 100 passed |
| ai | 64 | 64/64 (100%) |
| language | 204 | 204/204 (100%) |
| conversation | 47 | 47/47 (100%) |
| update20 | 202 | 202/202 (100%) |
| update20-multiturn | 38 | 38/38 (100%), 6 conversations |
| streaming | 68 | 68/68 (100%) |
| voice (UPDATE 25 revision) | 165 | 165/165 |
| update23 | 12 | 12/12 (100%) |
| auth-update24 | 63 | 63 passed |
| **ai-voice (NEW)** | **135** | **135/135** |
| **update25 (NEW — diagnosis §E.2, 24 cases)** | **162** | **162/162** |
| **TOTAL** | **1312** | **1312 passed, 0 failed** |

### New voice suite (`tests/ai-voice.test.mjs`, 135 checks, 9 sections)
- Caps/defaults 10/10 · TTS request building 11/11 · response parsing 8/8 · short-reply cap 8/8 · quota/counter 19/19 · voice pick 6/6 · no-device-voice 12/12 · player interruption 19/19 · speakAiReply end-to-end 42/42.
- Covers: Interactions API body (model, audio format, voice, style, key never in the body), quota cap 10 + Pacific-midnight reset (incl. the 23:00 PST → 00:30 PST boundary), `markVoiceQuotaExhausted` on 429, rate-gap (21 s) with `waitMs`, relay-first + direct fallback (key in `x-goog-api-key` header only), no-key → fetch never called, network/upstream failures spend no quota, long-reply trim (≤400 chars, first 2 sentences), player stop = immediate pause + URL revoke, second play stops the first, `speechSynthesis` never called (source grep over `voice.ts`, `ai-voice.ts`, `chatbot.tsx`, `views-reports.tsx` + `VoiceController.speak()` returns `false`).

### New comprehension suite (`tests/update25.test.mjs`, 162 checks, 24 cases + regression guards)
- Case 1 GK 4/4 · case 2 plan arc 10/10 · case 3 C-1 merge 14/14 · case 4 C-2 5/5 · case 5 C-3 4/4 · case 6 C-4 5/5 · cases 7–8 C-5 6/6 · case 9 C-6 override 9/9 · case 10 C-7 9/9 · case 11 C-8 5/5 · case 12 C-10 9/9 · case 13 C-11 9/9 · case 14 C-12 12/12 · case 15 C-14 PAN 4/4 · case 16 C-14 MT 5/5 · case 17 C-13 8/8 · case 18 MT fund 3/3 · case 19 two-amount 3/3 · case 20 today-only 2/2 · case 21 guards 6/6 · case 22 stickiness 7/7 · case 23 C-15 7/7 · case 24 C-18 ordinals 9/9 · regression guards (Marathi guard + UPDATE 23 delete) 7/7.
- Case 3 drives the exact 04:27 sequence and saves both entries (₹30000 cash + ₹20000 UPI) through the real UI confirm gate (`parseAssistantMessage` → `confirm` → `applyAssistantAction`).
- Case 14(b) caught a real bug during testing (see "Bug found while testing" below) and now passes after the fix.

### Existing suites updated for the new behaviour
- `tests/voice.test.mjs` (165 checks): device-voice scenarios rewritten — `speak()` returns `false`, no utterance/boundary assertions, continuous mode without the speech leg; scenario 9 and the §3 follow-up now pass `pendingAction: undefined` after a save (matching the real UI gate) and assert exactly 1 follow-up entry.
- `tests/update20.test.mjs` + `tests/update20-multiturn.test.mjs`: 4 expectations updated from the old replace behaviour to the C-1 merge (`"Aur 200 UPI"` after a ₹300 preview now totals ₹50000 with 2 entries, not ₹20000 with 1). The `"Ha"` must-not-fake-save case still passes unchanged.
- `package.json` test script now runs `ai-voice.test.mjs` and `update25.test.mjs` last.

## What changed per file

### New files
- **`website/src/lib/ai-voice.ts`** — the whole AI-voice module (pure + injectable): Interactions API request building (`ttsRequestBody`, `extractTtsAudio`, `base64ToBytes`), daily quota (`voiceUsageToday`, `voiceRemaining`, `canSpeakToday`, `recordVoiceUse`, `markVoiceQuotaExhausted`, `voiceCounterText`), spoken-text cap (`prepareSpokenText`), voice list (`AI_VOICES`, `aiVoiceFor`), honest lines (`VOICE_NO_KEY`, `VOICE_QUOTA_DONE`, `VOICE_LONG_REPLY_NOTE`), interruptible `<audio>` player (`AiVoicePlayer`), end-to-end `speakAiReply` (no-key → quota → rate-gap → relay → direct fallback → play → record use only after audio arrives).
- **`functions/api/ai-tts.ts`** — repo-root Cloudflare Pages Function (same placement as `ai-chat.ts`; never under `website/`): `POST {key, text, voice}` → upstream Interactions API with `x-goog-api-key`, returns `{ok:true, audio, mime}` or `{ok:false, error}` (429 → `'rate-limited'`); refuses text >2000 chars; never stores/logs the key.
- **`website/tests/ai-voice.test.mjs`** — 135 checks (see above).
- **`website/tests/update25.test.mjs`** — 162 checks, the 24 diagnosis cases.

### Edited files
- **`website/src/lib/voice.ts`** — device TTS removed: `speak()` always returns `false`, never touches synthesis; `SpeechSynthesisLike`/`UtteranceLike`/`isSpeechSynthesisSupported`/utterance deps removed; `isSpeaking` always false; `interruptSpeech()` is a state no-op (the UI stops the `<audio>` player). STT untouched. Thresholds unified per C-16: low-confidence **0.6 → 0.5**, repeat window **6000 ms → 5000 ms**. Pure helpers kept (`pickVoice`, `preferredVoiceName`, `cleanSpokenText`, `shortenForVoice`, `spokenWords`). One real fix inside a helper: `cleanSpokenText` now keeps the total at most `maxChars` even with the trailing `…` (a 400-char cut of a spaceless sentence used to return 401 chars).
- **`website/src/lib/languages.ts`** — vocab: `dhadhe`/`dhande`/`dhandhe` variants (C-8). `detectLanguage`: Hinglish combo guard (`samjhao|samjha|kiya|kiye|mila|mile|samajh|batao` + `ke|ka|ki|ko|ne|se|mein|me|pan|aadhaar|transfer|commission|bare|baare` → hi 0.85); `samjhao, samjha, kiya, kiye, mila, mile, ko, ne, se` added to hi markers; `'upi'` removed from the `englishWords` regex (C-14 — it flipped "Aur 200 UPI" to English).
- **`website/src/lib/intent.ts`** — new intents `key_status` | `translate_reply` | `shorten_reply`. `correctedNumber()` rewritten (C-3): the number next to `nahi|nahin|galat|wrong` is the REJECTED value; the corrected value is the last non-rejected number ≠ old. `casualKindFor()`: greeting + business question in one message returns null (C-5). New `isKeyStatus()` (C-7) and `isShortenRequest()` (C-17). `classifyIntent` order: checklist-translate → `translate_reply` (anchored `^(aur)?LANG (mein|me|main) (likho|likh|batao|kar do|convert|likh do|bata do)$`, C-13) → `shorten_reply` → `key_status` → existing steps. Step 5 amount test now uses `norm(raw)` (C-4). Step 6 app_help: `(kaise|how) (add|likh|daal|note|likhu|karu|karna|kart[aei])` or (`dhadhe|dhande|dhandhe` + `kaise`) → app_help (C-8).
- **`website/src/lib/chatbot.ts`** — confirm/cancel gates (C-2): leading-yes stripped and the remainder parsed as an action when it has an amount + action word; bare "Haan" still confirms; cancel skipped when `isCorrectionLike` (fixes a latent UI bug where corrections like "Nahi, 3 the, 5 nahi" were swallowed). Internal transfer `transferSe` pattern (C-10). Baaki split before the daily-income block (C-12): due job match → `customer_payment` (due falls to the stated amount); else two-entry split (received + `'other'` due); unknown customer/service → drafts carrying the split. **Bug fix found by the new suite:** the generic customer-due branch swallowed baaki messages for customers not in the store (returned a `customerPaymentAmount`-only draft, dropping the ₹300 due) — it now carves out baaki splits (`baaki|udhaar` + ≥2 amounts) so they reach the baaki block. Per-amount dates (C-11): `dateNearAmount` (date word must be in the same clause) + exported `entryPreviewLine` (adds ` (kal)` when the entry date ≠ the action date); entries carry `date`; `missingServiceDates`/`pendingDates` flow through the drafts and `applyDraftAnswer`. Ordinal delete (C-18): pehla/dusra/teesra → Nth most recent entry via `recentAssistantTargets(...,3)`; fewer entries → candidates draft. `answerLocally`: greeting branch skipped when the message asks a figure (C-5). UPDATE 23 delete logic untouched.
- **`website/src/lib/assistant.ts`** — `AssistantAction` daily-income entries gained optional `date?: string`; `applyAssistantAction` uses `e.date || date` for the job, DailyEntry and CashTxn dates.
- **`website/src/lib/knowledge.ts`** — `ChatContext` gained `lastBotText?: string` (last bot reply, set by the UI each turn; never a financial record) and `translateTarget?: AiLangCode`.
- **`website/src/lib/conversation.ts`** — language selection falls back to `ctx.lastLanguage` when detection confidence ≤ 0.5 (C-14). New handlers: `key_status` (checks `hasAiServiceKey()`, never shows the key), `translate_reply` (last reply + honest note in the target language, `cloudNeeded: true`, profile language never changed), `shorten_reply` (`shortenForVoice(lastBotText, 2)`). C-1 merge in the business-action branch: pending daily-income preview + follow-up amount (starts with `aur|or|also|bhi|add|phir` or contains `aur|bhi`) → merged entries, rebuilt preview lines, recomputed total + duplicate warning.
- **`website/src/lib/general.ts`** — C-6: UIDAI text no longer suggests saying "Aadhaar Mobile Number Update ka module bana do"; it now says to give the customer details and the job will be recorded/tracked in Aadhaar Services. C-9: local GK mini-KB for capitals (India→New Delhi, Maharashtra→Mumbai, Gujarat→Gandhinagar, UP→Lucknow, Tamil Nadu→Chennai, Karnataka→Bengaluru, West Bengal→Kolkata, Rajasthan→Jaipur, Punjab→Chandigarh, MP→Bhopal, Bihar→Patna, Delhi→New Delhi), replies in en/gu/Hinglish.
- **`website/src/lib/conversation-ai.ts`** — added `cloudReplyMatchesLanguage(text, expected)` (C-15): passes when there are no letters, the detected code matches, confidence < 0.7, or the expected language is among the detected languages. `guardCloudReply` untouched (UPDATE 23).
- **`website/src/lib/types.ts`** — `BusinessProfile.aiVoice?: string` (the picked AI voice; the old device-voice fields `voiceRate`/`voiceByLang` no longer drive any speech output).
- **`website/src/components/chatbot.tsx`** — the AI-voice wiring: `speak()` now calls `speakAiReply()` (key from `getAiServiceKey()`, voice from `aiVoiceFor(profile)`) through one `AiVoicePlayer` over real `Audio` + `URL.createObjectURL`; no-key → `VOICE_NO_KEY` once per session; quota → `VOICE_QUOTA_DONE` once per day; rate-gap → one retry after `waitMs` (guarded by a speak token); success updates the counter state and shows "AI voice: X/10 aaj" near the mic (new `voice-counter` test id). All `speechSynthesis` adapter code removed (`adaptUtterance`, `synthesis`, `spokenTextRef`, `onBoundary` word highlight — AI audio has no boundary events; `speaking` state kept with wordIndex 0). `VoiceController` built recognition-only. `stopVoice()` / `stopGeneration()` / `send()` / `toggleMic()` stop the player (token bump + `player.stop()`); continuous mode restarts listening from the player's `onEnded`. `recognitionLang()`: default **hi-IN** (was en-IN), uses `recognitionLangFor(profile, lastUserText)` when no profile preference and no conversation language (B-1). `respond()`: passes `lastBotText` into the ctx; passes `ctx.pendingAction` **only when `pendingRef.current` exists** (the C-1 gate — after Confirm/Cancel the old preview must not be re-merged); `cloudContextNote()` carries the translate-target instruction. `displayText` onDone: after `guardCloudReply`, `cloudReplyMatchesLanguage(finalText, expectedLang)` is checked; on mismatch the local reply is shown and the message gets `cloudLangMismatch` + the grey note "Cloud AI ne galat bhasha mein jawab diya — ye jawab aapki bhasha mein, aapke record se diya hai."
- **`website/src/components/views-reports.tsx`** — Settings → Voice card rebuilt: browser-voice picker, `browserVoices` state/effect, speech-rate slider and `voiceLangKeyFor`/`voiceSettingsFor` imports removed. Now: AI voice picker (Kore default + Puck, Charon, Fenrir; persisted as `profile.aiVoice`), counter line (`voiceCounterText()`, refreshed every 30 s), "🔊 Awaz suno" test button (speaks the test sentence, spends 1 of the 10, inline status), no-key guidance, honest text that STT is browser-only but the spoken reply goes to the AI service with the on-device key. Voice-replies and continuous toggles kept.
- **`website/package.json`** — test script adds `node tests/ai-voice.test.mjs && node tests/update25.test.mjs`.

## Exact caps / counter / voice defaults chosen

| Choice | Value | Why |
|---|---|---|
| Voice model (internal only, never in UI) | `gemini-3.8-flash-lite-tts` | Diagnosis §A.2 (documented current path) |
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/interactions` | Documented Interactions API; the chat OpenAI-compatible endpoint is text-only |
| Daily cap | **10 spoken replies/day** | Conservative working assumption from community reports (~10 RPD for this model; Google no longer publishes per-model RPD) |
| Counter | `AI voice: X/10 aaj`, visible in chat (near the mic) + Settings → Voice | Never a surprise limit |
| Reset | **Midnight Pacific** (`America/Los_Angeles`, storage key `bizkhata.ai.voice.count.v1`) | The provider resets daily quotas at midnight Pacific; a local-midnight reset would let the owner spend "tomorrow's" voices while the provider still counts them as today and hit a 429 mid-day |
| Min gap between voice calls | **21 s** (3 RPM) | Serialize so rapid replies never 429; the UI retries once after the gap |
| Spoken-text cap | **First ~2 sentences, max 400 chars** | `prepareSpokenText`; long replies stay text-only with the note "Lamba jawab hai — sirf pehli lines bol raha hoon, poora jawab chat mein padh lo." |
| Voices | **Kore (default)**, Puck, Charon, Fenrir — persisted per profile as `profile.aiVoice` | 4 prebuilt voices, plain names only, no provider words |
| Style | `speech_metadata.style`: "warm, friendly, speaking clearly and naturally" | In the request body only |
| No key / quota out | Honest line in the user's language; text reply still shown | Never the device voice, never a silent fallback |
| STT thresholds (unified, C-16) | Low-confidence **0.5**, duplicate window **5 s** | Between web (0.6/6 s) and Android (0.45/4 s) |
| STT default language (B-1) | **hi-IN** | Was en-IN; `recognitionLangFor` is now actually called |
| Transliteration | **NOT done in this build** | Roman Hinglish → Devanagari only if the phone hearing test says so |

## C-6 override — recorded decision (diagnosis vs task brief)

The diagnosis (§E.2 case 9, ranked fix D-5) asked for an honest **refusal** of the "Aadhaar Mobile Number Update" module request + a blocklist. The task brief **overrides** that: do NOT add a blanket blocklist; KEEP the accepted UPDATE 20 behaviour for an EXPLICIT request (spec → confirm → queue as a real saved dev request, never claim built). Implemented exactly that: only the proactive suggestion sentence in `general.ts` was removed. Case 9 in `update25.test.mjs` asserts the override behaviour (spec → "Haan, banao" → 1 queued dev request) and that no file suggests the phrase. If the owner later confirms he wants the request refused outright, the blocklist is a small change in `dev-requests.ts` + `conversation.ts` — flagging here as instructed.

## Bug found while testing (fixed in this build)

- **C-12, unknown-customer baaki split dropped** (`chatbot.ts`, generic customer-due branch): "Customer Ramesh ne 200 diye, baaki 300 udhaar" with Ramesh NOT in the store returned a generic `customerPaymentAmount`-only draft — the ₹300 due was silently dropped and the baaki block never ran. Fixed by carving baaki splits out of that branch; the message now reaches the baaki block, which asks for the customer AND confirms the due (draft carries `baakiReceived`/`baakiDue`). Verified by case 14(b) (12/12).

## What this build does NOT do (unchanged / out of scope)

- UPDATE 23 delete logic, contradiction guard and `guardCloudReply`: untouched (regression guards pass).
- UPDATE 24 auth files: untouched.
- No provider/model names in any UI string, message, error or Settings text (asserted in the ai-voice suite). Model ids exist only in request bodies / code comments.
- The owner's Gemini key: never read, logged, stored or put in any file by this work; the key slot is only ever checked (`hasAiServiceKey()`) or passed through to the relay/endpoint.
- No transliteration, no Live API build, no Android voice change (Android mirror is separate work; Android code was never compiled here).
- The ₹600 Aadhaar test entry from UPDATE 23 is still in the owner's records — untouched, unrelated.

## Remaining limitations (must be verified on the owner's phone)

1. **Real voice quality and latency are unverifiable from this VM** (no mic/speaker, no owner key here). The owner must hear it: does Kore/Puck/Charon/Fenrir sound natural in Hindi/Hinglish/Gujarati? How long does one spoken reply take (expect roughly 2–5 s, unmeasured)?
2. **Roman Hinglish pronunciation is unverified.** The docs verify Hindi (Devanagari) and Gujarati; whether Roman-script Hinglish is spoken with natural Hindi prosody or an English accent can only be decided by hearing it. If Roman reads badly, the fix is transliteration-to-Devanagari for the TTS input only (chat text stays Roman) — deliberately NOT built yet.
3. **The exact RPD for his project is unverified.** Google no longer publishes per-model RPD; 10/day is a conservative community-reported number. The owner must read his AI Studio rate-limit page (`aistudio.google.com/rate-limit`); if it is below 10, re-plan the rationing. A 429 from the service marks the day exhausted on-device (honest line, no retry spam).
4. **The `/api/ai-tts` relay is deployed only when the site is deployed.** The code falls back to a direct call when the relay is unreachable, but the relay itself has not been hit live from this VM.
5. **Word-highlight while speaking is gone.** AI audio has no word-boundary events, so the old spoken-word highlight in chat is removed (plain "speaking" state instead). The owner should be told.
6. **Cloud-language check runs after the stream completes** (`displayText` onDone) — a wrong-language cloud reply can flash while typing, same as the known UPDATE 23 guard limitation. Routing + the prompt are the primary prevention.
7. **Voice is rationed by design.** At 10 spoken replies/day, a normal shop day exhausts it before closing time; after that, replies are text-only until midnight Pacific. If he wants every reply spoken all day, the free tier cannot do it — the Live API evaluation (§A.7 of the diagnosis) is the only honest next step, and it is unverified + bigger work.

## Owner phone test steps (diagnosis §E V1–V11, adapted)

1. **V1 — hear the voice:** Settings → AI Chat — check the key shows "saved ✓" (or save it there; never in chat). Turn Voice replies ON. In AI chat, type "Aaj ka total kitna hua?" — the reply should be SPOKEN in a natural Hindi/Hinglish voice, not the phone's voice. Judge: natural or English-accented?
2. **V2 — Devanagari vs Roman:** type the same sentence in Devanagari ("आज का कुल ₹500 है, UPI से ₹300 आए") and compare with the Roman version. Tell us which script the voice should use — that decides whether transliteration is needed.
3. **V3 — Gujarati:** type "Aaje su chale chhe? Tamaro total 500 rupiya chhe." — should be spoken correctly in Gujarati.
4. **V4 — long reply:** ask for a full day summary ("Aaj ka poora hisab batao") — only the first 1–2 sentences should be spoken; the full text stays on screen; the counter should go up by exactly 1.
5. **V5 — quota:** keep chatting with voice ON until the counter shows 10/10 — the next reply shows text + "Aaj ki AI awaz khatam ho gayi hai — kal subah phir milegi." Assert the phone's voice NEVER speaks at any point. Next day (after midnight Pacific) it works again.
6. **V6 — no key:** (optional, only if a second browser is handy) remove the key in Settings → AI Chat, turn voice ON, tap the mic — the honest "AI awaz ke liye key chahiye" message appears; no voice, no crash. Then save the key again.
7. **V7 — interruption:** start a spoken reply, tap the mic or say "Bas" — the audio must stop immediately; nothing queued plays after.
8. **V8 — rapid replies:** send two voice replies within a few seconds — the second waits (≥21 s gap) instead of showing an error.
9. **V9 — voice pick:** Settings → Voice → "🔊 Awaz suno" — hear Kore, then change the picker to Puck / Charon / Fenrir and hear each on the same sentence; pick one — it must persist per profile and still be the voice tomorrow. (Note: each test listen spends 1 of the 10.)
10. **V10 — chat understanding (quick checks):** "Aaj Xerox ke 300 cash hue" → "Aur 200 UPI" → "Ha" — Confirm must save BOTH entries. "Haan, aur Xerox 300 cash hue" — must preview ₹300, not ask "kis liye haan". "nahi, 500 nahi 600 tha" after a ₹300 preview — must rebuild as ₹600. "Mene Key Dal Di Starting Me" — must answer whether the key is saved. "Aur English mein likho" — must translate just that reply, NOT switch the profile language. "1000 cash se UPI kar do" — must be an internal transfer. "Dusra wala delete kar do" — must delete the 2nd recent entry.
11. **V11 — rate limit page:** open `aistudio.google.com/rate-limit` (his login, not his key) and read the real RPD/RPM for the voice model; tell us the number — if it is below 10, the rationing gets re-planned.
