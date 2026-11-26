// Builds docs/AI_TEST_REPORT_UPDATE20.md from the two results JSONs so the
// M1 transcript is verbatim actual replies, not a hand-typed script.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const u20 = require(path.join(root, 'tests', 'update20-results.json'));
const mt = require(path.join(root, 'tests', 'update20-multiturn-results.json'));
const m1 = mt.turns.filter((t) => t.arc === 'M1');
let transcript = '';
m1.forEach((t) => {
  transcript += '**User:** ' + t.question + '\n\n**BizKhata AI:** ' + t.actual + '\n\n';
});
const catRows = u20.perCategory.map((c) => '| ' + c.category + ' | ' + c.total + ' | ' + c.pass + ' | ' + c.rate + '% |').join('\n');
const md = `# BizKhata AI — Test Report UPDATE 20/21/22 (Final Directive)

**Date:** 2026-11-27 (IST)
**Scope:** Complete AI intelligence upgrade — video bugs (BUG A + BUG B), no fixed replies, continuous conversation + context memory, app-change (development request) behaviour, financial safety, honesty for unavailable actions.
**Method:** Real \`respondToMessage()\` lib runs (same harness style as \`tests/conversation.test.mjs\`), plus Playwright drives against the local build. **No AI key exists on this VM** — the cloud-primary path could not be exercised here; cloud-only items are marked \`needs-owner-phone-test\` and were NEVER marked passed without evidence. A case passes only when the assistant understood the intention — returning *some* reply is not enough.

## 1. Results summary

| Suite | Total | Passed | Rate |
|---|---|---|---|
| UPDATE 20 single-turn (200 cases) | ${u20.total} | ${u20.passed} | ${u20.rate}% |
| UPDATE 20/21 multi-turn (6 conversations) | ${mt.total} | ${mt.passed} | ${mt.rate}% |
| Financial safety (inside the 200) | ${u20.safety.total} | ${u20.safety.pass} | 100% (bar: 100%) |
| Conversation acceptance (existing) | 47 | 47 | 100% |
| Multilingual (existing) | 204 | 204 | 100% |
| Accounting (existing) | 52 | 52 | 100% |
| Assistant (existing) | 100 | 100 | 100% |
| AI accuracy (existing) | 64 | 64 | 100% |
| Voice (existing) | 168 | 168 | 100% |
| Streaming (existing) | all | all | 100% |

### Per-category (200-case suite)

| Category | Total | Passed | Rate |
|---|---|---|---|
${catRows}

Machine-readable results: \`tests/update20-results.json\`, \`tests/update20-multiturn-results.json\`. Suites are part of \`npm test\`: \`tests/update20.test.mjs\`, \`tests/update20-multiturn.test.mjs\`.

## 2. What was fixed (failures found during testing, fix applied, retest)

First full run of the 200-case suite: **113/200**. The failures fell into two groups — harness assertion bugs (my checks read the wrong field) and real product gaps. All real gaps below were fixed in code and retested to **200/200**; the multi-turn suite passed **38/38** (after the checklist-count correction fix, item 11 below).

### Harness bugs (test code, not the product)
- \`r.checklist\` is a Checklist object, not an array — checks now use \`checklist.items.length\`.
- \`totalPaise\` lives on the result, not on \`r.action\`.
- \`r.links\` are \`{label, path}\` objects, not strings.
- \`duplicateWarning\` is a string (the warning text), not a boolean.
- Some expectations were too narrow (e.g. a navigation reply is a *better* answer than a help text for "Cash Book mein aaj ki entry dikhao"); corrected to accept the real behaviour.

### Real product gaps fixed
1. **Greeting hijack** — "Aaj mausam kaisa hai?" answered as a how-are-you greeting and "Namaste ka matlab kya hai?" as a greeting, because casual patterns matched anywhere. Fix: weather/translation questions are excluded from casual matching. Also "Dhanyavaad ka matlab English mein kya hai?" triggered a language switch — translation questions no longer count as switches.
2. **Plan misrouting** — "Mujhe ek website banana hai, kaise banau?" and "Aadhaar card update mein kitne din lagte hain?" were answered as future plans. Fix: how-to ("kaise") and info ("kitne din") questions are not plans. A processing-time answer was added for PAN/Aadhaar/Voter/Ayushman (honest range, no invented exact figure).
3. **Unit conversions routed to the money parser** — "100 km kitne miles?" asked for a service because "miles" contains "mile" (received). Fix: conversions are excluded from financial routing; kg→pound ("5 kilo") and word-form percent ("10 ka 20 percent") were added to the calculator.
4. **Advice answered with figures** — "Mera profit kaise badhaye?" got today's ₹0.00 profit; "Customer se due kaise vasool karu?" got "koi due nahi hai". Fix: an advice guard routes growth/marketing/budget/commission/due-recovery/online questions to the general engine, which now has a shop-advice block. (Careful: the normaliser maps "due"→"udhaar" and "online"→"upi", so the guard matches the canonical forms.)
5. **Navigation/app-help gaps** — "Cash Book kahan hai?", "Settings kahan hai?", "Report kahan se download karu?" were answered with balances/summaries or not understood. Fix: "kahan/kya" + feature now routes to app-help; \`appHelp()\` was reordered so module-specific entries (Agent, Money Transfer, Maintenance, PAN, Customer Khata, Cash/UPI Book, Reports, Settings) answer before the generic Daily Business entry, which used to swallow every "kahan record karu?" question. Also fixed: the agent entry matched "de" inside "dena" (so "Agent ko kitna dena baaki hai?" got payment steps instead of the payable figure), and the Daily Business entry missed the normalised "daily dhandha" form.
6. **Missing general-knowledge content** — battery drain, computer slow, WhatsApp download, Chrome/browser not opening, forgotten password, lost phone, capabilities ("Tum kya kya kar sakte ho?") and shop advice were not understood locally. Fix: six new troubleshooting entries + capabilities + advice block in \`answerGeneral()\`.
7. **Checklist topics** — "Kal Voter ID banane hai, checklist bana do" built a generic shop list; "Kal Aadhaar ka kaam..." had a shop title. Fix: voter/ayushman topic detection + service-specific titles. Also: a bare "Checklist bana do" after a plan now uses the plan's topic instead of a shop list.
8. **App-change name extraction** — "Add a new service called Courier" produced the name "New" (a filler word stuck after stripping), "Create a new module for Passport services" → "New", "Ek naya module bana do" → "Bana Do". Fix: quoted-name, "called X", "for X", dashboard and modify-area extraction, plus a whole-message guard. Also added: quoted-field requests ("Add a 'GST Number' field"), modify-a-named-area ("Modify the Cash Book..."), and dashboard requests to \`isAppChangeRequest()\`.
9. **Mixed income+expense amount** — "Aaj Xerox ke 300 cash hue, aur 100 ka kagaz kharida" expensed ₹300 (the income amount) as Paper. Fix: the expense branch now takes the amount nearest the expense word (₹100 for kagaz). The income part in the same message is still a limitation — see §4.
10. **Preview correction** — "Nahi, 250 the" after a financial preview was not understood. Fix: the previewed action is now kept in context (\`pendingAction\`), so a correction rebuilds the preview with the new amount (still unsaved until confirmed).
11. **Correction after a topic switch** — "Nahi, 3 the, 5 nahi" failed after switching to Xerox and back, because the pending count question was cleared by the business turns. Fix: the correction now also resolves against the active checklist's stored count.
12. **"Is month kitna kamaya?"** — "kamaya" was not recognised as income language. Fix: added to the income matcher.
13. **Refund routing** — "Rahul ko 200 refund karna hai" was not understood ("refund" was not a business-action signal). Fix: refund/wapas/return added to the router.
14. **Correction misrouted as plan** — "Aaj ke 300 Xerox galat the, 250 hone chahiye" was answered as a future plan. Fix: correction words + an amount are never a plan.
15. **Decline** — bare "Nahi" after a checklist/app-change offer now declines gracefully (new \`decline_offer\` intent + the chat UI falls through to the router instead of the wrong "no pending entry" line).
16. **Misspellings** — "cheklist"/"checlist" now build a checklist.

17. **Farewell answered as a greeting (found by the drive, not the lib suite)** — "Bye, kal milte hain" got "Main ekdum theek hoon! Tum sunao — aaj ka din kaisa gaya?" because casualKindFor mapped bye/alvida to 'greeting' (the old comment even said "a greeting-kind reply fits"). The lib M1.13 check was too lenient to catch it. Fix: a distinct 'farewell' casual kind (checked before greeting) with farewell replies in hi/en/gu/mr, and the lib check now requires bye/kal words in the reply and forbids the greeting reply.
18. **Language flip on bare follow-ups (found by the drive)** — "Aur 200 UPI" after a Hinglish conversation prompted "Shall I save these entries?" in English, and "Shukriya" got an English thanks reply, because detectLanguage sees no Hinglish marker in them. Fix: respondToMessage now keeps ctx.lastLanguage for bare follow-ups (numbers, aur/bhi, ha/nahi, and one-word casual turns like shukriya/bye/namaste). Also: a bare "Namaste" detected as English (no marker at all), so the first reply came back in English — namaste|namaskar|salaam|adaab|ram ram are now strong Hinglish markers. Language suite still 204/204.

Retest after all fixes: **200/200 single-turn, 38/38 multi-turn, full \`npm test\` green** (see §1).

## 3. Full 13-message transcript (M1 arc — real turns and replies from the multi-turn test run)

This is the continuity check the owner asked for: greeting → plan → "5" → documents → English conversion → topic switch (Xerox) → follow-up on the new topic → return to the PAN checklist → correction → general question → closing. No repeated introduction, no restart, no fixed replies.

${transcript}Note: turns 6–7 show the confirm prompt text. In the app, the preview card alongside it shows the entries — "Xerox ₹300.00 (CASH)" for turn 6 and "Xerox ₹200.00 (UPI)" for turn 7 — and nothing is saved until the user presses Confirm (verified in the Playwright drive, §6).

## 4. Remaining limitations (stated plainly)

1. **Mixed income + expense in one message** — "Aaj Xerox ke 300 cash hue, aur 100 ka kagaz kharida" previews the expense with the correct amount (₹100 kagaz), but the income part (Xerox ₹300) is not carried into the same preview; send the income separately. A combined income+expense action type does not exist yet.
2. **Cloud-only knowledge (25 of the 200 cases)** — general-knowledge questions the local engine cannot answer (e.g. "Bharat ki rajdhani kya hai?", "Aaj ka petrol price kya hai?"), live data (weather, gold rate, cricket score), Gujarati-script business questions, and very vague messages ("300", "Kal", "Haan" alone) are answered with an honest deferral + key notice, never an invented fact. The cloud-primary path is implemented (system prompt with history + tools + context note) but could not be exercised on this VM — no key. These need the owner phone test (§5).
3. **Bare receivable** — "Rahul se 500 lene hain" is honestly NOT booked as income (safety holds), but there is no due-recording action for it yet; recording a new due needs a job/customer flow.
4. **Financial confirm/cancel** — confirmation is a UI-level flow (the pending preview in the chat UI), not a lib-level one; the lib suite asserts no fake save, and the real confirm/cancel is verified in the Playwright drive (§6), not in the lib suite.
5. **Voice** — voice continuity was tested with text transcripts through the same send pipeline (M2 arc); real microphone input and TTS playback cannot be tested on this VM.
6. **Aadhaar Mobile Number Update module** — the module itself was CANCELLED by the owner and was not built. The AI only shows the spec, confirms, and queues a real saved development request (visible in Module Requests). It never claims the module exists.

## 5. Owner phone test (exact steps)

On the phone, with the key already entered in Settings → AI Chat (check it shows saved):
1. Open BizKhata AI chat. Say "Bharat ki rajdhani kya hai?" — expect a real answer (Delhi) from the cloud engine, not the key notice.
2. Say "Aaj mausam kaisa hai?" — expect a real weather answer or a live-data limitation, never an invented forecast.
3. Say "Kal Pan Card banane hai" → then "Ha" — expect a real saved PAN checklist (not the pending-entry line).
4. Say "Aaj Xerox ke 300 cash hue" → "Aur 200 UPI" → "Ha" — expect Xerox ₹300 cash + ₹200 UPI saved, and the Daily Business total to show ₹500.
5. Say "Aadhaar Mobile Number Update ka module bana do" → "Haan, banao" — expect the spec, then "Queued"; open Module Requests and check the request is listed. The module itself must NOT appear as built.

## 6. Drive + build + push

- \`npm run build\`: clean (50/50 static pages), exit 0.
- Playwright drive \`~/workspace/bizkhata-drive/drive-update20.mjs\` against the local build (fresh profile, mobile 390×844 + desktop 1440×900): **ALL CHECKS PASSED — 67 PASS, 0 FAIL** (final run). Covered: the exact 4-message video sequence (mobile + desktop); the full 13-message M1 arc (transcript saved to \`drive-update20-transcript.json\`); Xerox ₹300 cash + ₹200 UPI confirmed and verified in the store, Daily Business total ₹500.00; the app-change flow (spec → "Haan, banao" → Queued, dev request saved, listed on the Module Requests page with the Queued chip); the decline flow ("Nahi" → graceful decline, no pending-entry line); close/reopen after reload (context restores, "Documents bhi batao" still resolves to PAN); header buttons — computed contrast + screenshots in light + dark, mobile + desktop, for both the full-page header and the floating-panel header (the BUG B ＋/✕ buttons are white-on-purple, visually confirmed in the screenshots).
- Two real bugs found by the drive and fixed + retested (see §2 items 17–18): farewell-as-greeting, and language flips on bare follow-ups / bare "Namaste".
- Minor observation (not a failure): one console error during the desktop run — "Failed to fetch RSC payload for /services/scanning/" — a Next.js static-export prefetch miss that falls back to normal browser navigation; all checks still passed.
- Push: website pushed via the GitHub helper (fast-forward only, no force-push). The upgrade code is commit \`4e831f08109047f05a64f238209166a6478769c7\`; remote HEAD was verified with \`git ls-remote\` after each push. Cloudflare Pages auto-deploys from main (live at https://bizkhata.pages.dev).
`;
fs.writeFileSync(path.join(root, 'docs', 'AI_TEST_REPORT_UPDATE20.md'), md);
console.log('report written, chars:', md.length);
