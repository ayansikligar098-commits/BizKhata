# BizKhata AI — UPDATE 23 Test Report (AI Delete Bug)

Date: 2026-11-27. Scope: website only (`website/`). Live bug reported by the
owner 2026-11-27 16:02–16:04 IST; fix + tests + verification on this VM.

## The bug (as reported, verified in code before the fix)

1. 16:02 — "Aaj Aadhar Card Ka Biometric Ka Customer Aaya 600 Ka Payment
   Leke" → AI asked "Cash ya UPI?" → "Upi" → preview → confirm →
   "✓ Saved — Aadhaar Services ₹600.00 (UPI) — saved. ✓ Save verify ho
   gaya." The ADD flow worked.
2. 16:03 — "Isko Remove Kardo Me Bus Check Kar Rha Tha" → AI replied
   "Theek hai bhai, hata diya." FAKE SUCCESS — nothing was deleted
   (₹600 still in the records).
3. 16:03 — the AI then contradicted its own verified save: "Maine koi
   entry save hi nahi ki thi... ₹600 pehle se tha." False on both counts.
4. 16:04 — "Hatana Hai Mene Bus Test Karne Liye Bola Tha" → AI deflected
   to manual deletion ("main yahan se direct entry remove nahi kar
   sakta") — false, chat CAN delete.

Root cause (confirmed in code): the delete BACKEND worked
(`assistant.ts` `delete_entry` → Recycle Bin + audit + commit + verify;
`chatbot.tsx` renders the delete preview). The BUG was routing:
`chatbot.ts` gated delete on an amount in the SAME message
(`delete|hata|...` AND `amounts.length >= 1`). "Isko remove kardo" /
"Hatana hai" carry no amount, so the delete branch never fired, there
was NO "isko" resolution to the just-saved entry, and the message fell
through to the cloud model, which fabricated the deletion and invented
a false history.

## The fix

- **Context-aware delete** (`chatbot.ts`, `knowledge.ts`, `assistant.ts`,
  `chatbot.tsx`): the chat UI records the last verified save in the
  conversation context (`ctx.lastSavedEntry` — kind/id/label/amount/date,
  set ONLY after backend confirm + store verification, via the shared
  `savedEntryFor()` helper). "isko / ye / is entry ko / ye wali" + a
  delete word resolves to that entry, re-read from the store by id
  (`findAssistantTargetById()`); if it is already gone, the reply says
  so honestly (Recycle Bin) instead of claiming a second deletion.
  With no saved-entry context, "isko" falls back to the single most
  recent entry (`recentAssistantTargets()`), and the preview still
  shows its label — confirm or cancel. A verified delete clears the
  context. Deleted entries land in the Recycle Bin with an audit entry
  (backend behaviour, unchanged). The result card now says
  "✓ Deleted" (not "✓ Saved") with "✓ Delete verify ho gaya".
- **Bare delete** (`chatbot.ts`, `intent.ts`): "Hatana hai" /
  "delete kar do" (no amount, no "isko") never reach the cloud. The
  parser returns a clarification draft listing the recent candidates
  (last 2–3, newest first); with exactly one entry it offers that one
  in the preview. Draft answers accept a list number ("1") OR the
  amount/service ("Aadhaar 600 wali"). A service-only delete
  ("Xerox wali entry delete kar do", no amount) resolves by service
  (1 = preview, >1 = list, 0 = honest "koi entry nahi mili").
- **Delete is a first-class intent** (`intent.ts`): delete words route
  to `business_action` (structured parser) BEFORE casual/plan/navigation,
  with or without an amount. `isPlanOrStatement()` can no longer swallow
  a delete ("Kal wali entry delete karni hai" is a delete, not a plan).
  Delete words are matched as whole words (padded-space match, works
  for Devanagari too) — "Khata" never matches "hata", so
  "Customer Khata kholo" is still navigation. A how-to question
  ("Entry kaise delete karu?") is still app help, not a delete action.
- **Cloud never claims financial actions** (`conversation-ai.ts`):
  deterministic guard `guardCloudReply()` (exported, unit-tested):
  past-tense save/delete/correct/refund/payment claims are blocked and
  replaced with the honest limitation + the exact manual path
  (Daily Business / UPI Book → delete → Recycle Bin). The system prompt
  was strengthened with the same rules (never claim a save/delete;
  never contradict a verified save). The chat UI applies the guard to
  cloud-streamed replies at completion (`displayText` onDone) using the
  conversation's verified-save fact, and `cloudContextNote()` now
  carries that fact to the cloud. Financial safety is unchanged:
  delete still needs preview + confirmation; nothing is silently
  deleted on a bare "hata do".
- **Contradiction guard** (`conversation.ts`, `chatbot.tsx`): a question
  about a past save ("Maine kya save kiya tha?", "Entry save hui thi?")
  is answered from the verified save + the REAL store (still there /
  in the Recycle Bin / gone) — never from the general engine. With no
  save in the conversation it says so plainly. "How to save money?"
  is NOT hijacked (the trigger is questions about a past save only).
- **Kept intact**: add flow (ask mode → preview → confirm → save →
  verify), checklist offer + bare "Ha" acceptance, "Galat tha"
  correction, module-request behaviour, 30s timeout + local fallback +
  grey cloud note, model `gemini-3.5-flash-lite` (unchanged), no
  provider/model names in the UI, integer paise throughout.
  `functions/api/ai-chat.ts` was NOT touched.

## Files changed

- `website/src/lib/assistant.ts` — `findAssistantTargetById()`,
  `recentAssistantTargets()` (newest-first recent records).
- `website/src/lib/knowledge.ts` — `ChatContext.lastSavedEntry` /
  `lastVerifiedSave` + `LastSavedEntry` type.
- `website/src/lib/chatbot.ts` — delete routing rewrite (amount /
  service-only / "isko" / bare), `savedEntryFor()`,
  `hasDeleteWord()` / `hasDeletePronoun()` / `isDeleteRequest()`,
  draft-target picking by amount/service as well as number.
- `website/src/lib/intent.ts` — delete → `business_action` routing;
  plan guard exclusion for deletes.
- `website/src/lib/conversation-ai.ts` — `guardCloudReply()`,
  `claimsFinancialAction()`, `contradictsVerifiedSave()`; stronger
  system-prompt rules. Model unchanged.
- `website/src/lib/conversation.ts` — grounded answers to
  past-save questions (contradiction guard).
- `website/src/components/chatbot.tsx` — record/clear
  `lastSavedEntry` on verified save/delete; cloud guard on streamed
  replies; verified-save fact in `cloudContextNote()`; "✓ Deleted"
  result card.
- `website/tests/update23.test.mjs` — new acceptance suite (12 cases).
- `website/tests/update23-results.json` — results of the run below.
- `website/package.json` — `test` script now also runs
  `update23.test.mjs` (10 files).
- `website/docs/AI_TEST_REPORT_UPDATE23.md` — this file.

## UPDATE 23 acceptance results (`tests/update23.test.mjs`)

Harness: a `ChatSim` mirroring the chat UI flow (draft answers,
pending-preview confirm via "Ha", `lastSavedEntry` recorded only after
a verified save), driving the real `respondToMessage()` + parser +
`applyAssistantAction()` against the real store. 12/12 PASS (100%).

| Case | What was asserted | Result |
|---|---|---|
| a — exact 4pm sequence | Add Aadhaar ₹600 UPI (ask mode → preview → confirm → verified save, UPI ₹600) → "Isko remove kardo" → delete preview shows the ₹600 Aadhaar entry (same record id) → "Ha" → verified deleted, UPI back to ₹0, entry + linked txn gone, Recycle Bin has it, audit has the delete, context cleared | PASS |
| a2 — double "isko" | A second "Isko remove kardo" after the delete is an honest "already gone" (Recycle Bin), never a second fake success | PASS |
| b — bare delete | "Hatana hai" → clarification listing the recent candidates (Xerox + Printing), no success claim, handled locally (business_action, no cloud), state untouched; picking "1" + confirm deletes only that entry | PASS |
| c — amount form | "Aadhaar 600 wali entry delete kar do" still works end-to-end | PASS |
| d — same amount ×2 | "600 wali entry delete kar do" with two ₹600 entries → disambiguation list; picking "2" deletes only Printing, Xerox remains | PASS |
| e — non-existent | "Xerox 9999 wali entry delete kar do" → honest "koi entry nahi mili", nothing deleted | PASS |
| f — correction | "Xerox 300 galat tha, 250 hona chahiye" → correct_entry → ₹250 after confirm | PASS |
| g — no contradiction | After a verified save: "Maine kya save kiya tha?" is grounded in the save (₹600 Aadhaar); "Kaise ho bhai?" stays casual with no false record talk; with no save the same question says plainly none was saved | PASS |
| h — cloud guard | Guard driven directly with fabricated cloud texts: "hata diya" / "delete kar di hai" / "save ho gaya" / Devanagari "हटा दिया" → blocked (financial_claim); "koi entry save hi nahi ki thi... pehle se tha" with a verified save → blocked (contradiction), replacement names the saved entry + manual path; benign replies (greeting, "entry Daily Business mein dikh rahi hai", future "save hoga") pass through unchanged; system prompt forbids the claims and carries the verified-save fact; model still `gemini-3.5-flash-lite` | PASS |
| r1 — "Khata" ≠ "hata" | "Customer Khata kholo" is navigation to /customer-khata, not a delete | PASS |
| r2 — how-to | "Entry kaise delete karu?" is help, not a delete action, state untouched | PASS |
| r3 — keep what works | Add flow preview (Xerox ₹300 cash, nothing saved before confirm), plan → checklist offer → bare "Ha" accepts it, service-only delete previews | PASS |

## Full website suite (`npm test`, all green)

| Suite | Result |
|---|---|
| accounting | 52/52 |
| assistant | 100/100 |
| ai | 64/64 (100.0%) |
| language | 204/204 (100.0%) |
| conversation | 47/47 (100.0%) |
| update20 | 202/202 (100%) |
| update20-multiturn | 38/38 (100%) |
| streaming | 68/68 (100.0%) |
| voice | 168/168 |
| update23 (new) | 12/12 (100%) |
| **Total** | **955/955** |

- `npx tsc --noEmit`: clean (exit 0).
- `npm run build` (`next build`): passes (exit 0, static export).

Note: one streaming rerun during verification printed 62/68 while the
VM service restarted mid-run (the run was truncated, not a code
failure); clean reruns immediately before and after gave 68/68, and
the full `npm test` run passed end-to-end.

## Remaining limitations (for the live drive, not the code)

- The UI-side context recording (`confirmPreview` in `chatbot.tsx`)
  and the streamed-cloud guard replacement are exercised at lib level
  by the suite above; the live end-to-end sequence on
  bizkhata.pages.dev (same 4pm steps on the owner's phone, including
  the real cloud reply path with his key) is for the separate Playwright
  drive worker after this push — it was out of scope here.
- The cloud guard replaces a fabricated claim at stream completion:
  while a long cloud reply is still typing, a claim could be visible
  for a moment before the final text is replaced. The primary
  prevention is routing (delete messages never reach the cloud at all);
  the guard is the second layer, and the final message is always
  guarded.
- "Isko" with no conversation context falls back to the single most
  recent entry in the store; the preview always shows its label, so a
  wrong guess is caught at Confirm — but if the owner meant a
  different entry, he must cancel and name it.
- The owner's live ₹600 test entry is still in his records until he
  deletes it himself (this VM cannot touch his device's data). After
  this deploy, "Isko remove kardo" in that same chat, or "Aadhaar 600
  wali entry delete kar do", will preview it for confirmation.
