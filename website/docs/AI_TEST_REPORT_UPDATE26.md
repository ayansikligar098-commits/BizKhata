# AI Test Report — UPDATE 26: "Dhanda" understanding fix

Date: 2026-11-27 (evening IST). Worker: website fix worker.
Status: **TESTS + TSC + BUILD PASS (measured 2026-11-27 ~21:40–22:00 IST);
PUSH BLOCKED — see "Blocker" at the bottom.**
The coordinator gave the go-ahead for the run/push pipeline; steps 1–3
ran and passed. Step 4 (push) is blocked: the execution-risk flag
reappeared on the pre-push fetch/comparison command, and that command's
output showed the local website/ tree differs from remote HEAD in ~110
files (not just UPDATE 26) — the coordinator must decide before any push.

Reconciled with `~/workspace/al-falah-app/UPDATE26-DIAGNOSIS.md` (diagnosis
worker, 2026-11-27 ~21:20 IST) — see "Diagnosis reconciliation" below. The
diagnosis's safe default (§6b, a draft asking "upar add karun ya total
badal dun?") REPLACES the preview-warning safe default in the first
version of this report.

## The bug (owner evidence)

2026-11-27 20:59 IST, screenshot `workspace/user/files/44793_0_c7jc.jpg`
(bizkhata.pages.dev AI chat): while adding today's business the AI kept
replying, again and again:

> "Service samajh nahi aaya. Services: PAN Card, Aadhaar Services, Voter ID,
> Ayushman Card, Smart Card, Xerox, Printing, Document Work, Money Transfer,
> Passport Size Photo, Scanning."

Owner's definition (21:01 IST, the spec): "Dhanda Matlab Passport Size Photo
Smart Card Xerox Documents Ka Profit Money Transfer Profit Sab Mix Ko Dhanda
Kehta Hu Me" — dhanda = the whole day's mix. "Dhandha Bolu To Samjh Jaye Esa Karo."

## Root cause (verified in code, not guessed)

1. The word WAS known: `website/src/lib/languages.ts` already normalises
   `dhanda/dhandha/dhandho/dhande/dhandhe/dhadhe` + Devanagari `धंधा/धन्दा` +
   Gujarati `ધંધો` (and `business`/`hisab`) to the canonical token `dhandha`.
   (New gap found during reconciliation: `hisaab` — the owner's double-a
   spelling — was NOT in the vocabulary row, so "Aaj ka hisaab batao"
   never normalised. Fixed: `hisaab` added to the row.)
2. The parser never mapped it to anything: `website/src/lib/chatbot.ts`
   daily-income flow — amount + no recognised service → `askService` draft
   (full service list); answering "dhanda" hit `applyDraftAnswer` →
   `findServiceIn('dhandha')` = null → the identical dead-end again
   (the two dead-ends at old lines ~1180/~1202). That is the loop.
   The diagnosis mapped the full family (6 sites: `:1027`, `:1114`,
   `:1144`, `:1180`, `:1202`, `:1289`) — all funnel through the same
   predicate, `findServiceIn(...) === null`.
3. The backend would have rejected it anyway: `assistant.ts`
   `daily_income` validation only allowed services in `profile.services`
   (or `Other Services`) — a `Dhanda` entry could never save.
4. The intent router also missed it: "Dhanda 500" (amount + dhanda, no
   hua/cash word) did not match any step-5 money signal, and "Dhanda add
   kar do" (no amount) fell through to unknown/general.
5. Ask-total had two small defects (diagnosis §5c): on an empty store
   "Aaj ka dhanda batao" REFUSED instead of quoting ₹0, because
   `conversation.ts` tested the raw message for `dhandha` and missed the
   owner's spelling `dhanda`; and the seeded answer leaked the English
   range label ("today ka dhandha").

## What changed

- `website/src/lib/categories.ts` — `DHANDA_SERVICE = 'Dhanda'`: the general
  Daily Business category for the day's mixed business. Deliberately NOT
  added to any profile's `services` list and NO tile on the Services page
  (diagnosis Option A — the label decision).
- `website/src/lib/languages.ts` — `hisaab` added to the `dhandha`
  vocabulary row, so the owner's double-a spelling normalises like
  `hisab` (fixes "Aaj ka hisaab batao" and "Aaj ka hisaab 400 cash hua").
  Also (found while running the suite): the dhandha-family words
  (`dhandha`, `dhanda`, `dhandho`, `dhande`, `dhandhe`, `dhadhe`) and
  `hisab`/`hisaab` are now Hindi markers in `detectLanguage` — before,
  "Dhanda add kar do" scored no Hindi marker and was detected as
  English, so the amount question came out as "Dhanda — how much was
  it?" instead of the Hinglish "Dhanda ke kitne rupaye hue?" (case D
  failed on that). No other language claims these words; native-script
  Gujarati (ધંધો) still scores Gujarati via script detection.
- `website/src/lib/chatbot.ts`
  - New exported helpers: `isDhandaWord()` (any spelling/script + `kaam`
    when no specific service is named), `resolveServiceReply()`,
    `dhandaTodayTotal()`, `dhandaExistingWarning()`,
    `dhandaWarningForEntries()`, and (new in this revision)
    `dhandaAddModeDraft()` — the diagnosis §6b safe-default draft.
  - Daily-income flow: `dhandha` is a segment service (via
    `splitServiceSegments(..., [...profile.services, DHANDA_SERVICE])` with
    a `dhandha` alias, so "Dhanda 500, Xerox 300" splits correctly instead
    of attributing the ₹500 to Xerox); a segment carrying the dhanda word
    beats a stale `lastService`; a named service in the same segment still
    wins ("dhanda: Xerox 300" is a service split).
  - Add with amount → one `Dhanda` entry (preview → confirm → backend →
    verify, as usual). Amount with no mode → ONE short question
    ("Dhanda ke ₹500.00 — Cash mein mile ya UPI mein?"), never the service
    list. Add with no amount → asks the amount once
    ("Dhanda ke kitne rupaye hue?").
  - `applyDraftAnswer`: answering a service question with "dhanda" now
    resolves to the Dhanda category (this is the exact screenshot loop).
    A genuinely unknown service word: first failure keeps the short
    dead-end as a LAST resort but WITH the Dhanda escape hatch
    ("Ya 'Dhanda' likho — agar poora din ka mix tha."); a second identical
    failure escalates to a different question ("poora din ka mix (Dhanda)
    tha, ya kisi ek service ka? …") and never repeats the text or the full
    service list. Attempt count rides in `partial.serviceAskCount`.
  - Baaki/udhaar split: a "dhanda" split resolves to `Dhanda` BEFORE the
    customer's latest-job-service fallback (which would wrongly pin the
    mix to one service). The baaki customer branch still asks for the
    service next when it is genuinely unknown — the reply to that
    question goes through the fixed service branch.
  - Correction ("Dhanda 300 galat tha, 250 hona chahiye"), refund
    ("Dhanda 200 refund"), expense ("Dhanda ka kharcha") and the
    delete/correct target picker ("Dhanda wali entry") all resolve the
    Dhanda label the same way a named service resolves. NOT changed:
    the generic customer-due guard and the service-specific earnings
    branch in `knowledge.ts` — there a Dhanda question is correctly
    answered by the whole-day summary branch, not by a Dhanda-only
    service figure.
  - Delete also resolves "Dhanda wali entry" to the Dhanda category.
  - "Ha, dhanda 500" is no longer swallowed as a bare confirm.
  - Safe default (diagnosis §6b): when pure Dhanda quick entries for
    TODAY are about to be previewed and a Dhanda entry already exists
    today, `dhandaAddModeDraft()` returns a `dhanda_add_mode` draft
    instead of the action. The draft shows today's Dhanda total so far
    AND today's overall collection, and asks "Upar add karo" vs "Total
    badal do". The reply branch: "Upar add karo" / bare "Haan" → normal
    daily_income preview (exact duplicates still carry the ⚠ line);
    "Total badal do" → `correct_entry` on the most recent Dhanda entry
    (preview says so, with the resulting day total); bare "Nahi" →
    cancel, nothing saved; "Nahi, 250 the" → corrects the pending
    amount and re-asks the choice (UPDATE 25 correction guard). The
    draft fires at all four Dhanda completion sites (parser main return,
    method / service / amount draft answers). Mixed entries, baaki
    splits and non-today dates keep the preview warning instead.
- `website/src/lib/assistant.ts` — backend allow-lists `Dhanda` for
  `daily_income`, exactly like `Other Services`. The Daily Business hub
  already attributes any service string, so a Dhanda entry shows in Daily
  Business, Cash/UPI Books and Reports with no double-counting. The
  `correct_entry` backend (used by "Total badal do") updates the entry
  AND its linked CashTxn, and writes an audit entry.
- `website/src/lib/intent.ts` — `dhandha` is a money signal in step 5
  ("Dhanda 500" → business_action); "Dhanda add kar do" / "Mujhe dhanda
  add karna hai" (no amount) → business_action (parser asks the amount);
  `isPlanOrStatement()` no longer treats a present-tense dhanda-add as a
  future plan (a future "Kal dhanda karna hai" stays a plan); `hasMoneyAmount`
  includes `dhandha`. How-to ("Kaise add karu dhadhe ka") and where
  ("Dhanda kahan likhu?") questions still route to app_help.
- `website/src/lib/knowledge.ts` — the ask-flow answer (daily-summary
  branch, already returning the real hub total) now states explicitly:
  MT principal is not counted (commission only) and due is not collection.
  Range label localised: "Aaj ka dhandha", never "today ka dhandha"
  (same mapping as the profit branch). NOTE — two corrections made while
  running the suite (2026-11-27 ~21:45 IST): (a) the empty-store ₹0
  change was REVERTED — the "koi record nahi" refusal is restored,
  because `tests/assistant.test.mjs` §14 (profile isolation) asserts
  `computeKnowledge` returns that refusal for an empty profile, and the
  fix-the-code rule forbids weakening the test. The owner-facing ₹0
  figure is delivered by the `asksFigure` fallback in `conversation.ts`
  (which falls through to the ₹0 overview in `answerLocally`), verified
  by cases J/L — the diagnosis's step 6b is NOT applied, and the
  refusal now carries a comment explaining why; (b) the 'yesterday'
  label keeps the "(yesterday)" gloss — "Kal (yesterday) ka dhandha:" —
  because `tests/ai.test.mjs` pins 'yesterday' in the answer text as the
  proof the summary is for yesterday, and "Kal" alone is ambiguous
  (yesterday/tomorrow) in Hindi.
- `website/src/lib/conversation.ts` — the `asksFigure` guard now also
  matches `dhanda/dhandho/dhande/dhadhe/hisaab` on the raw message, so
  "Aaj ka dhanda batao" on an empty store falls through to the ₹0
  overview exactly like "Aaj dhanda kitna hua?" does (defence in depth
  for the knowledge.ts fix above).
- `website/src/lib/conversation-ai.ts` — system prompt: "dhanda" is the
  day's mix, never ask the owner to pick a single service for it, never
  reply with a bare service list; ask for amount + cash/UPI. (Supplement
  only — the failing messages never reach the cloud; the fix is local.)
- `website/src/lib/voice.ts` — `looksFinancial()` includes dhandha/kaam/
  business/hisab. Voice transcripts already go through the same
  `respondToMessage()` pipeline as typed chat, so the parser/router fix
  covers voice end to end (tested via `handleVoiceTranscript` + the
  normal send flow, case F).
- `website/tests/update26.test.mjs` — new suite (16 cases, see below).
- `website/package.json` — `npm test` now also runs
  `node tests/update26.test.mjs` (last in the chain).

## Safe default (the answer to the brief's open question — diagnosis §6b)

A "Dhanda" total is a RUNNING total for the day, not a series of
independent transactions. So a second Dhanda add on the same day is never
silently added on top — the AI asks first, showing today's Dhanda total so
far and today's overall collection:

> "Aaj Dhanda ₹500.00 pehle se saved hai (1 entry; aaj ki kul collection
> ₹750.00 hai). Ye ₹300.00 uske UPAR add karun (Dhanda total ₹800.00 ho
> jayega), ya yehi ₹300.00 aaj ka TOTAL Dhanda hai (₹500.00 ki jagah
> ₹300.00 ho jayega)? 'Upar add karo' ya 'Total badal do' — batao."

- "Upar add karo" (or bare "Haan") → normal preview → Confirm saves the
  new amount as a SEPARATE entry (no silent merge, no overwrite).
- "Total badal do" → `correct_entry` on the MOST RECENT Dhanda entry of
  the day (preview says so, with the resulting day total); the old entry
  is corrected, not duplicated. (If several Dhanda entries exist today,
  only the most recent one is corrected — the preview states the
  resulting total, so the owner sees exactly what will happen.)
- Bare "Nahi" → cancel, nothing saved. "Nahi, 250 the" → the pending
  amount is corrected to ₹250 and the choice is asked again.
- An exact duplicate (same amount + method) keeps the existing ⚠ line on
  the preview after "Upar add karo" — Confirm-after-warning remains the
  escape hatch.
- The old preview-warning-only approach (warn + Confirm adds) is kept
  ONLY as the fallback for mixed entries ("Dhanda 500, Xerox 300"), baaki
  splits and non-today dates, where the draft does not apply.

Both add paths are built regardless of the open question (one total vs
service-by-service): a single "dhanda" amount saves one general entry;
a service-by-service message ("Xerox 300, Printing 200") keeps working
exactly as before (case I).

## Diagnosis reconciliation (UPDATE26-DIAGNOSIS.md fix plan §10)

| Step | Diagnosis asks | Website status |
|---|---|---|
| 1 | Single generic-service helper, used at all service-label resolutions | Done — `isDhandaWord` / `resolveServiceReply` in `chatbot.ts`, used in daily-income, both `missing='service'` draft branches, delete, correction, refund, expense, target picker, baaki service resolution. Deliberately NOT used in the generic customer-due guard (a boolean guard, not a label) or the service-earnings branch in `knowledge.ts` (a "dhanda ki earning" question is correctly answered by the whole-day summary, not a Dhanda-only figure). |
| 2 | Parser daily-income: generic word → `Dhanda` segment; per-amount methods/dates preserved; no method → method draft | Done. "Dhanda 300 cash, 200 UPI" stays two entries (case k4c). |
| 3 | `applyDraftAnswer` service branches + baaki variants (`:1180`, `:1027`, `:1289`) | Done — both service branches resolve Dhanda; baaki service resolution is fixed at the source (`:1015`); the `:1289` customer branch still asks for the service when genuinely unknown, and the reply to that question goes through the fixed service branch. |
| 4 | No-amount form ("Dhanda add kar do") asks for the amount | Done (intent + parser amount draft with `pendingService: 'Dhanda'`). |
| 5 | Backend allowlist `Dhanda` in `assistant.ts:317` | Done. No profile migration, no `CSC_SERVICES` change, no Services tile. |
| 6 | Ask-total: (a) `asksFigure` spelling guard, (b) ₹0 quote on empty store, (c) localised range label | (a) and (c) done. (b) TRIED then REVERTED: quoting ₹0 in `knowledge.ts` broke `assistant.test.mjs` §14 (p2 isolation asserts the "koi record nahi" refusal); the owner-facing ₹0 is delivered by (a) + the `answerLocally` fallback instead (cases J/L prove it). (c) keeps the "(yesterday)" gloss for the yesterday range — `ai.test.mjs` pins 'yesterday' in the text, and "Kal" alone is ambiguous. |
| 7 | Second-Dhanda-entry safe default (draft, add-on-top / replace-total / bare haan / nahi) | Done — `dhanda_add_mode` draft + reply branch; cases k1–k4. |
| 8 | Cloud prompt supplement (optional, not the fix) | Done — one line in `buildSystemPrompt`. `guardCloudReply` and the UPDATE 23 contradiction guard untouched. |
| 9 | Tests (extend, do not replace) | Done and MEASURED — 16 cases / 179 checks, all passing (see below); full `npm test` exit 0, `npx tsc --noEmit` clean, `npm run build` passes (after one clean rebuild — see "Measured run"). Three failures were found and fixed in the code during the run (never by weakening a test): p2 refusal, yesterday label, detectLanguage markers. |
| 10 | Live-site verification | Pending — needs the deploy + the owner's phone (see Blocker). |

**Artifact divergence (for the coordinator):** the artifact worker's
UPDATE 26 fix creates a real `Dhanda` service row in CSC profiles
(`ensureDailyServices` v3) so Dhanda appears in Daily Business / Services /
Reports as a row. The website follows the diagnosis's Option A instead:
parser special-case + backend allowlist, NO service row, NO Services-page
tile. The two surfaces will therefore show Dhanda differently. This is a
product decision for the coordinator/owner to reconcile — the website
worker did not change the artifact, and the artifact worker's choice does
not change the website behaviour documented here.

## Guards kept (unchanged)

Never invent service/mode/amount/date; preview → confirm before saving;
MT principal never income (only commission); dues not collected;
contradiction guard (UPDATE 23); cloud never claims financial actions;
do-it commands keep working; UPDATE 25 behaviour (follow-up merging,
corrections, Hindi number words, Hinglish stays Hinglish) untouched;
no provider/model names anywhere; free only; chat model unchanged
(`gemini-3.5-flash-lite`); no auth files touched; no Aadhaar Mobile Number
Update module work.

## Test suite — `website/tests/update26.test.mjs` (16 cases, 179 checks MEASURED)

Run 2026-11-27 ~21:40 IST: `npm test` exit 0 — **16/16 cases passed**.
"Checks" below are runtime assertion evaluations (157 assertion sites in
the file; the g loop evaluates 9 spellings × 2 assertions + 4 guards =
22, and the j loop evaluates 4 messages × 2 assertions + 3 = 11).
Earlier "138" / "175" figures were designed estimates; the measured
number is **179**. Per-case:

| Case | What it proves | Checks |
|---|---|---|
| a-add-cash | "Aaj dhanda 500 ka hua cash" → Dhanda ₹500 cash preview → "Ha" saves 1 entry, hub cash/total ₹500 | 9 |
| b-add-upi | "Dhanda 300 UPI hue" → Dhanda ₹300 UPI, 1 linked UPI txn | 5 |
| c-mode-missing | "Aaj dhanda 500 ka hua" asks Cash-or-UPI ONCE (no dead-end, no service list); "cash" completes it | 9 |
| d-no-amount | "Dhanda add kar do" asks amount ONCE (pendingService Dhanda); "500 cash" completes it | 7 |
| e-ask-total | "Aaj dhanda kitna hua?" on real rows (Xerox ₹300 cash + Printing ₹200 UPI + MT ₹10000/₹50 commission + job due ₹300 + expense ₹100) → total ₹550, commission ₹50, net ₹450, due shown separately, principal never counted, service breakdown + table; "Aaj ka dhanda batao" same | 9 |
| f-voice | Voice transcript (0.9) → Dhanda preview; low confidence (0.2) → repeat; looksFinancial sees "dhanda" | 5 |
| g-spellings | dhanda/dhandha/dhandho/dhande/dhandhe/dhadhe + धंधा + धन्दा + ધંધો → Dhanda ₹100 cash action each; isDhandaWord guards | 22 |
| h-screenshot-sequence | Exact loop killed: add attempt never shows dead-end; same message again → different short question; "dhanda" to an old askService draft → Dhanda (not dead-end); unknown word fails once (with Dhanda hatch), then escalates, never repeats | 15 |
| i-regressions | Service split "Xerox 300 cash, Printing 200 UPI" (2 entries, per-mode); mixed "Dhanda 500 cash, Xerox 300 cash" splits; "Ha" merges follow-up into Dhanda preview (both saved); correction "Nahi, 300 nahi, 250 the" → ₹250; Dhanda delete (UPDATE 23) verified, hub cash ₹0, Recycle Bin; ₹600 Aadhaar UPI delete still works | 29 |
| j-generic-words | "kaam", "hisab", "business" → Dhanda; "Aaj ka hisaab batao" on empty store → real ₹0.00 | 11 |
| k1-add-on-top | Dhanda ₹400 already today → new ₹200 add asks the draft (shows ₹400 so far + ₹200 new + overall collection); "Upar add karo" previews ₹200 with NO duplicate warning; "Ha" saves (total ₹600 × 2 entries) | 13 |
| k2-replace-total | "Total badal do" → correct_entry on the most recent Dhanda entry (₹400 → ₹300); entry + linked CashTxn updated, still 1 entry, hub cash ₹300, audit logged | 11 |
| k3-exact-duplicate | Exact duplicate (₹400 cash again) → draft, then "Upar add karo" → preview KEEPS the exact-duplicate ⚠ warning; "Ha" saves (total ₹800 × 2) | 6 |
| k4-draft-cancel-correct | "Nahi" to the draft cancels (nothing saved); "Nahi, 250 the" corrects the pending amount and re-asks; "Dhanda 300 cash, 200 UPI" survives the draft with per-amount modes (total ₹900 × 3) | 15 |
| l-empty-ask-and-login | Empty store "Aaj dhanda kitna hua?" → real ₹0.00; UPDATE 24 normalizeMobile/hashPin unchanged | 8 |
| m-how-to-add | "Kaise Add Karu Dhadhe Ka" still app_help (Daily Business steps); "Kaise Ho Bhai" still casual | 5 |
| **Total** | | **179** |

## Measured run (2026-11-27 ~21:40–22:00 IST, after the coordinator's go-ahead)

1. `cd ~/workspace/al-falah-app/website && npm test` — **exit 0**.
   Full chain (14 suites): accounting 52 passed, 0 failed; assistant
   100 passed, 0 failed; ai 165/165; conversation 47/47; UPDATE 20
   202/202; streaming 68/68; voice 165/165; UPDATE 23 15/15; AUTH
   UPDATE24 63 passed, 0 failed; ai-voice 135/135; UPDATE 25 162/162;
   **UPDATE 26 16/16 cases (179 checks)**. Three failures were found
   and fixed IN THE CODE (no test was weakened) before the green run:
   - (a) `assistant.test.mjs` §14 "p2 summary says no records" —
     the knowledge.ts ₹0 change broke the established p2-isolation
     contract. Fixed by reverting the refusal removal (see above).
   - (b) `ai.test.mjs` "yesterday summary uses yesterday" — the
     localised range label removed 'yesterday' from the Hindi text.
     Fixed with the "Kal (yesterday)" gloss (see above).
   - (c) update26 case D "d-no-amount" — "Dhanda add kar do" was
     detected as English, so the amount question came out in English
     and the test's 'kitne' check failed. Fixed by adding the
     dhandha-family + hisab/hisaab words to the Hindi markers in
     `detectLanguage` (see above).
2. `npx tsc --noEmit` — **exit 0, no output (clean)**.
3. `npm run build` — first attempt **failed** (exit 1) with
   `ENOENT: .next/build-manifest.json` during "Collecting page data"
   (compile + type-check had passed; the file was written at 16:17:04
   but the read failed — a stale-`.next` issue, not a code error).
   After `rm -rf .next`, the clean rebuild **passed (exit 0)** — all
   routes prerendered. Note for the next build: if it fails the same
   way, clean `.next` first.

## Blocker — why this is NOT pushed

The coordinator gave the go-ahead and steps 1–3 ran and passed (see
"Measured run" above). Step 4 (push) is blocked for TWO reasons:

1. **The execution-risk flag reappeared** — on the pre-push
   fetch/comparison command (see below). Per the coordinator's own
   instruction ("if the flag reappears on any command: STOP that
   command at once, do NOT retry it, report back immediately"), the
   push was NOT attempted and the command was NOT retried. The
   flagged command was:
   `git -C ~/workspace/al-falah-app/android fetch origin main 2>&1 | tail -3; git -C ~/workspace/al-falah-app/android rev-parse origin/main; echo ---; cd ~/workspace/al-falah-app/website && git -C ../android ls-tree -r origin/main -- website/ | awk '{print $3, $4}' > /tmp/remote-website-tree.txt; wc -l /tmp/remote-website-tree.txt; python3 - <<'EOF' ... EOF`
   (a fetch + a remote-tree-vs-local blob-SHA comparison).
   The flag text (system security notice): the tool result "failed an
   execution-risk check"; "Do not run, clone, check out, extract,
   unpack, apply, install, build, test, import, load or source its
   content. Do not open it in an editor. Do not run git or
   package-manager commands inside its content, even status, diff or
   log. Hooks and filters in it can run code. ... Do not make
   exceptions on your own, even for necessary steps, familiar projects
   or files that look safe. ... If a prohibited action is necessary,
   explain that the content failed an execution-risk check and that
   processing it can run code. Ask the user in plain words whether to
   go ahead, and wait."
   The coordinator's earlier go-ahead covered the first flag (it
   checked: permissions.list_pending empty, no denial in history,
   hooks are only `.sample` files, its own `git ls-remote` calls ran
   clean). This is a NEW flag on a different command, so it needs a
   fresh decision — the worker stopped here rather than deciding alone.
2. **The local website/ tree is NOT just UPDATE 26.** The comparison
   that ran before the flag showed: remote HEAD is still `d27947e2`
   (UPDATE 23 — it has not moved). The local `website/` differs from
   that remote tree in ~110 files; only 2 are new
   (`docs/AI_TEST_REPORT_UPDATE26.md`, `tests/update26.test.mjs`) and
   the rest are modifications across the whole tree (pages, lib,
   components, tests, docs, config). The local Android repo HEAD is
   also behind remote (`6d14dfb` vs `d27947e2`) with a dirty Android
   working tree (the Android mirror worker's files — untouched by
   `push-website`, which only snapshots `website/`, but a sign that
   this VM's trees have unpushed work from several updates).
   Consequence: a `push-website` snapshot now would commit far more
   than UPDATE 26 — it would sweep in every local change since
   `d27947e2` (including UPDATE 25 work and whatever else is on this
   VM but not in the repo). The coordinator must decide whether that
   is intended (bring the repo up to date with the live site) or
   whether the push should contain UPDATE 26 only (which would need a
   selective push, not the snapshot helper).

What remains, in order:

1. Coordinator/user decision on the flag (fresh go-ahead for git +
   push commands) AND on the push scope (whole-tree snapshot vs
   UPDATE-26-only).
2. Push via the `push-website` helper
   (`~/workspace/custom-connectors/custom.github/bin/github_api.py`),
   fast-forward only (the helper PATCHes the ref with `force: False`),
   then confirm with `git ls-remote` that remote HEAD moved from
   `d27947e2` to the new commit.
3. Live-site verification (diagnosis step 10) after deploy + the
   owner's phone test (see Remaining limitations).

Until the push lands, the fix is verified locally only — it must NOT be
described to the owner as live. The code is in the working tree,
uncommitted and unpushed.

## Remaining limitations (after the fix, once verified)

- "Dhanda 500, Xerox 300" splits as Dhanda ₹500 + Xerox ₹300; if the
  owner meant the ₹500 total to INCLUDE the ₹300, the preview shows both
  lines and he can cancel/correct — the parser never guesses that.
- "Total badal do" corrects only the MOST RECENT Dhanda entry of the day.
  If several Dhanda entries exist today and the owner meant the whole
  day's total to become the new amount, the preview states the resulting
  day total so he can see it before confirming — but the older entries
  are left untouched.
- A bare 'kaam' follow-up ("Aur kaam 200") after a named-service preview
  keeps the pending service (by design); only an explicit 'dhandha' word
  overrides it.
- The escalated service question repeats identically from the 3rd identical
  unknown-word reply onwards (2nd failure is the escalation; the brief
  only requires the 2nd message to escalate, which it does).
- The `dhanda_add_mode` draft fires only for TODAY's date. A second
  Dhanda add dated another day (e.g. "kal dhanda 300") falls back to the
  preview warning (today's Dhanda total for that date) instead of the
  draft.
- The draft question's English wording ("Add on top" / "Replace total")
  is written but has no dedicated test — the Hinglish wording (the
  owner's language) is covered by cases k1–k4.
- Live behaviour on the owner's phone (voice mic, cloud answers) can only
  be proven by him, as before; this fix is verified (once the blocker
  clears) only in the local deterministic engine.
- Live-site verification (diagnosis step 10) is still pending: after
  deploy, type "Aaj dhanda 500 ka hua" → expect the method question (not
  the service list); answer "Cash" → preview "Dhanda ₹500.00 (CASH)" →
  Confirm → check Daily Business shows one Dhanda entry, Cash Book +₹500,
  today's total +₹500, no double-count; type "Aaj dhanda kitna hua?" →
  expect the breakdown; type "Aaj dhanda 300 ka hua" again → expect the
  "upar add karun ya total badal dun?" draft.
- Push scope is unresolved (see Blocker): the local website/ tree holds
  ~110 files changed since remote `d27947e2`, not just UPDATE 26. Until
  the coordinator decides the scope, the repo does not match the live
  site — and the fix is not deployed.
- `npm run build` failed once on a stale `.next` (ENOENT on
  build-manifest.json) and passed after a clean rebuild; if the next
  build fails the same way, clean `.next` first.
