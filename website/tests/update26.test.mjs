/**
 * BizKhata AI — UPDATE 26 acceptance suite ("Dhanda" understanding fix).
 *
 * The live bug (2026-11-27 20:59 IST, screenshot
 * workspace/user/files/44793_0_c7jc.jpg): while adding today's
 * business the AI kept replying, again and again:
 *   "Service samajh nahi aaya. Services: PAN Card, Aadhaar Services, ..."
 * Owner's definition (21:01 IST): "Dhanda Matlab Passport Size Photo
 * Smart Card Xerox Documents Ka Profit Money Transfer Profit Sab Mix
 * Ko Dhanda Kehta Hu Me" — dhanda = the whole day's mix.
 *
 * Each case drives the REAL lib (respondToMessage + the parser +
 * applyAssistantAction + the voice edge) through a small ChatSim that
 * mirrors the chat UI's send/respond/confirm flow (draft answers,
 * pending-preview confirm via "Ha", lastSavedEntry recorded only
 * after a verified save). A case passes only on the exact expected
 * behaviour — state verified in the store (entries, hub totals,
 * Recycle Bin, audit log), never on "some reply was returned".
 *
 * Money is integer paise (₹500 = 50000). The store starts empty
 * unless a case says otherwise. Run with `npm test`.
 * Requires no key and no network.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-u26-test';
execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/dev-requests.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);
const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const store = require(path.join(outDir, 'store.js'));
const voice = require(path.join(outDir, 'voice.js'));
const intentLib = require(path.join(outDir, 'intent.js'));

function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const TODAY = localISO(new Date());
const YESTERDAY = localISO(new Date(Date.now() - 86400000));

let seq = 0;
let keySeq = 0;
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
  const id = `u26-${++seq}`;
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

/** Seed one quick daily entry + its exactly-one linked CashTxn. */
function seedEntry(state, p1, service, paise, method, idSuffix, date = TODAY) {
  const id = `seed-${idSuffix}`;
  state.dailyEntries.push({
    id, profileId: p1.id, date, service, description: `${service} collection`,
    quantity: 1, ratePaise: paise, totalPaise: paise, method,
    expensePaise: 0, expenseMethod: 'cash', time: '10:00', notes: 'seed',
    createdAt: new Date().toISOString(),
  });
  if (method !== 'other') {
    state.cashTxns.push({
      id: `seed-txn-${idSuffix}`, profileId: p1.id, kind: 'in', method, amountPaise: paise,
      category: `${service} collection`, note: `Daily entry (${id})`, date,
      dailyEntryId: id, createdAt: new Date().toISOString(),
    });
  }
  return id;
}
const hubToday = (state, p1) => chat.computeFacts(state, p1);

/** Mirror of the chat UI flow (components/chatbot.tsx send/respond/
 *  confirmPreview): draft answers first, pending-preview confirm via
 *  "Ha", lastSavedEntry recorded ONLY after a verified save, cleared
 *  after a verified delete. */
class Sim {
  constructor() {
    const { state, p1 } = emptyState();
    this.state = state;
    this.p1 = p1;
    this.ctx = {};
    this.draft = null;
    this.pending = null;
  }
  send(q) {
    if (this.draft) {
      const parsed = chat.applyDraftAnswer(this.draft, q, this.state, this.p1, this.ctx);
      if (parsed.kind === 'draft') {
        this.draft = parsed.draft;
        return { kind: 'text', text: parsed.draft.question, intent: 'draft', draftQuestion: parsed.draft.question, draft: parsed.draft };
      }
      this.draft = null;
      if (parsed.kind === 'action') {
        this.pending = { action: parsed.action, lines: parsed.previewLines, total: parsed.totalPaise };
        return { kind: 'action', action: parsed.action, previewLines: parsed.previewLines, totalPaise: parsed.totalPaise, duplicateWarning: parsed.duplicateWarning, text: 'Ye entries save karun?', intent: 'business_action' };
      }
      if (parsed.kind === 'error') return { kind: 'text', text: parsed.text, intent: 'business_action' };
    }
    const parsed0 = chat.parseAssistantMessage(q, this.state, this.p1, this.ctx);
    if (parsed0.kind === 'confirm' && this.pending) return this.confirmPending();
    if (parsed0.kind === 'cancel' && this.pending) {
      this.pending = null;
      return { kind: 'text', text: 'Cancelled — kuch bhi save nahi hua.' };
    }
    const r = conv.respondToMessage({ message: q, state: this.state, profile: this.p1, ctx: this.ctx });
    this.ctx = r.newCtx;
    if (r.kind === 'action' && r.action) {
      this.pending = { action: r.action, lines: r.previewLines, total: r.totalPaise };
      return r;
    }
    if (r.draftQuestion && r.draft) {
      this.draft = r.draft;
      return r;
    }
    return r;
  }
  confirmPending() {
    const p = this.pending;
    this.pending = null;
    const res = asst.applyAssistantAction(this.state, this.p1.id, p.action, `u26-key-${++keySeq}`);
    if (!res.ok) return { kind: 'text', text: res.summary, exec: res, verified: false };
    const isDelete = p.action.kind === 'delete_entry';
    const verified = asst.verifyAppliedIds(this.state, res.appliedIds, isDelete);
    if (isDelete) {
      this.ctx = { ...this.ctx, lastSavedEntry: undefined, lastVerifiedSave: undefined };
    } else if (verified) {
      const saved = chat.savedEntryFor(p.action, res.appliedIds);
      if (saved) {
        this.ctx = { ...this.ctx, lastSavedEntry: saved, lastVerifiedSave: `Saved and verified: ${saved.label} (${saved.date})` };
      }
    }
    if (p.action.kind === 'daily_income' && p.action.entries.length > 0) {
      this.ctx = { ...this.ctx, lastService: p.action.entries[0].service };
    }
    return {
      kind: 'result', text: res.summary, exec: res, verified, action: p.action, lines: res.lines,
      title: isDelete ? '✓ Deleted' : '✓ Saved',
      verifyNote: isDelete ? asst.deleteVerifyNote(verified) : undefined,
    };
  }
}

// ---------------------------------------------------------------- registry
const CASES = [];
function C(id, title, run) { CASES.push({ id, title, run }); }
function ok(v, detail = '') { return v === true ? { ok: true } : { ok: false, detail: detail || `got ${JSON.stringify(v)}` }; }

/* ================= A — add with amount (cash) ================= */
C('a-add-cash', 'Add: "Aaj dhanda 500 ka hua cash" → Dhanda ₹500 cash preview → "Ha" saves 1 entry, hub cash ₹500', () => {
  const sim = new Sim();
  const r1 = sim.send('Aaj dhanda 500 ka hua cash');
  if (r1.kind !== 'action' || r1.action.kind !== 'daily_income') return ok(false, `expected an action preview, got kind=${r1.kind} text=${T(r1.text).slice(0, 140)}`);
  if (r1.action.entries.length !== 1) return ok(false, `expected 1 entry, got ${r1.action.entries.length}`);
  const e = r1.action.entries[0];
  if (e.service !== 'Dhanda' || e.amountPaise !== 50000 || e.method !== 'cash') return ok(false, `entry wrong: ${JSON.stringify(e)}`);
  if (sim.state.dailyEntries.length !== 0) return ok(false, 'nothing must be saved before Confirm');
  const r2 = sim.send('Ha');
  if (r2.kind !== 'result' || !r2.exec.ok || !r2.verified) return ok(false, `confirm must save+verify, got kind=${r2.kind} verified=${r2.verified} text=${T(r2.text).slice(0, 120)}`);
  if (sim.state.dailyEntries.length !== 1) return ok(false, 'exactly 1 daily entry must exist after save');
  const saved = sim.state.dailyEntries[0];
  if (saved.service !== 'Dhanda' || saved.totalPaise !== 50000 || saved.method !== 'cash') return ok(false, `saved entry wrong: ${JSON.stringify(saved)}`);
  if (hubToday(sim.state, sim.p1).todayCashPaise !== 50000) return ok(false, 'hub cash collection must be ₹500');
  if (hubToday(sim.state, sim.p1).todayCollectionPaise !== 50000) return ok(false, 'hub total collection must be ₹500');
  return ok(true);
});

/* ================= B — add with amount (UPI) ================= */
C('b-add-upi', 'Add: "Dhanda 300 UPI hue" → Dhanda ₹300 UPI preview → "Ha" saves, hub UPI ₹300', () => {
  const sim = new Sim();
  const r1 = sim.send('Dhanda 300 UPI hue');
  if (r1.kind !== 'action') return ok(false, `expected an action preview, got kind=${r1.kind} text=${T(r1.text).slice(0, 140)}`);
  const e = r1.action.entries[0];
  if (e.service !== 'Dhanda' || e.amountPaise !== 30000 || e.method !== 'upi') return ok(false, `entry wrong: ${JSON.stringify(e)}`);
  const r2 = sim.send('Ha');
  if (!r2.exec.ok || !r2.verified) return ok(false, 'confirm must save+verify');
  if (hubToday(sim.state, sim.p1).todayUpiPaise !== 30000) return ok(false, 'hub UPI collection must be ₹300');
  if (sim.state.cashTxns.length !== 1 || sim.state.cashTxns[0].method !== 'upi') return ok(false, 'exactly one linked UPI txn must exist');
  return ok(true);
});

/* ================= C — mode missing: ONE short question ================= */
C('c-mode-missing', 'Add without mode: "Aaj dhanda 500 ka hua" asks Cash-or-UPI ONCE (no service list, no dead-end); "cash" completes it', () => {
  const sim = new Sim();
  const r1 = sim.send('Aaj dhanda 500 ka hua');
  if (!r1.draftQuestion) return ok(false, `expected a clarification draft, got kind=${r1.kind} text=${T(r1.text).slice(0, 140)}`);
  if (/Service samajh nahi aaya/i.test(T(r1.text))) return ok(false, `must never show the dead-end, got: ${T(r1.text).slice(0, 140)}`);
  if (/Services:/.test(T(r1.text))) return ok(false, `must never list the services here, got: ${T(r1.text).slice(0, 140)}`);
  if (!/Cash.*UPI|UPI.*Cash/i.test(T(r1.text))) return ok(false, `must ask Cash-or-UPI once, got: ${T(r1.text).slice(0, 140)}`);
  if (r1.draft.missing !== 'method') return ok(false, `draft must ask for the method, got missing=${r1.draft.missing}`);
  const r2 = sim.send('cash');
  if (r2.kind !== 'action') return ok(false, `answering "cash" must complete to a preview, got kind=${r2.kind} text=${T(r2.text).slice(0, 140)}`);
  const e = r2.action.entries[0];
  if (e.service !== 'Dhanda' || e.amountPaise !== 50000 || e.method !== 'cash') return ok(false, `completed entry wrong: ${JSON.stringify(e)}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok || !r3.verified) return ok(false, 'confirm must save+verify');
  if (sim.state.dailyEntries.length !== 1) return ok(false, '1 entry must be saved');
  return ok(true);
});

/* ================= D — add without amount ================= */
C('d-no-amount', 'Add without amount: "Dhanda add kar do" asks the amount ONCE; "500 cash" completes to a Dhanda preview', () => {
  const sim = new Sim();
  const r1 = sim.send('Dhanda add kar do');
  if (!r1.draftQuestion) return ok(false, `expected an amount draft, got kind=${r1.kind} intent=${r1.intent} text=${T(r1.text).slice(0, 140)}`);
  if (/Service samajh nahi aaya/i.test(T(r1.text))) return ok(false, 'must never show the dead-end');
  if (!/kitne/i.test(T(r1.text))) return ok(false, `must ask for the amount, got: ${T(r1.text).slice(0, 140)}`);
  if (r1.draft.missing !== 'amount') return ok(false, `draft must ask for the amount, got missing=${r1.draft.missing}`);
  if (r1.draft.partial.pendingService !== 'Dhanda') return ok(false, `pending service must be Dhanda, got ${r1.draft.partial.pendingService}`);
  const r2 = sim.send('500 cash');
  if (r2.kind !== 'action') return ok(false, `answering "500 cash" must complete to a preview, got kind=${r2.kind} text=${T(r2.text).slice(0, 140)}`);
  const e = r2.action.entries[0];
  if (e.service !== 'Dhanda' || e.amountPaise !== 50000 || e.method !== 'cash') return ok(false, `completed entry wrong: ${JSON.stringify(e)}`);
  return ok(true);
});

/* ================= E — ask today's total (real DB rows) ================= */
C('e-ask-total', 'Ask: "Aaj dhanda kitna hua?" on real rows (Xerox ₹300 cash + Printing ₹200 UPI + MT principal ₹10000/commission ₹50 + job due ₹300 + expense ₹100) → total ₹550, commission ₹50, due NOT counted, principal NOT counted, net ₹450, service breakdown', () => {
  const { state, p1 } = emptyState();
  seedEntry(state, p1, 'Xerox', 30000, 'cash', 'x300');
  seedEntry(state, p1, 'Printing', 20000, 'upi', 'p200');
  state.mtTransfers.push({ id: 'mt1', profileId: p1.id, receiverName: 'Rahul', mobile: '', amountPaise: 1000000, commissionPaise: 5000, method: 'upi', status: 'Sent', refNo: '', date: TODAY, note: 'seed' });
  state.jobs.push({ id: 'j1', profileId: p1.id, customerName: 'Ramesh', service: 'PAN Card', date: TODAY, totalPaise: 50000, receivedPaise: 20000, receivedMethod: 'cash', status: 'New', agentId: null, agentChargePaise: 0, agentPaidPaise: 0, mobile: '', refNo: '', notes: '', docIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.expenses.push({ id: 'ex1', profileId: p1.id, category: 'Paper', equipmentId: null, description: 'Paper', amountPaise: 10000, method: 'cash', vendor: '', date: TODAY, service: 'Xerox', notes: '', createdAt: new Date().toISOString() });
  let ctx = {};
  const send = (q) => { const r = conv.respondToMessage({ message: q, state, profile: p1, ctx }); ctx = r.newCtx; return r; };
  const r = send('Aaj dhanda kitna hua?');
  if (r.intent !== 'business_query') return ok(false, `expected business_query, got ${r.intent}`);
  if (!has('₹550.00')(r)) return ok(false, `total collection must be ₹550.00, got: ${T(r.text).slice(0, 300)}`);
  if (!has('₹50.00')(r)) return ok(false, `MT commission ₹50.00 must be shown, got: ${T(r.text).slice(0, 300)}`);
  if (!has('₹450.00')(r)) return ok(false, `net earnings must be ₹450.00 (550 − 100 kharcha), got: ${T(r.text).slice(0, 300)}`);
  if (has('₹10,550.00', '₹10,000.00', '₹850.00')(r)) return ok(false, `MT principal (₹10000) and the ₹300 due must NEVER be counted as collection, got: ${T(r.text).slice(0, 300)}`);
  if (!has('₹300.00')(r)) return ok(false, 'the ₹300 customer due must still be shown (separately), got: ' + T(r.text).slice(0, 300));
  if (!has('Xerox', 'Printing')(r)) return ok(false, `service-wise breakdown must name Xerox + Printing, got: ${T(r.text).slice(0, 300)}`);
  if (r.table && !(r.table.rows || []).some((row) => row[0] === 'Xerox' && /₹300/.test(row[1]))) return ok(false, `breakdown table must have Xerox ₹300, got: ${JSON.stringify(r.table)}`);
  // "Aaj ka dhanda batao" — same answer, no question word.
  const r2 = send('Aaj ka dhanda batao');
  if (!has('₹550.00')(r2)) return ok(false, `"Aaj ka dhanda batao" must also answer ₹550.00, got: ${T(r2.text).slice(0, 200)}`);
  return ok(true);
});

/* ================= F — voice input path ================= */
C('f-voice', 'Voice: transcript "Aaj dhanda 500 cash hua" (confidence 0.9) routes to a Dhanda preview; low confidence asks to repeat; looksFinancial sees "dhanda"', () => {
  const sim = new Sim();
  const dec = voice.handleVoiceTranscript({ transcript: 'Aaj dhanda 500 cash hua', confidence: 0.9, prev: null, nowMs: Date.now() });
  if (dec.action !== 'send') return ok(false, `high-confidence dhanda transcript must send, got ${JSON.stringify(dec)}`);
  const r1 = sim.send(dec.text);
  if (r1.kind !== 'action' || r1.action.entries[0].service !== 'Dhanda' || r1.action.entries[0].amountPaise !== 50000) return ok(false, `voice transcript must preview Dhanda ₹500 cash, got kind=${r1.kind} ${JSON.stringify(r1.action?.entries)}`);
  const low = voice.handleVoiceTranscript({ transcript: 'Aaj dhanda 500 cash hua', confidence: 0.2, prev: null, nowMs: Date.now() });
  if (low.action !== 'clarify') return ok(false, `low-confidence transcript must ask to repeat, got ${JSON.stringify(low)}`);
  if (!voice.looksFinancial('dhanda add kar do')) return ok(false, '"dhanda add kar do" must look financial (no amount yet)');
  if (!voice.looksFinancial('Aaj dhanda kitna hua?')) return ok(false, '"Aaj dhanda kitna hua?" must look financial');
  return ok(true);
});

/* ================= G — all spellings + scripts ================= */
C('g-spellings', 'All spellings/scripts: dhanda/dhandha/dhandho/dhande/dhandhe/dhadhe + धंधा + धन्दा + ધંધો each parse to a Dhanda ₹100 cash action', () => {
  const words = ['dhanda', 'dhandha', 'dhandho', 'dhande', 'dhandhe', 'dhadhe', 'धंधा', 'धन्दा', 'ધંધો'];
  for (const w of words) {
    const { state, p1 } = emptyState();
    const parsed = chat.parseAssistantMessage(`Aaj ${w} 100 cash hua`, state, p1, {});
    if (parsed.kind !== 'action') return ok(false, `"${w}" must parse to an action, got kind=${parsed.kind} ${JSON.stringify(parsed.draft || parsed)}`);
    const e = parsed.action.entries[0];
    if (e.service !== 'Dhanda' || e.amountPaise !== 10000 || e.method !== 'cash') return ok(false, `"${w}" entry wrong: ${JSON.stringify(e)}`);
  }
  // The normaliser itself maps every form to the canonical token.
  if (!chat.isDhandaWord('धंधा')) return ok(false, 'isDhandaWord(धंधा) must be true');
  if (!chat.isDhandaWord('ધંધો')) return ok(false, 'isDhandaWord(ધંધો) must be true');
  if (!chat.isDhandaWord('dhadhe')) return ok(false, 'isDhandaWord(dhadhe) must be true');
  if (chat.isDhandaWord('PAN Card ka kaam', true)) return ok(false, 'isDhandaWord("PAN Card ka kaam", hasService) must be false — it is PAN Card');
  return ok(true);
});

/* ================= H — exact screenshot sequence, no loop ================= */
C('h-screenshot-sequence', 'Exact screenshot loop, killed: (1) add attempt never shows the dead-end; (2) repeating the same message escalates instead of repeating; (3) answering "dhanda" to an old askService draft becomes Dhanda, not the dead-end; (4) a genuinely unknown word fails once, then escalates', () => {
  // (1)+(2) live flow: add attempt → method question; same message again → a DIFFERENT short question.
  const sim = new Sim();
  const r1 = sim.send('Aaj dhanda 500 ka hua');
  if (!r1.draftQuestion) return ok(false, `turn 1 must ask Cash-or-UPI, got kind=${r1.kind} text=${T(r1.text).slice(0, 140)}`);
  if (/Service samajh nahi aaya/i.test(T(r1.text))) return ok(false, 'turn 1 must NEVER show the dead-end');
  const r2 = sim.send('Aaj dhanda 500 ka hua');
  if (/Service samajh nahi aaya/i.test(T(r2.text))) return ok(false, 'turn 2 (same message again) must NEVER show the dead-end');
  if (T(r2.text) === T(r1.text)) return ok(false, 'turn 2 must NOT repeat turn 1 identically');
  if (!/Cash ya UPI/i.test(T(r2.text))) return ok(false, `turn 2 must escalate to the short Cash-or-UPI question, got: ${T(r2.text).slice(0, 140)}`);
  // (3) the old path, answered with "dhanda": an askService draft from
  // before the fix, answered with the owner's word, must become Dhanda.
  {
    const { state, p1 } = emptyState();
    const oldDraft = { missing: 'service', question: 'Service samajh nahi aaya. Services: PAN Card, Aadhaar Services.', partial: { pendingAmounts: [50000], pendingMethods: [null], pendingDates: [TODAY], date: TODAY }, original: '500' };
    const done = chat.applyDraftAnswer(oldDraft, 'dhanda', state, p1, {});
    if (done.kind !== 'draft' || done.draft.missing !== 'method') return ok(false, `"dhanda" to an old askService draft must ask the method (not dead-end), got kind=${done.kind} ${JSON.stringify(done.draft || done)}`);
    if (/Service samajh nahi aaya/i.test(T(done.draft.question))) return ok(false, 'answering "dhanda" must never return the dead-end');
    const done2 = chat.applyDraftAnswer(done.draft, 'cash', state, p1, {});
    if (done2.kind !== 'action' || done2.action.entries[0].service !== 'Dhanda') return ok(false, `after "cash" it must be a Dhanda action, got kind=${done2.kind} ${JSON.stringify(done2.action?.entries)}`);
  }
  // (4) genuinely unknown service word: first failure keeps the short
  // dead-end (last resort, WITH the Dhanda escape hatch); the second
  // identical failure escalates and never repeats the text.
  {
    const { state, p1 } = emptyState();
    const draft0 = { missing: 'service', question: '₹500 — kis service ke hue?', partial: { pendingAmounts: [50000], pendingMethods: [null], pendingDates: [TODAY], date: TODAY }, original: '500' };
    const f1 = chat.applyDraftAnswer(draft0, 'xyzabc', state, p1, {});
    if (f1.kind !== 'draft') return ok(false, `unknown word must stay a draft, got kind=${f1.kind}`);
    if (!/Service samajh nahi aaya/i.test(T(f1.draft.question))) return ok(false, `first failure keeps the short dead-end, got: ${T(f1.draft.question).slice(0, 140)}`);
    if (!/Dhanda/.test(T(f1.draft.question))) return ok(false, 'first failure must offer the Dhanda escape hatch');
    const f2 = chat.applyDraftAnswer(f1.draft, 'xyzabc', state, p1, {});
    if (f2.kind !== 'draft') return ok(false, `second unknown word must stay a draft, got kind=${f2.kind}`);
    if (T(f2.draft.question) === T(f1.draft.question)) return ok(false, 'second failure must NOT repeat the first failure text');
    if (!/poora din ka mix/.test(T(f2.draft.question))) return ok(false, `second failure must escalate (Dhanda vs one service), got: ${T(f2.draft.question).slice(0, 160)}`);
    if (/Services: PAN Card/.test(T(f2.draft.question))) return ok(false, 'escalated question must not repeat the full service list');
  }
  return ok(true);
});

/* ================= I — regressions: service split, Ha merge, correction, delete ================= */
C('i-regressions', 'Regressions: service-by-service adds still work; "Ha" merges a follow-up; correction picks ₹250; Dhanda delete (UPDATE 23) removes it + Recycle Bin; ₹600 Aadhaar UPI delete still works', () => {
  // Service-by-service, one message, two modes.
  {
    const sim = new Sim();
    const r = sim.send('Aaj Xerox 300 cash, Printing 200 UPI');
    if (r.kind !== 'action') return ok(false, `service split must preview, got kind=${r.kind} text=${T(r.text).slice(0, 140)}`);
    if (r.action.entries.length !== 2) return ok(false, `expected 2 entries, got ${r.action.entries.length}`);
    if (r.action.entries[0].service !== 'Xerox' || r.action.entries[0].amountPaise !== 30000 || r.action.entries[0].method !== 'cash') return ok(false, `entry 1 wrong: ${JSON.stringify(r.action.entries[0])}`);
    if (r.action.entries[1].service !== 'Printing' || r.action.entries[1].amountPaise !== 20000 || r.action.entries[1].method !== 'upi') return ok(false, `entry 2 wrong: ${JSON.stringify(r.action.entries[1])}`);
  }
  // Mixed message: Dhanda first, then a named service — the split is kept.
  {
    const { state, p1 } = emptyState();
    const parsed = chat.parseAssistantMessage('Dhanda 500 cash, Xerox 300 cash', state, p1, {});
    if (parsed.kind !== 'action' || parsed.action.entries.length !== 2) return ok(false, `mixed split must give 2 entries, got kind=${parsed.kind} ${JSON.stringify(parsed.action?.entries)}`);
    if (parsed.action.entries[0].service !== 'Dhanda' || parsed.action.entries[0].amountPaise !== 50000) return ok(false, `mixed entry 1 must be Dhanda ₹500, got ${JSON.stringify(parsed.action.entries[0])}`);
    if (parsed.action.entries[1].service !== 'Xerox' || parsed.action.entries[1].amountPaise !== 30000) return ok(false, `mixed entry 2 must be Xerox ₹300, got ${JSON.stringify(parsed.action.entries[1])}`);
  }
  // "Ha" follow-up merges into a Dhanda preview (UPDATE 25 C-1).
  {
    const sim = new Sim();
    sim.send('Aaj dhanda 300 cash hua');
    const r2 = sim.send('Aur 200 UPI');
    if (r2.kind !== 'action') return ok(false, `follow-up must stay one preview, got kind=${r2.kind}`);
    if (r2.action.entries.length !== 2) return ok(false, `merged preview must have BOTH entries, got ${r2.action.entries.length}`);
    if (r2.action.entries[0].service !== 'Dhanda' || r2.action.entries[1].service !== 'Dhanda') return ok(false, `merged entries must both be Dhanda, got ${JSON.stringify(r2.action.entries)}`);
    if (r2.totalPaise !== 50000) return ok(false, `merged total must be ₹500, got ${r2.totalPaise}`);
    const r3 = sim.send('Ha');
    if (!r3.exec.ok || !r3.verified) return ok(false, 'merged confirm must save+verify');
    if (sim.state.dailyEntries.length !== 2) return ok(false, 'both merged entries must be saved');
  }
  // Correction: "Nahi, 300 nahi, 250 the" rebuilds the Dhanda preview at ₹250.
  {
    const sim = new Sim();
    sim.send('Aaj dhanda 300 cash hua');
    const r = sim.send('Nahi, 300 nahi, 250 the');
    if (r.intent !== 'followup_correct') return ok(false, `expected followup_correct, got ${r.intent}`);
    if (r.action.entries[0].amountPaise !== 25000) return ok(false, `corrected preview must be ₹250, got ${r.action.entries[0].amountPaise}`);
    if (r.action.entries[0].service !== 'Dhanda') return ok(false, 'corrected preview must stay Dhanda');
    if (sim.state.dailyEntries.length !== 0) return ok(false, 'correction must not save anything yet');
  }
  // Delete a saved Dhanda entry (UPDATE 23 flow): preview → "Ha" →
  // verified delete, entry + txn gone, hub cash back to ₹0, Recycle Bin.
  {
    const sim = new Sim();
    sim.send('Aaj dhanda 500 cash hua');
    const saved = sim.send('Ha');
    if (!saved.exec.ok || !saved.verified) return ok(false, 'setup save failed');
    if (hubToday(sim.state, sim.p1).todayCashPaise !== 50000) return ok(false, 'hub cash must be ₹500 before delete');
    const r4 = sim.send('Isko remove kar do');
    if (r4.kind !== 'action' || r4.action.kind !== 'delete_entry') return ok(false, `"Isko remove kar do" must be a delete preview, got kind=${r4.kind}`);
    if (!/Dhanda/.test((r4.previewLines || []).join(' '))) return ok(false, `delete preview must name the Dhanda entry, got: ${(r4.previewLines || []).join(' | ')}`);
    const r5 = sim.send('Ha');
    if (r5.kind !== 'result' || !r5.exec.ok || !r5.verified) return ok(false, `delete confirm must delete+verify, got kind=${r5.kind} verified=${r5.verified}`);
    if (sim.state.dailyEntries.length !== 0 || sim.state.cashTxns.length !== 0) return ok(false, 'entry + linked txn must be gone after delete');
    if (hubToday(sim.state, sim.p1).todayCashPaise !== 0) return ok(false, 'hub cash must be back to ₹0 after delete');
    if (!sim.state.recycle.some((x) => x.kind === 'DailyEntry' && /Dhanda/.test(x.label))) return ok(false, 'deleted Dhanda entry must be in the Recycle Bin');
  }
  // UPDATE 23 regression: the ₹600 Aadhaar UPI entry still deletes the
  // same way (today's UPI drops by ₹600).
  {
    const sim = new Sim();
    seedEntry(sim.state, sim.p1, 'Aadhaar Services', 60000, 'upi', 'a600');
    if (hubToday(sim.state, sim.p1).todayUpiPaise !== 60000) return ok(false, 'setup: UPI must be ₹600');
    const r = sim.send('Aadhaar 600 wali entry delete kar do');
    if (r.kind !== 'action' || r.action.kind !== 'delete_entry') return ok(false, `expected a delete preview, got kind=${r.kind}`);
    const r2 = sim.send('Ha');
    if (!r2.exec.ok || !r2.verified) return ok(false, 'Aadhaar delete must verify');
    if (hubToday(sim.state, sim.p1).todayUpiPaise !== 0) return ok(false, 'UPI must be ₹0 after the ₹600 delete');
  }
  return ok(true);
});

/* ================= J — other generic words hit the same path ================= */
C('j-generic-words', 'Generic words: "kaam", "hisab", "business" (and "Aaj ka hisaab batao") all resolve as Dhanda, never the dead-end', () => {
  const cases = [
    ['Aaj kaam 400 cash hua', 'Dhanda', 40000, 'cash'],
    ['Aaj ka hisab 400 cash hua', 'Dhanda', 40000, 'cash'],
    ['business 400 cash', 'Dhanda', 40000, 'cash'],
    ['Aaj dhandha 400 cash hua', 'Dhanda', 40000, 'cash'],
  ];
  for (const [msg, svc, amt, method] of cases) {
    const { state, p1 } = emptyState();
    const parsed = chat.parseAssistantMessage(msg, state, p1, {});
    if (parsed.kind !== 'action') return ok(false, `"${msg}" must parse to an action, got kind=${parsed.kind} ${JSON.stringify(parsed.draft || parsed)}`);
    const e = parsed.action.entries[0];
    if (e.service !== svc || e.amountPaise !== amt || e.method !== method) return ok(false, `"${msg}" entry wrong: ${JSON.stringify(e)}`);
  }
  // Ask with the generic word, on an empty store: a real ₹0.00 figure.
  {
    const { state, p1 } = emptyState();
    let ctx = {};
    const send = (q) => { const r = conv.respondToMessage({ message: q, state, profile: p1, ctx }); ctx = r.newCtx; return r; };
    const r = send('Aaj ka hisaab batao');
    if (r.intent !== 'business_query') return ok(false, `expected business_query, got ${r.intent}`);
    if (!has('₹0.00')(r)) return ok(false, `empty-store hisaab must quote ₹0.00, got: ${T(r.text).slice(0, 200)}`);
    if (/Service samajh nahi aaya/i.test(T(r.text))) return ok(false, 'must never show the dead-end');
  }
  return ok(true);
});

/* ================= K1 — safe default: add on top ================= */
C('k-add-on-top', 'Safe default (diagnosis §6b): a Dhanda entry already exists today (₹400 cash) → a new ₹200 add asks "upar add karun ya total badal dun?" (draft, never a silent add); "Upar add karo" previews ₹200 with NO duplicate warning; "Ha" saves it (total ₹600 × 2 entries)', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
  const before = chat.dhandaTodayTotal(sim.state, sim.p1.id, TODAY);
  if (before.totalPaise !== 40000 || before.count !== 1) return ok(false, `dhandaTodayTotal must be ₹400 × 1, got ${JSON.stringify(before)}`);
  const r1 = sim.send('Aaj dhanda 200 cash hua');
  if (!r1.draftQuestion || !r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `expected a dhanda_add_mode draft, got kind=${r1.kind} missing=${r1.draft?.missing} text=${T(r1.text).slice(0, 160)}`);
  if (!/₹400\.00/.test(T(r1.text))) return ok(false, `draft must show today's Dhanda total so far (₹400), got: ${T(r1.text).slice(0, 200)}`);
  if (!/₹200\.00/.test(T(r1.text))) return ok(false, `draft must show the new amount (₹200), got: ${T(r1.text).slice(0, 200)}`);
  if (!/Upar add karo/i.test(T(r1.text))) return ok(false, `draft must offer "Upar add karo", got: ${T(r1.text).slice(0, 200)}`);
  if (!/Total badal do/i.test(T(r1.text))) return ok(false, `draft must offer "Total badal do", got: ${T(r1.text).slice(0, 200)}`);
  if (!/kul collection ₹400\.00/.test(T(r1.text))) return ok(false, `draft must show today's overall collection as context, got: ${T(r1.text).slice(0, 200)}`);
  const r2 = sim.send('Upar add karo');
  if (r2.kind !== 'action') return ok(false, `"Upar add karo" must complete to a preview, got kind=${r2.kind} text=${T(r2.text).slice(0, 140)}`);
  const e = r2.action.entries[0];
  if (r2.action.entries.length !== 1 || e.service !== 'Dhanda' || e.amountPaise !== 20000 || e.method !== 'cash') return ok(false, `preview entry wrong: ${JSON.stringify(r2.action.entries)}`);
  if (r2.duplicateWarning) return ok(false, `a different amount must NOT carry the exact-duplicate warning, got: ${r2.duplicateWarning}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok || !r3.verified) return ok(false, 'explicit Confirm must still save the second entry');
  const after = chat.dhandaTodayTotal(sim.state, sim.p1.id, TODAY);
  if (after.totalPaise !== 60000 || after.count !== 2) return ok(false, `after Confirm, today's Dhanda must be ₹600 × 2, got ${JSON.stringify(after)}`);
  if (sim.state.dailyEntries.filter((x) => x.service === 'Dhanda').length !== 2) return ok(false, 'two separate Dhanda entries must exist (no silent merge, no overwrite)');
  return ok(true);
});

/* ================= K2 — safe default: replace the total ================= */
C('k-replace-total', 'Safe default (diagnosis §6b): "Total badal do" corrects the most recent Dhanda entry (₹400 → ₹300) via correct_entry — entry + linked CashTxn updated, still 1 entry, hub cash ₹300, audit logged', () => {
  const sim = new Sim();
  const seedId = seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
  const r1 = sim.send('Aaj dhanda 300 cash hua');
  if (!r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `expected a dhanda_add_mode draft, got missing=${r1.draft?.missing}`);
  const r2 = sim.send('Total badal do');
  if (r2.kind !== 'action' || r2.action.kind !== 'correct_entry') return ok(false, `"Total badal do" must be a correct_entry preview, got kind=${r2.kind} action=${r2.action?.kind}`);
  if (r2.action.targetKind !== 'daily' || r2.action.targetId !== seedId) return ok(false, `correct_entry must target the seeded Dhanda entry, got ${JSON.stringify(r2.action)}`);
  if (r2.action.oldAmountPaise !== 40000 || r2.action.newAmountPaise !== 30000) return ok(false, `correct_entry must be ₹400 → ₹300, got old=${r2.action.oldAmountPaise} new=${r2.action.newAmountPaise}`);
  if (!/₹300\.00/.test((r2.previewLines || []).join(' '))) return ok(false, `preview must show the new ₹300 total, got: ${(r2.previewLines || []).join(' | ')}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok || !r3.verified) return ok(false, 'Confirm must correct+verify');
  if (sim.state.dailyEntries.length !== 1) return ok(false, 'still exactly 1 Dhanda entry (correct, not add)');
  const saved = sim.state.dailyEntries[0];
  if (saved.totalPaise !== 30000) return ok(false, `entry must now be ₹300, got ${saved.totalPaise}`);
  if (sim.state.cashTxns.length !== 1 || sim.state.cashTxns[0].amountPaise !== 30000) return ok(false, 'the linked CashTxn must also be ₹300');
  if (hubToday(sim.state, sim.p1).todayCashPaise !== 30000) return ok(false, 'hub cash must be ₹300 after the correction');
  if (sim.state.audit.length !== 1) return ok(false, `the correction must be in the audit log (1 entry), got ${sim.state.audit.length}`);
  return ok(true);
});

/* ================= K3 — safe default: exact duplicate ================= */
C('k-exact-duplicate', 'Safe default: exact duplicate (Dhanda ₹400 cash already today, add ₹400 cash again) → the draft, then "Upar add karo" → preview KEEPS the exact-duplicate warning; "Ha" saves (total ₹800 × 2)', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
  const r1 = sim.send('Aaj dhanda 400 cash hua');
  if (!r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `expected a dhanda_add_mode draft, got missing=${r1.draft?.missing}`);
  const r2 = sim.send('Upar add karo');
  if (r2.kind !== 'action') return ok(false, `"Upar add karo" must complete to a preview, got kind=${r2.kind}`);
  if (!r2.duplicateWarning) return ok(false, 'the exact-duplicate preview MUST carry the warning');
  if (!/Aaj Dhanda ₹400\.00 \(CASH\) ki entry pehle se/.test(r2.duplicateWarning)) return ok(false, `warning must be the exact-duplicate line, got: ${r2.duplicateWarning}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok || !r3.verified) return ok(false, 'explicit Confirm must still save the duplicate');
  const after = chat.dhandaTodayTotal(sim.state, sim.p1.id, TODAY);
  if (after.totalPaise !== 80000 || after.count !== 2) return ok(false, `after Confirm, today's Dhanda must be ₹800 × 2, got ${JSON.stringify(after)}`);
  return ok(true);
});

/* ================= K4 — safe default: cancel, correction, per-amount modes ================= */
C('k-draft-cancel-correct', 'Safe default: "Nahi" to the draft cancels (nothing saved); "Nahi, 250 the" corrects the pending amount and re-asks; per-amount modes ("Dhanda 300 cash, 200 UPI") survive the draft into one preview', () => {
  // (a) Bare "Nahi" cancels.
  {
    const sim = new Sim();
    seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
    const r1 = sim.send('Aaj dhanda 200 cash hua');
    if (!r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `(a) expected a dhanda_add_mode draft, got missing=${r1.draft?.missing}`);
    const r2 = sim.send('Nahi');
    if (!/add nahi ki/i.test(T(r2.text))) return ok(false, `(a) "Nahi" must cancel with a clear message, got: ${T(r2.text).slice(0, 160)}`);
    if (sim.state.dailyEntries.length !== 1 || sim.state.dailyEntries[0].totalPaise !== 40000) return ok(false, '(a) nothing must be saved after cancel');
  }
  // (b) "Nahi, 250 the" corrects the pending amount, then add-on-top.
  {
    const sim = new Sim();
    seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
    const r1 = sim.send('Aaj dhanda 200 cash hua');
    if (!r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `(b) expected a dhanda_add_mode draft, got missing=${r1.draft?.missing}`);
    const r2 = sim.send('Nahi, 250 the');
    if (!r2.draftQuestion || !r2.draft || r2.draft.missing !== 'dhanda_add_mode') return ok(false, `(b) a correction must re-ask the same choice, got kind=${r2.kind} text=${T(r2.text).slice(0, 160)}`);
    if (!/₹250\.00/.test(T(r2.text))) return ok(false, `(b) the re-asked draft must show the corrected ₹250, got: ${T(r2.text).slice(0, 200)}`);
    const r3 = sim.send('Upar add karo');
    if (r3.kind !== 'action' || r3.action.entries[0].amountPaise !== 25000) return ok(false, `(b) add-on-top must preview the corrected ₹250, got ${JSON.stringify(r3.action?.entries)}`);
    const r4 = sim.send('Ha');
    if (!r4.exec.ok || !r4.verified) return ok(false, '(b) confirm must save');
    const after = chat.dhandaTodayTotal(sim.state, sim.p1.id, TODAY);
    if (after.totalPaise !== 65000 || after.count !== 2) return ok(false, `(b) today's Dhanda must be ₹650 × 2, got ${JSON.stringify(after)}`);
  }
  // (c) Per-amount modes survive the draft ("Dhanda 300 cash, 200 UPI").
  {
    const sim = new Sim();
    seedEntry(sim.state, sim.p1, 'Dhanda', 40000, 'cash', 'd400');
    const r1 = sim.send('Dhanda 300 cash, 200 UPI');
    if (!r1.draft || r1.draft.missing !== 'dhanda_add_mode') return ok(false, `(c) expected a dhanda_add_mode draft, got kind=${r1.kind} missing=${r1.draft?.missing}`);
    if (!/₹500\.00/.test(T(r1.text))) return ok(false, `(c) the draft must show the new total ₹500 (300 + 200), got: ${T(r1.text).slice(0, 200)}`);
    const r2 = sim.send('Haan');
    if (r2.kind !== 'action' || r2.action.entries.length !== 2) return ok(false, `(c) "Haan" must preview BOTH entries, got kind=${r2.kind} ${JSON.stringify(r2.action?.entries)}`);
    if (r2.action.entries[0].method !== 'cash' || r2.action.entries[1].method !== 'upi') return ok(false, `(c) per-amount modes must survive (cash + UPI), got ${JSON.stringify(r2.action.entries)}`);
    const r3 = sim.send('Ha');
    if (!r3.exec.ok || !r3.verified) return ok(false, '(c) confirm must save both');
    const after = chat.dhandaTodayTotal(sim.state, sim.p1.id, TODAY);
    if (after.totalPaise !== 90000 || after.count !== 3) return ok(false, `(c) today's Dhanda must be ₹900 × 3, got ${JSON.stringify(after)}`);
  }
  return ok(true);
});

/* ================= L — empty-store ask + login (UPDATE 24) ================= */
C('l-empty-ask-and-login', 'Empty store: "Aaj dhanda kitna hua?" quotes the real ₹0.00 figure (never "no records" as the answer); UPDATE 24 login helpers still normalise + hash the same way', () => {
  {
    const { state, p1 } = emptyState();
    let ctx = {};
    const send = (q) => { const r = conv.respondToMessage({ message: q, state, profile: p1, ctx }); ctx = r.newCtx; return r; };
    const r = send('Aaj dhanda kitna hua?');
    if (r.intent !== 'business_query') return ok(false, `expected business_query, got ${r.intent}`);
    if (!has('₹0.00')(r)) return ok(false, `empty-store dhanda must quote ₹0.00, got: ${T(r.text).slice(0, 200)}`);
    if (/Service samajh nahi aaya/i.test(T(r.text))) return ok(false, 'must never show the dead-end');
  }
  // UPDATE 24 (untouched by this fix): one account per mobile.
  if (store.normalizeMobile('+91 98765 43210') !== '9876543210') return ok(false, 'normalizeMobile must strip +91/spaces');
  if (store.normalizeMobile('09876543210') !== '9876543210') return ok(false, 'normalizeMobile must strip a leading 0');
  if (store.normalizeMobile('91-98765 43210') !== '9876543210') return ok(false, 'normalizeMobile must strip 91/dashes');
  const h1 = store.hashPin('1234', '9876543210');
  const h2 = store.hashPin('1234', '9876543210');
  if (h1 !== h2 || !h1) return ok(false, 'hashPin must be deterministic');
  if (store.hashPin('1234', '9876500010') === h1) return ok(false, 'hashPin must salt with the mobile');
  return ok(true);
});

/* ================= M — how-to-add still app_help (UPDATE 25 C-8) ================= */
C('m-how-to-add', 'Regression (UPDATE 25 C-8): "Kaise Add Karu Dhadhe Ka" still routes to app_help with Daily Business steps — never to a money draft', () => {
  const { state, p1 } = emptyState();
  let ctx = {};
  const send = (q) => { const r = conv.respondToMessage({ message: q, state, profile: p1, ctx }); ctx = r.newCtx; return r; };
  const r = send('Batana Nahi Hai Kaise Add Karu Dhadhe Ka');
  if (r.intent !== 'app_help') return ok(false, `expected app_help, got ${r.intent}`);
  if (!has('Daily Business')(r)) return ok(false, `must give the Daily Business steps, got: ${T(r.text).slice(0, 200)}`);
  if (r.draftQuestion) return ok(false, 'a how-to question must never open a money draft');
  // And the greeting that started UPDATE 19 is still casual, not records.
  const g = send('Kaise Ho Bhai');
  if (g.intent !== 'casual') return ok(false, `"Kaise Ho Bhai" must stay casual, got ${g.intent}`);
  if (/record|₹0/.test(T(g.text))) return ok(false, 'a greeting must never be answered with records talk');
  return ok(true);
});

/* ================= Summary ================= */
console.log('\n================ update26 test summary ================');
let totalPass = 0;
let total = 0;
let failedCases = [];
for (const c of CASES) {
  let r;
  try {
    r = c.run();
  } catch (e) {
    r = { ok: false, detail: `threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)}` };
  }
  total++;
  if (r.ok) { totalPass++; console.log(`  PASS ${c.id}: ${c.title}`); }
  else { failedCases.push(c.id); console.log(`  FAIL ${c.id}: ${c.title}\n       ${r.detail || ''}`); }
}
console.log(`  TOTAL: ${totalPass}/${total} cases passed`);
if (failedCases.length > 0) {
  console.log(`\n${failedCases.length} case(s) FAILED: ${failedCases.join(', ')}`);
  process.exit(1);
}
console.log('\nAll UPDATE 26 "Dhanda" checks passed.');
