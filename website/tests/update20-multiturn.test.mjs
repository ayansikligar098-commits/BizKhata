/**
 * BizKhata AI — UPDATE 20/21 multi-turn acceptance suite.
 *
 * Full conversations of 4–15 messages each (the 10–15 message arcs the
 * owner asked for), driven through the REAL respondToMessage() with a
 * threaded ChatContext — the same harness style as
 * tests/update20.test.mjs. A turn passes only when the reply fits the
 * conversation so far: the right intent, the right state transition,
 * no repeated introduction, no restart, no fixed reply.
 *
 * Writes tests/update20-multiturn-results.json (every turn: question,
 * expected, actual reply, intent/kind, pass/fail) and exits non-zero
 * unless every turn passes. The M1 arc transcript in the results file
 * is the full 10–15 message transcript for the test report.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-u20mt-test';
execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/dev-requests.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);
const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const dev = require(path.join(outDir, 'dev-requests.js'));
const voiceLib = require(path.join(outDir, 'voice.js'));

let seq = 0;
function profile(id, name) {
  return {
    id, name, category: 'Cyber Cafe / CSC Center',
    services: ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [],
    expenseCategories: ['Machine Repair', 'Electricity', 'Internet', 'Paper', 'Ink', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: '', mobile: '', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light',
    createdAt: '2026-11-27', aiLanguage: 'auto',
  };
}
function emptyState() {
  const id = `u20mt-${++seq}`;
  const p1 = profile(id, 'Al Falah Communication');
  return {
    state: {
      owner: null, profiles: [p1], activeProfileId: id, jobs: [], dailyEntries: [],
      cashTxns: [], mtFunds: [], mtTransfers: [], mtExpenses: [], customers: [],
      docs: [], agents: [], expenses: [], equipment: [], receipts: [], audit: [],
      recycle: [], executedActionKeys: [],
    }, p1,
  };
}
const T = (t) => String(t || '');
const has = (...ns) => (r) => ns.some((n) => T(r.text).includes(n));
const hasNone = (...ns) => (r) => !ns.some((n) => T(r.text).includes(n));
const re = (rx) => (r) => rx.test(T(r.text));
const isIntent = (...xs) => (r) => xs.includes(r.intent);
const isKind = (...xs) => (r) => xs.includes(r.kind);
const and = (...fs) => (r, a) => fs.every((f) => f(r, a));
const noMoneyQ = (r) => !/kitne rupaye|rupaye hue|paise hue|how much money/i.test(T(r.text));
const clen = (r) => ((r.checklist && r.checklist.items) || []).length;
const snap = (state) => JSON.stringify([state.dailyEntries, state.cashTxns, state.expenses, state.jobs, state.customers, state.agents, state.mtTransfers]);
const unchanged = (_r, a) => snap(a.state) === a.before;

const ARCS = [];
function ARC(id, title, turns) { ARCS.push({ id, title, turns }); }

// ============================================================ M1 — the 13-message PAN arc
ARC('M1', 'PAN arc: greeting → plan → count → docs → English → Xerox switch → return → correction → general → closing', [
  { q: 'Namaste', expected: 'Greeting, no money question', check: and(isIntent('casual'), noMoneyQ) },
  { q: 'Kal Pan Card banane hai', expected: 'Plan + checklist offer + count question', check: and(isIntent('plan'), has('checklist'), (r, a) => a.getCtx().pendingOffer?.kind === 'checklist' && a.getCtx().pendingQuestion?.kind === 'count') },
  { q: '5', expected: 'Bare "5" = 5 PAN applications, checklist built', check: and(isIntent('followup_count'), isKind('checklist'), re(/5 applications/), (r) => clen(r) >= 4) },
  { q: 'Documents bhi batao', expected: 'Same PAN topic: document list', check: and(isIntent('topic_followup'), has('Aadhaar')) },
  { q: 'Aur English mein likho', expected: 'Checklist converted to English, content kept (5 applications)', check: and(isIntent('checklist_translate'), isKind('checklist'), has('PAN Card work checklist'), re(/5 applications/)) },
  { q: 'Aaj Xerox ke 300 cash hue', expected: 'Topic switch: Xerox income preview, NOT saved', check: and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged) },
  { q: 'Aur 200 UPI', expected: 'Follow-up on the SAME service (Xerox), ₹200 UPI', check: and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 20000 && /Xerox/.test((r.previewLines || []).join(' '))) },
  { q: 'PAN wali checklist phir dikhao', expected: 'Return to the earlier topic: PAN checklist shown again (5 applications)', check: and(isIntent('checklist_show'), isKind('checklist'), re(/5 applications/)) },
  { q: 'Nahi, 3 the, 5 nahi', expected: 'Correction after the topic switch: 3, not 5', check: and(isIntent('followup_correct'), isKind('checklist'), re(/3 applications/), (r) => !/5 applications/.test(T(r.text))) },
  { q: 'Aaj ka dhandha kitna hua?', expected: 'Real total (nothing was saved — previews only): ₹0.00', check: and(isIntent('business_query'), has('₹0.00')) },
  { q: 'Mujhe ek business idea chahiye', expected: 'Business ideas, no forced transaction', check: and(isIntent('general'), re(/business idea/i)) },
  { q: 'Shukriya', expected: 'Thanks reply', check: isIntent('casual') },
  { q: 'Bye, kal milte hain', expected: 'Farewell (NOT a greeting reply): says bye / kal milte hain', check: and(isIntent('casual'), has('Bye', 'Kal milte', 'bye', 'kal milte'), hasNone('Main ekdum theek', 'Main badhiya', 'Namaste', 'main BizKhata'), noMoneyQ) },
]);

// ============================================================ M2 — voice arc (text transcripts)
ARC('M2', 'Voice arc: spoken income → spoken follow-up → summary → plan → checklist', [
  { q: 'Aaj Xerox ke 300 cash hue.', viaVoice: true, expected: 'Voice income → Xerox preview', check: and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 30000, unchanged) },
  { q: 'Aur 200 UPI.', viaVoice: true, expected: 'Voice follow-up: same service, ₹200 UPI', check: and(isIntent('business_action'), isKind('action'), (r) => r.action.kind === 'daily_income' && r.totalPaise === 20000) },
  { q: 'Aaj ka dhandha kitna hua?', expected: 'Summary from real ledger: ₹0.00 (previews not saved)', check: and(isIntent('business_query'), has('₹0.00')) },
  { q: 'Kal Pan Card banane hai', expected: 'Plan + checklist offer', check: and(isIntent('plan'), has('checklist')) },
  { q: 'Checklist bana do', expected: 'PAN checklist (topic from the plan, not a shop list)', check: and(isIntent('do_checklist'), isKind('checklist'), (r) => /PAN/.test(r.checklist.title)) },
]);

// ============================================================ M3 — checklist edit + translate
ARC('M3', 'Checklist edit + translate: Aadhaar list → add docs → English → add item → show', [
  { q: 'Kal Aadhaar ka kaam karna hai, checklist bana do', expected: 'Aadhaar checklist saved', check: and(isIntent('do_checklist'), isKind('checklist'), (r) => /Aadhaar/.test(r.checklist.title) && clen(r) >= 4) },
  { q: 'Isme documents bhi add karo', expected: 'Documents appended, list grows', check: and(isIntent('checklist_edit'), isKind('checklist'), (r, a) => clen(r) > clen(a.prevResult) && /Aadhaar/.test(T(r.text))) },
  { q: 'Aur English mein likho', expected: 'Converted to English, item count preserved', check: and(isIntent('checklist_translate'), isKind('checklist'), (r, a) => /Aadhaar work checklist/.test(r.checklist.title) && clen(r) === clen(a.prevResult)) },
  { q: 'Isme signature lena bhi add karo', expected: 'Named item appended', check: and(isIntent('checklist_edit'), isKind('checklist'), (r, a) => clen(r) > clen(a.prevResult) && /signature/i.test(T(r.text))) },
  { q: 'Checklist phir dikhao', expected: 'Show: the added item is still there', check: and(isIntent('checklist_show'), isKind('checklist'), re(/signature/i)) },
  { q: 'Theek hai, shukriya', expected: 'Closing, no restart', check: isIntent('casual') },
]);

// ============================================================ M4 — app-change arc
ARC('M4', 'App-change arc: request → spec → confirm → queued → open the queue', [
  { q: 'Aadhaar Mobile Number Update ka module bana do', expected: 'Spec shown, UIDAI distinction, NOT claimed built, no portal', check: and(isIntent('app_change'), has('Aadhaar Mobile Number Update'), re(/NOT built yet|bana NAHI/i), hasNone('portal', 'module taiyaar', 'module ban gaya')) },
  { q: 'Haan, banao', expected: 'Confirmed → QUEUED development request, stored + visible', check: and(isIntent('accept_offer'), re(/Queued|queue/i), (r, a) => { const list = dev.listDevRequests(a.p1.id); return list.length === 1 && list[0].status === 'queued' && /Aadhaar Mobile Number Update/.test(list[0].name); }) },
  { q: 'Module Requests kholo', expected: 'Opens the Module Requests view', check: and(isIntent('navigation'), (r) => r.navigateTo === '/module-requests') },
  { q: 'Shukriya', expected: 'Closing', check: isIntent('casual') },
]);

// ============================================================ M5 — decline + return
ARC('M5', 'Topic switch + decline: plan → "Nahi, rehne do" → summary → plan again → accept', [
  { q: 'Kal Pan Card banane hai', expected: 'Plan + checklist offer', check: and(isIntent('plan'), has('checklist')) },
  { q: 'Nahi, rehne do', expected: 'Graceful decline, no pending-entry line', check: and(isIntent('decline_offer'), (r) => !/pending entry/i.test(T(r.text))) },
  { q: 'Aaj ka dhandha kitna hua?', expected: 'Summary: ₹0.00', check: and(isIntent('business_query'), has('₹0.00')) },
  { q: 'Kal Pan Card banane hai', expected: 'Plan again (a fresh offer)', check: and(isIntent('plan'), has('checklist')) },
  { q: 'Ha', expected: 'Bare "Ha" executes the offer: real checklist', check: and(isIntent('accept_offer'), isKind('checklist'), (r) => clen(r) >= 4) },
  { q: 'Shukriya', expected: 'Closing', check: isIntent('casual') },
]);

// ============================================================ M6 — close + reopen (context restore)
ARC('M6', 'Close/reopen: context restored from the persisted conversation', [
  { q: 'Kal Pan Card banane hai', expected: 'Plan + checklist offer', check: and(isIntent('plan'), has('checklist')) },
  { q: '5', expected: 'Checklist for 5 applications', check: and(isIntent('followup_count'), isKind('checklist'), re(/5 applications/)) },
  { q: 'Documents bhi batao', restore: true, expected: 'After reopen: same PAN topic, documents listed', check: and(isIntent('topic_followup'), has('Aadhaar')) },
  { q: 'Aur English mein likho', expected: 'After reopen: checklist converts, 5 applications kept', check: and(isIntent('checklist_translate'), isKind('checklist'), has('PAN Card work checklist'), re(/5 applications/)) },
]);

// ---------------------------------------------------------------- runner
const results = [];
let passed = 0;
let total = 0;
for (const arc of ARCS) {
  const { state, p1 } = emptyState();
  const before = snap(state);
  let ctx = {};
  let prevResult = null;
  const send = (q) => {
    const r = conv.respondToMessage({ message: q, state, profile: p1, ctx });
    ctx = r.newCtx;
    return r;
  };
  console.log(`\n[${arc.id}] ${arc.title}`);
  for (let i = 0; i < arc.turns.length; i++) {
    const turn = arc.turns[i];
    total++;
    let r;
    let detail = '';
    let ok = false;
    try {
      if (turn.restore) {
        // Simulate closing + reopening the chat: the persisted
        // ChatContext is serialised and restored, messages are not.
        ctx = JSON.parse(JSON.stringify(ctx));
      }
      let q = turn.q;
      if (turn.viaVoice) {
        const d = voiceLib.handleVoiceTranscript({ transcript: turn.q });
        if (d.action !== 'send') throw new Error('voice decision=' + d.action);
        q = d.text;
      }
      r = send(q);
      const api = { state, p1, send, before, getCtx: () => ctx, prevResult };
      const v = turn.check(r, api);
      ok = v === true || (v && v.ok === true);
      detail = v && v.detail ? String(v.detail) : '';
    } catch (e) {
      detail = 'threw: ' + (e && e.message ? e.message : String(e));
      r = r || { text: '', intent: 'error', kind: 'text' };
    }
    if (ok) passed++;
    prevResult = r;
    results.push({
      arc: arc.id, turn: i + 1, question: turn.q, viaVoice: !!turn.viaVoice,
      expected: turn.expected, actual: T(r.text).slice(0, 600),
      intent: r.intent, kind: r.kind, pass: ok, detail,
    });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${i + 1}. ${turn.q}${detail ? ' — ' + detail : ''}`);
  }
}
const rate = Math.round((passed / total) * 1000) / 10;
console.log(`\nMulti-turn acceptance: ${passed}/${total} (${rate}%) — ${ARCS.length} conversations`);
fs.writeFileSync(
  path.join(root, 'tests', 'update20-multiturn-results.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), total, passed, rate, arcs: ARCS.map((a) => ({ id: a.id, title: a.title, turns: a.turns.length })), turns: results }, null, 2),
);
console.log('Wrote tests/update20-multiturn-results.json');
if (passed !== total) {
  console.error(`MULTI-TURN ACCEPTANCE NOT MET: ${passed}/${total}`);
  process.exit(1);
}
