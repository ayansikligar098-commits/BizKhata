# BizKhata AI — Conversational Architecture (UPDATE 14/15/16)

## What changed and why

Two screenshot-proven bugs:

1. **UPDATE 14** — "Kaise Ho Bhai" (Hinglish greeting) got a Marathi reply
   about "no business records". Root causes: `answerLocally()`'s greeting
   regex was start-anchored and did not include "kaise ho", so the message
   fell through to the no-data template; and `detectLanguage()` scored the
   lone word "ho" as Marathi.
2. **UPDATE 15** — "Mujhe kal PAN Card banane hai" (a plan about tomorrow)
   got "PAN Card ke kitne rupaye hue?" (a forced money question). Root
   cause: the parser's "service mentioned, no amount" branch asked for an
   amount for any service mention, including plans and statements.

Both came from the same architectural fact: the built-in responder was a
template/regex engine (`answerLocally()` → `replyIn()` templates) used as
the *main conversation engine*. That is fixed by the layering below.

## Layers (in order — the router runs FIRST)

| Layer | File | Job |
|---|---|---|
| Unified intent router | `src/lib/intent.ts` | Classifies every message: `casual`, `general`, `business_query`, `business_action`, `app_help`, `navigation`, `plan`, `statement`, `do_checklist`, `do_summary`, `language_switch`, `unknown`. Casual/plan/do-commands are decided **before** the financial parser ever sees the message. |
| Orchestrator | `src/lib/conversation.ts` | `respondToMessage()` — one entry point for UI + tests. Executes do-commands, returns structured actions for preview, falls back honestly when the local engine cannot answer. |
| Local general engine | `src/lib/general.ts` | On-device, no key, no network: varied casual replies (2–3 variants), jokes, PAN/Aadhaar/Voter/Ayushman/CSC explainers, troubleshooting, CSC business ideas, website planning, writing templates, safe arithmetic/conversions, checklists (built + saved per profile). Answers **only** what it genuinely covers; returns `null` otherwise. |
| Conversational-AI client | `src/lib/conversation-ai.ts` | Provider-neutral: calls the owner-configured AI service (endpoint + key from Settings) with a system prompt carrying language/style, history, business context and ledger facts. No provider/model/key names anywhere in UI, strings, errors or logs. The service never performs financial actions and never sees the whole database. |
| Structured business engine | `src/lib/chatbot.ts`, `src/lib/knowledge.ts`, `src/lib/assistant.ts` | Unchanged authority for money: action parsing, ledger Q&A, preview → confirm → backend execution, idempotency, integer paise. |
| Language layer | `src/lib/languages.ts` | `detectLanguage()` with the UPDATE 14 guard: distinctive Roman Gujarati/Marathi markers first, then strong Hinglish markers (`kaise`, `bhai`, `hoon`, `mujhe`…); a lone "ho" scores nothing; Roman hi/ur ties go to Hinglish. New reply keys: `casualGreeting`, `casualBored`, `casualThanks`, `casualMood`, `planAck`, `notUnderstood`, `aiKeyNeeded` (full text in en/hi/gu/mr; other languages fall back to the English template via `replyIn()` — documented fallback, content is correct). |

## Rules the router enforces

- **Plan/statement guard** (`isPlanOrStatement()`, also called inside
  `parseAssistantMessage()`): a future plan / statement with no amount and
  no money question is NEVER answered with a money question. It gets a
  contextual acknowledgement + relevant help (e.g. a checklist offer).
- **No blanket no-data reply**: `answerLocally()` no longer returns the
  no-data template for profit/income/expense/balance/overview — ₹0.00 on an
  empty store is the honest figure. No-data is used only for a genuinely
  unknown question on an empty store.
- **Honest limitation, no key**: when the local engine cannot genuinely
  answer and no AI service is configured, the assistant says so plainly
  in the user's language (first time per conversation) and asks the user
  to rephrase. It NEVER invents an unrelated business question. When a
  service IS configured, the chat UI tries it (10 s timeout) and falls
  back to the honest local reply on any failure — never a technical error.
- **Live information**: never invented. The local engine says it has no
  live news/rates on-device; the configured service may look it up.
- **UPDATE 16 — "the AI does what I say"**: navigation commands perform
  `router.push` to the real route; checklist requests build + save a real
  checklist (`bizkhata.checklists.v1.<profileId>` in local storage);
  summary/report requests return the real ledger summary; language-switch
  requests set the profile's AI language immediately. Financial actions
  still go through preview → confirmation → backend (the owner's own
  safety rule) — the AI never saves from conversation alone.

## Settings — AI chat key (generic, unnamed)

Settings → "AI Chat": an optional service address + key. The key is stored
only on the device (`bizkhata.ai.service.key.v1` in local storage), never
in the business profile, never in backups/exports, never displayed
(password field, "saved ✓" only), never logged. Without it, accounts
questions, entries and app help all still work; only open-ended general
conversation needs it.

## Tests

- `tests/conversation.test.mjs` (new, in `npm test`): 4 language-detection
  checks + 10 UPDATE-14 + 10 UPDATE-15 + 3 UPDATE-16 conversations on a
  completely empty store, plus preview→save verification, duplicate
  prevention, context follow-up and mid-conversation language switch.
  Every reply is judged on whether it genuinely answers the message.
  Tests that need a live AI service run **against the local engine** and
  verify the honest-limitation behaviour; no live-AI reply is faked.
- `tests/drive-conversation.mjs` (new): Playwright drive over the built
  `out/` — register → all acceptance conversations through the real
  `/chatbot` UI → Xerox ₹300 cash preview → Confirm & Save → store
  verified → duplicate warning → cancel → language switches.
- Regression: accounting 52/52, assistant 100/100, AI 63/63,
  multilingual 204/204, conversation suite all passing (see test output).

## Known limits (honest)

- The dynamic conversational engine is the owner-configured AI service.
  No service is configured by default (free tier, nothing bought, no
  account created), so open-ended general conversation beyond the local
  knowledge base currently answers with the honest key notice.
  **Unverified**: a live call against a real configured service (needs the
  owner to add a key in Settings); live-device voice testing.
- Exact-language detection stays 12/23 for same-script languages
  (Devanagari/Bengali/Arabic sharing); parsing and figures are unaffected
  and replies fall back to Hinglish/English with correct content.
- Casual/general replies in the 19 languages without full templates fall
  back to English wording via `replyIn()` (figures and intent unaffected).
