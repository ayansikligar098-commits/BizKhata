/**
 * BizKhata AI comprehension acceptance suite — UPDATE 25.
 *
 * The 24 cases from UPDATE25-DIAGNOSIS.md §E.2, each with its
 * expected intent / reply language / action, driven through the REAL
 * respondToMessage() / parseAssistantMessage() / applyAssistantAction()
 * with a threaded ChatContext — the same harness style as
 * tests/update20-multiturn.test.mjs. Money is integer paise
 * (₹300 = 30000). The store starts empty unless a case says otherwise.
 *
 * CASE 9 NOTE — task-brief override: the diagnosis (§E.2 case 9,
 * ranked fix D-5) asked for an honest REFUSAL of the "Aadhaar Mobile
 * Number Update" module request. The task brief OVERRIDES that: do NOT
 * add a blanket blocklist; KEEP the accepted UPDATE 20 behaviour for
 * an EXPLICIT request (spec → confirm → queue as a real saved dev
 * request, never claim built). Only the PROACTIVE suggestion in
 * general.ts was removed. Case 9 below asserts the override
 * behaviour, and the conflict is recorded in AI_TEST_REPORT_UPDATE25.md.
 *
 * Run with `npm test`. Requires no key and no network.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-u25-test';
execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/dev-requests.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);
const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const cai = require(path.join(outDir, 'conversation-ai.js'));
const dev = require(path.join(outDir, 'dev-requests.js'));
const lang = require(path.join(outDir, 'languages.js'));

function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const TODAY = localISO(new Date());
const YESTERDAY = localISO(new Date(Date.now() - 86400000));
const DAY_BEFORE = localISO(new Date(Date.now() - 2 * 86400000));

let seq = 0;
function profile(id, name) {
  return {
    id, name, category: 'Cyber Cafe / CSC Center',
    services: ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [], expenseCategories: ['Machine Repair', 'Electricity', 'Internet', 'Paper', 'Ink', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: '', mobile: '', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light',
    createdAt: TODAY, aiLanguage: 'auto',
  };
}
function emptyState() {
  const id = `u25-${++seq}`;
  const p1 = profile(id, 'Al Falah Communication');
  return {
    state: {
      owner: null, profiles: [p1], activeProfileId: id, jobs: [], dailyEntries: [],
      cashTxns: [], mtFunds: [], mtTransfers: [], mtExpenses: [], customers: [],
      docs: [], agents: [{ id: 'agt1', profileId: id, name: 'Ramesh Bhai', mobile: '9876500010', type: 'Aadhaar Backend Agent', status: 'Active', notes: '' }], expenses: [], equipment: [], receipts: [], audit: [],
      recycle: [], executedActionKeys: [],
    }, p1,
  };
}

const results = {};
let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  results._cur = results._cur || { pass: 0, total: 0 };
  results._cur.total++;
  if (ok) results._cur.pass++;
  else { failures++; console.log(`  FAIL ${name} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
  return ok;
}
function section(name) {
  results._cur = { pass: 0, total: 0 };
  results[name] = results._cur;
  console.log(`\n--- ${name} ---`);
}
function has(t, ...needles) { return needles.some((n) => String(t || '').includes(n)); }
function hasNone(t, ...needles) { return !needles.some((n) => String(t || '').includes(n)); }

/** One conversation: threaded ctx, exactly as the chat UI chains it. */
function convo(state, p1) {
  let ctx = {};
  const send = (q) => {
    const r = conv.respondToMessage({ message: q, state, profile: p1, ctx });
    ctx = r.newCtx;
    return r;
  };
  return { send, getCtx: () => ctx };
}

console.log('BizKhata AI comprehension — UPDATE 25 (diagnosis §E.2, 24 cases):');

/* ================= Case 1 — local GK (C-9) ================= */
section('case 1 — "Bharat ki rajdhani kya hai?" (C-9 local GK)');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Bharat ki rajdhani kya hai?');
  check('intent general', r.intent, 'general');
  check('answered locally: New Delhi', has(r.text, 'New Delhi'), true);
  check('no key notice needed for a GK answer', hasNone(r.text, 'key', 'Settings'), true);
  check('not a not-understood', hasNone(r.text, 'samajh nahi'), true);
}

/* ================= Case 2 — plan arc (regression) ================= */
section('case 2 — plan → Ha → 5 → correction (regression guard)');
{
  const { state, p1 } = emptyState();
  const { send, getCtx } = convo(state, p1);
  const r1 = send('Kal Pan Card banane hai');
  check('plan intent', r1.intent, 'plan');
  check('plan offers a checklist', has(r1.text, 'checklist'), true);
  check('plan asks the count', getCtx().pendingQuestion?.kind, 'count');
  const r2 = send('Ha');
  check('Ha accepts the offer', r2.intent, 'accept_offer');
  check('Ha builds a real checklist', r2.kind, 'checklist');
  check('checklist has ≥4 items', (r2.checklist?.items || []).length >= 4, true);
  const r3 = send('5');
  check('5 is the count', r3.intent, 'followup_count');
  check('checklist for 5 applications', has(r3.text, '5'), true);
  const r4 = send('Nahi, 3 the, 5 nahi');
  check('correction keeps the count at 3', has(r4.text, '3'), true);
  check('correction does not keep 5 as the count', hasNone(r4.text, '5 applications'), true);
}

/* ================= Case 3 — C-1 preview merge ================= */
section('case 3 — C-1: follow-up merges into the pending preview');
{
  const { state, p1 } = emptyState();
  const { send, getCtx } = convo(state, p1);
  const r1 = send('Aaj Xerox ke 300 cash hue');
  check('turn 1 is an action preview', r1.kind, 'action');
  check('turn 1 preview has ₹300 cash', r1.action.entries.length === 1 && r1.action.entries[0].amountPaise === 30000 && r1.action.entries[0].method === 'cash', true);
  check('nothing saved yet', state.dailyEntries.length, 0);
  const r2 = send('Aur 200 UPI');
  check('turn 2 is still one preview (merged, not replaced)', r2.kind, 'action');
  check('merged preview has BOTH entries', r2.action.entries.length, 2);
  check('merged entry 1: Xerox ₹300 cash', r2.action.entries[0].service === 'Xerox' && r2.action.entries[0].amountPaise === 30000 && r2.action.entries[0].method === 'cash', true);
  check('merged entry 2: Xerox ₹200 UPI', r2.action.entries[1].service === 'Xerox' && r2.action.entries[1].amountPaise === 20000 && r2.action.entries[1].method === 'upi', true);
  check('merged total ₹500', r2.totalPaise, 50000);
  check('merged preview shows 2 lines', (r2.previewLines || []).length, 2);
  // "Ha": the UI's confirm gate (parseAssistantMessage) confirms the
  // merged preview; Confirm then saves BOTH entries.
  const gate = chat.parseAssistantMessage('Ha', state, p1, getCtx());
  check('"Ha" is a confirm, not a new message', gate.kind, 'confirm');
  const saved = asst.applyAssistantAction(state, p1.id, getCtx().pendingAction, 'u25-c1');
  check('Confirm saves both', saved.ok, true);
  check('store has 2 entries', state.dailyEntries.length, 2);
  check('cash ₹300 in store', state.dailyEntries.some((e) => e.totalPaise === 30000 && e.method === 'cash'), true);
  check('UPI ₹200 in store', state.dailyEntries.some((e) => e.totalPaise === 20000 && e.method === 'upi'), true);
}

/* ================= Case 4 — C-2 yes+entry ================= */
section('case 4 — C-2: "Haan, aur Xerox 300 cash hue"');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Haan, aur Xerox 300 cash hue');
  check('routes to an action preview', r.kind, 'action');
  check('preview is Xerox ₹300 cash', r.action.entries[0].service === 'Xerox' && r.action.entries[0].amountPaise === 30000 && r.action.entries[0].method === 'cash', true);
  check('not the "kis liye haan" dead end', hasNone(r.text, 'kis liye haan'), true);
  check('not a balance answer', hasNone(r.text, 'Balance'), true);
  const direct = chat.parseAssistantMessage('Haan, aur Xerox 300 cash hue', state, p1, {});
  check('parser alone also returns the action (not confirm)', direct.kind, 'action');
}

/* ================= Case 5 — C-3 correction ================= */
section('case 5 — C-3: "nahi, 500 nahi 600 tha" → ₹600');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  send('Aaj Xerox ke 300 cash hue');
  const r = send('nahi, 500 nahi 600 tha');
  check('correction intent', r.intent, 'followup_correct');
  check('corrected preview is ₹600 (not ₹500)', r.action.entries[0].amountPaise, 60000);
  check('still Xerox cash', r.action.entries[0].service === 'Xerox' && r.action.entries[0].method === 'cash', true);
  check('still unsaved until Confirm', state.dailyEntries.length, 0);
}

/* ================= Case 6 — C-4 number words ================= */
section('case 6 — C-4: number words reach the router');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r1 = send('do sau Xerox cash hue');
  check('"do sau" → action preview', r1.kind, 'action');
  check('"do sau" → ₹200 cash', r1.action.entries[0].amountPaise === 20000 && r1.action.entries[0].method === 'cash', true);
  const r2 = send('paanch sau printing UPI hue');
  check('"paanch sau" → action preview', r2.kind, 'action');
  check('"paanch sau" → ₹500 UPI', r2.action.entries[0].amountPaise === 50000 && r2.action.entries[0].method === 'upi', true);
  check('"paanch sau" service Printing', r2.action.entries[0].service, 'Printing');
}

/* ================= Cases 7–8 — C-5 greeting hijack ================= */
section('cases 7–8 — C-5: greeting + question answers the question');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r1 = send('Aaj su chale chhe, ketlo profit thayo?');
  check('Gujarati profit question is business_query', r1.intent, 'business_query');
  check('profit figure answered (₹0.00 on empty store)', has(r1.text, '₹0.00'), true);
  check('no greeting-only reply', hasNone(r1.text, 'majama'), true);
  check('reply stays Gujarati', has(r1.text, 'chhe'), true);
  const r2 = send('Kaise ho bhai, aaj ka profit kitna hua?');
  check('Hinglish greeting+question is business_query', r2.intent, 'business_query');
  check('profit figure answered', has(r2.text, '₹0.00'), true);
}

/* ================= Case 9 — C-6 OVERRIDE ================= */
section('case 9 — C-6 OVERRIDE: explicit module request queues (UPDATE 20)');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r1 = send('Aadhaar Mobile Number Update ka module bana do');
  check('explicit request is app_change (not refused)', r1.intent, 'app_change');
  check('spec shown, NOT claimed built', has(r1.text, 'Aadhaar Mobile Number Update') && hasNone(r1.text, 'ban gaya', 'taiyaar hai'), true);
  check('says NOT built yet', /NOT built yet|bana NAHI/i.test(r1.text), true);
  const r2 = send('Haan, banao');
  check('confirm queues the request', r2.intent, 'accept_offer');
  const list = dev.listDevRequests(p1.id);
  check('one dev request queued', list.length, 1);
  check('queued request is the module', /Aadhaar Mobile Number Update/.test(list[0].name), true);
  check('queued status', list[0].status, 'queued');
  // The proactive suggestion is gone from the UIDAI answer.
  const r3 = send('Aadhaar card mein mobile number kaise update karein?');
  check('UIDAI answer never suggests saying the module phrase', hasNone(r3.text, 'Aadhaar Mobile Number Update ka module bana do'), true);
  const generalSrc = fs.readFileSync(path.join(root, 'src/lib/general.ts'), 'utf8');
  check('no file anywhere suggests the module phrase', !generalSrc.includes('Aadhaar Mobile Number Update ka module bana do'), true);
}

/* ================= Case 10 — C-7 key status ================= */
section('case 10 — C-7: "Mene Key Dal Di Starting Me" (both key states)');
{
  cai.clearAiServiceKey();
  check('key slot empty at start', cai.hasAiServiceKey(), false);
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r1 = send('Mene Key Dal Di Starting Me');
  check('key-status intent', r1.intent, 'key_status');
  check('no key → honest not-saved answer', has(r1.text, 'Key save nahi dikh rahi'), true);
  check('no key → no notUnderstood', hasNone(r1.text, 'samajh nahi'), true);
  check('no key → no "enter a key" lecture', hasNone(r1.text, 'add a key'), true);
  cai.setAiServiceKey('test-key-not-real');
  check('key slot now saved', cai.hasAiServiceKey(), true);
  const r2 = send('Mene Key Dal Di Starting Me');
  check('key saved → honest saved answer', has(r2.text, 'key save hai'), true);
  check('key never shown in the reply', hasNone(r2.text, 'test-key-not-real'), true);
  cai.clearAiServiceKey();
  check('key cleared after test', cai.hasAiServiceKey(), false);
}

/* ================= Case 11 — C-8 how-to-add ================= */
section('case 11 — C-8: "Kaise Add Karu Dhadhe Ka"');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Batana Nahi Hai Kaise Add Karu Dhadhe Ka');
  check('routes to app_help', r.intent, 'app_help');
  check('Daily Business steps given', has(r.text, 'Daily Business'), true);
  check('opens Daily Business', (r.links || []).some((l) => l.path === '/daily-business'), true);
  check('reply is Hinglish', has(r.text, 'karo') || has(r.text, 'kholo'), true);
  check('not a not-understood', hasNone(r.text, 'samajh nahi'), true);
}

/* ================= Case 12 — C-10 internal transfer ================= */
section('case 12 — C-10: "cash se UPI kar do" is a transfer');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r1 = send('1000 cash se UPI kar do');
  check('cash→UPI is an action', r1.kind, 'action');
  check('action is internal_transfer', r1.action.kind, 'internal_transfer');
  check('from cash to UPI', r1.action.from === 'cash' && r1.action.to === 'upi', true);
  check('amount ₹1000', r1.action.amountPaise, 100000);
  check('says it is NOT income/expense', has(r1.text, 'income') || has((r1.previewLines || []).join(' '), 'NAHI hai'), true);
  const r2 = send('500 UPI se cash kar do');
  check('UPI→cash is an action', r2.kind, 'action');
  check('from UPI to cash', r2.action.from === 'upi' && r2.action.to === 'cash', true);
  check('reverse amount ₹500', r2.action.amountPaise, 50000);
  // And a plain two-collection message is NOT a transfer.
  const r3 = send('Xerox 300 cash, 200 UPI');
  check('plain "300 cash, 200 UPI" stays daily income', r3.action.kind, 'daily_income');
}

/* ================= Case 13 — C-11 multi-date ================= */
section('case 13 — C-11: "150 hue, aur kal ke 200" keeps both');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Aaj printing ke 150 hue, aur kal ke 200 bhi add kar do');
  check('asks the missing method (draft)', !!r.draftQuestion, true);
  const pending = (r.draft?.partial?.pendingEntries || []);
  check('draft keeps BOTH entries', pending.length, 2);
  check('entry 1: ₹150 today', pending[0]?.amountPaise === 15000 && pending[0]?.date === TODAY, true);
  check('entry 2: ₹200 yesterday', pending[1]?.amountPaise === 20000 && pending[1]?.date === YESTERDAY, true);
  check('both are Printing', pending.every((e) => e.service === 'Printing'), true);
  const done = chat.applyDraftAnswer(r.draft, 'cash', state, p1, {});
  check('answering the method completes to an action', done.kind, 'action');
  check('action still has both entries', done.action.entries.length, 2);
  check('action entry dates preserved', done.action.entries[0].date === TODAY && done.action.entries[1].date === YESTERDAY, true);
  check('both entries cash', done.action.entries.every((e) => e.method === 'cash'), true);
}

/* ================= Case 14 — C-12 baaki due ================= */
section('case 14 — C-12: "200 diye, baaki 300 udhaar"');
{
  // (a) With Ramesh in the store + a ₹500 due job: payment against
  //     the job, due falls to the stated ₹300.
  {
    const { state, p1 } = emptyState();
    state.customers.push({ id: 'c-ramesh', profileId: p1.id, name: 'Ramesh', mobile: '9876500011', createdAt: TODAY });
    state.jobs.push({ id: 'j-ramesh', profileId: p1.id, customerName: 'Ramesh', service: 'PAN Card', date: TODAY, totalPaise: 50000, receivedPaise: 0, status: 'New', createdAt: TODAY });
    const { send } = convo(state, p1);
    const r = send('Customer Ramesh ne 200 diye, baaki 300 udhaar');
    check('with Ramesh: an action (not a draft)', r.kind, 'action');
    check('payment against the due job', r.action.kind, 'customer_payment');
    check('received ₹200', r.action.amountPaise, 20000);
    check('preview shows due falling to ₹300', has((r.previewLines || []).join(' '), 'se ₹300.00 reh jayega'), true);
    check('preview keeps the ₹300 due (baaki), not a new due', has((r.previewLines || []).join(' '), 'baaki ₹300.00 udhaar'), true);
  }
  // (b) Without Ramesh: draft asks for the customer AND confirms
  //     the due — the ₹300 is never silently dropped.
  {
    const { state, p1 } = emptyState();
    const { send } = convo(state, p1);
    const r = send('Customer Ramesh ne 200 diye, baaki 300 udhaar');
    check('without Ramesh: asks for the customer (draft)', !!r.draftQuestion, true);
    check('draft mentions ₹200 received', has(r.draftQuestion, '₹200.00'), true);
    check('draft mentions ₹300 due', has(r.draftQuestion, '₹300.00'), true);
    check('draft carries the split (received)', r.draft?.partial?.baakiReceived, 20000);
    check('draft carries the split (due)', r.draft?.partial?.baakiDue, 30000);
    // Answering the customer keeps the split: service is asked next
    // (no job yet), and the split still rides along.
    const next = chat.applyDraftAnswer(r.draft, 'Ramesh', state, p1, {});
    check('after naming the customer: asks the service next', next.kind, 'draft');
    check('split survives the customer answer', next.draft?.partial?.baakiReceived === 20000 && next.draft?.partial?.baakiDue === 30000, true);
  }
}

/* ================= Case 15 — C-14 PAN explainer ================= */
section('case 15 — C-14: "PAN card ke baare mein samjhao" stays Hinglish');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('PAN card ke baare mein samjhao');
  check('explainer intent (general)', r.intent, 'general');
  check('reply is Hinglish (has "hai")', has(r.text, 'hai'), true);
  check('reply is NOT English', hasNone(r.text, 'A PAN card is', 'PAN card is a'), true);
  check('explains PAN', has(r.text, 'PAN'), true);
}

/* ================= Case 16 — C-14 MT confirm prompt ================= */
section('case 16 — C-14: MT transfer confirm prompt in Hinglish');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Rahul ko 10000 transfer kiya commission 50 mila');
  check('MT transfer action', r.action?.kind, 'mt_transfer');
  check('principal ₹10000', r.action?.amountPaise, 1000000);
  check('commission ₹50', r.action?.commissionPaise, 5000);
  check('confirm prompt is Hinglish', has(r.text, 'Confirm dabao'), true);
  check('confirm prompt is NOT English', hasNone(r.text, 'Shall I save'), true);
}

/* ================= Case 17 — C-13 translate-this ================= */
section('case 17 — C-13: "Aur English mein likho" translates, no switch');
{
  const { state, p1 } = emptyState();
  const lastBot = 'Aaj ka total ₹500 hai, UPI se ₹300 aaye.';
  const r = conv.respondToMessage({
    message: 'Aur English mein likho', state, profile: p1,
    ctx: { lastBotText: lastBot, lastLanguage: 'hi' },
  });
  check('translate-this intent', r.intent, 'translate_reply');
  check('last reply is carried over', has(r.text, lastBot), true);
  check('honest note: translation needs the key', has(r.text, 'AI chat'), true);
  check('cloud does the real translation when a key exists', r.cloudNeeded, true);
  check('no languageChanged flag', r.languageChanged, undefined);
  check('profile aiLanguage unchanged (still auto)', p1.aiLanguage, 'auto');
  // And with an active checklist, the SAME words still translate the
  // checklist (old behaviour preserved).
  const { send } = convo(state, p1);
  send('Kal Pan Card banane hai');
  send('Ha');
  const r2 = send('Aur English mein likho');
  check('with a checklist: translates the checklist', r2.intent, 'checklist_translate');
  check('checklist still English-titled', has(r2.checklist?.title || '', 'checklist'), true);
}

/* ================= Case 18 — MT fund ================= */
section('case 18 — MT fund is fund, never income');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Bhai se 5000 fund aaya UPI se');
  check('MT fund action', r.action?.kind, 'mt_fund');
  check('fund ₹5000', r.action?.amountPaise, 500000);
  check('preview says fund, not income', has((r.previewLines || []).join(' '), 'fund') && has((r.previewLines || []).join(' '), 'income nahi'), true);
}

/* ================= Case 19 — two-amount single message ================= */
section('case 19 — two amounts, one message, one preview');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Aaj Xerox ke 300 cash hue, UPI se 200 aaye');
  check('single preview', r.kind, 'action');
  check('both entries in it', r.action.entries.length, 2);
  check('₹300 cash + ₹200 UPI', r.action.entries[0].amountPaise === 30000 && r.action.entries[1].amountPaise === 20000, true);
}

/* ================= Case 20 — today only ================= */
section('case 20 — "Aaj ka hisab batao, kal ka nahi"');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Aaj ka hisab batao, kal ka nahi');
  check('business query', r.intent, 'business_query');
  check("today's figures (₹0.00 on empty store)", has(r.text, '₹0.00'), true);
}

/* ================= Case 21 — regression guards ================= */
section('case 21 — regression guards (joke / advice / net / navigation)');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const joke = send('Mujhe ek joke sunao');
  check('joke routes to general', joke.intent, 'general');
  check('joke actually told', joke.text.length > 20, true);
  const advice = send('Mera profit kaise badhaye?');
  check('advice routes to general', advice.intent, 'general');
  const net = send('Internet nahi chal raha');
  check('troubleshooting routes to general', net.intent, 'general');
  const nav = send('Cash book kholo');
  check('navigation intent', nav.intent, 'navigation');
  check('navigates to /cash-book', nav.navigateTo, '/cash-book');
}

/* ================= Case 22 — language stickiness ================= */
section('case 22 — language stickiness (Hinglish + Gujarati)');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  send('Aaj Xerox ke 300 cash hue');
  const thx = send('Shukriya');
  check('"Shukriya" stays casual Hinglish', thx.intent, 'casual');
  check('"Shukriya" reply is Hinglish', lang.detectLanguage(thx.text).code, 'hi');
  const bye = send('Bye');
  check('"Bye" stays casual', bye.intent, 'casual');
  check('"Bye" reply is Hinglish, not English', lang.detectLanguage(bye.text).code, 'hi');
  const { state: s2, p1: p2 } = emptyState();
  const g = convo(s2, p2);
  const g1 = g.send('Aaje su chale chhe?');
  check('Gujarati greeting stays Gujarati', lang.detectLanguage(g1.text).code, 'gu');
  const g2 = g.send('Aaj no total hisab batavo.');
  check('Gujarati summary stays Gujarati', g2.intent, 'business_query');
  check('Gujarati summary has the figure', has(g2.text, '₹0.00'), true);
}

/* ================= Case 23 — C-15 cloud language check ================= */
section('case 23 — C-15: cloud reply language check');
{
  check('English cloud reply to Hinglish convo → mismatch', cai.cloudReplyMatchesLanguage('The total profit today is ₹500. You should save more.', 'hi'), false);
  check('Hinglish cloud reply to Hinglish convo → ok', cai.cloudReplyMatchesLanguage('Aaj ka profit ₹500 hai, bhai. Bahut badhiya chal raha hai.', 'hi'), true);
  check('Gujarati cloud reply to Gujarati convo → ok', cai.cloudReplyMatchesLanguage('Aaje no nafo ₹500 chhe, bhai.', 'gu'), true);
  check('English cloud reply to Gujarati convo → mismatch', cai.cloudReplyMatchesLanguage('The total profit today is ₹500.', 'gu'), false);
  check('short/uncertain reply passes (never blocks a real answer)', cai.cloudReplyMatchesLanguage('Hi bhai!', 'hi'), true);
  check('empty reply passes', cai.cloudReplyMatchesLanguage('', 'hi'), true);
  check('Marathi-mixed reply to Hinglish convo → mismatch', cai.cloudReplyMatchesLanguage('Tumcha aajcha profit ₹500 aahe.', 'hi'), false);
}

/* ================= Case 24 — C-18 ordinal delete ================= */
section('case 24 — C-18: ordinal delete on a populated store');
{
  const { state, p1 } = emptyState();
  // Three saved entries, distinct dates so recency is deterministic:
  // most recent = Xerox ₹100 today, 2nd = Printing ₹200 yesterday,
  // 3rd = PAN Card ₹300 the day before.
  const mk = (pid, id, date, service, total) => ({ id, profileId: pid, date, service, totalPaise: total, method: 'cash', customerName: '', createdAt: date });
  state.dailyEntries.push(mk(p1.id, 'e1', DAY_BEFORE, 'PAN Card', 30000));
  state.dailyEntries.push(mk(p1.id, 'e2', YESTERDAY, 'Printing', 20000));
  state.dailyEntries.push(mk(p1.id, 'e3', TODAY, 'Xerox', 10000));
  const del2 = chat.parseAssistantMessage('Dusra wala delete kar do', state, p1, {});
  check('"Dusra wala" resolves to an action', del2.kind, 'action');
  check('"Dusra wala" is the 2nd most recent (Printing ₹200)', del2.action?.kind === 'delete_entry' && del2.action.targetId === 'e2', true);
  const del1 = chat.parseAssistantMessage('Pehli wali entry hata do', state, p1, {});
  check('"Pehli wali" is the most recent (Xerox ₹100)', del1.action?.kind === 'delete_entry' && del1.action.targetId === 'e3', true);
  const del3 = chat.parseAssistantMessage('Teesra wala delete kar do', state, p1, {});
  check('"Teesra wala" is the 3rd (PAN Card ₹300)', del3.action?.kind === 'delete_entry' && del3.action.targetId === 'e1', true);
  // Executing the 2nd-entry delete really removes it (Recycle Bin).
  const exec = asst.applyAssistantAction(state, p1.id, del2.action, 'u25-del2');
  check('delete executes', exec.ok, true);
  check('Printing entry gone from daily entries', state.dailyEntries.some((e) => e.id === 'e2'), false);
  check('other two entries untouched', state.dailyEntries.length, 2);
  check('deleted entry is in Recycle Bin', state.recycle.some((r) => r.id === 'e2' || (r.data && JSON.stringify(r.data).includes('e2'))), true);
  // Fewer entries than the ordinal → asks which one, never guesses.
  const { state: s2, p1: p2 } = emptyState();
  s2.dailyEntries.push(mk(p2.id, 'only', TODAY, 'Xerox', 10000));
  const tooFar = chat.parseAssistantMessage('Dusra wala delete kar do', s2, p2, {});
  check('ordinal beyond the entries → asks, never deletes blind', tooFar.kind, 'draft');
}

/* ================= Regression guards (§E.3) ================= */
section('regression guards — Marathi guard + UPDATE 23 delete');
{
  const { state, p1 } = emptyState();
  const { send } = convo(state, p1);
  const r = send('Kaise Ho Bhai');
  check('"Kaise Ho Bhai" is casual', r.intent, 'casual');
  check('never answers a greeting with records talk', hasNone(r.text, 'record', '₹0'), true);
  check('warm Hinglish greeting', has(r.text, 'bhai'), true);
  // UPDATE 23: "Isko remove kar do" deletes the just-saved entry.
  const { state: s2, p1: p2 } = emptyState();
  const entry = { id: 'e-600', profileId: p2.id, date: TODAY, service: 'Aadhaar Services', totalPaise: 60000, method: 'upi', customerName: '', createdAt: TODAY };
  s2.dailyEntries.push(entry);
  const del = chat.parseAssistantMessage('Isko remove kar do', s2, p2, { lastSavedEntry: { kind: 'daily', id: 'e-600', label: 'Aadhaar Services ₹600.00' } });
  check('"Isko remove kar do" resolves to the just-saved entry', del.action?.kind === 'delete_entry' && del.action.targetId === 'e-600', true);
  const exec = asst.applyAssistantAction(s2, p2.id, del.action, 'u25-del23');
  check('UPDATE 23 delete executes', exec.ok, true);
  check('entry gone after delete', s2.dailyEntries.length, 0);
  // Bare delete with several entries asks which one (never guesses).
  const { state: s3, p1: p3 } = emptyState();
  s3.dailyEntries.push({ id: 'a1', profileId: p3.id, date: TODAY, service: 'Xerox', totalPaise: 10000, method: 'cash', customerName: '', createdAt: TODAY });
  s3.dailyEntries.push({ id: 'a2', profileId: p3.id, date: TODAY, service: 'Printing', totalPaise: 20000, method: 'upi', customerName: '', createdAt: TODAY });
  const bare = chat.parseAssistantMessage('Hatana hai', s3, p3, {});
  check('bare delete asks which entry', bare.kind, 'draft');
}

/* ================= Summary ================= */
console.log('\n================ update25 test summary ================');
let totalPass = 0;
let total = 0;
for (const [name, r] of Object.entries(results)) {
  if (name === '_cur') continue;
  totalPass += r.pass;
  total += r.total;
  console.log(`  ${r.pass === r.total ? 'PASS' : 'FAIL'} ${name}: ${r.pass}/${r.total}`);
}
console.log(`  TOTAL: ${totalPass}/${total} checks passed`);
if (failures > 0 || totalPass !== total) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll UPDATE 25 comprehension checks passed.');
