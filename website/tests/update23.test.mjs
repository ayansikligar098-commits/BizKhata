/**
 * BizKhata AI — UPDATE 23 acceptance suite (delete bug, 2026-11-27 16:02–16:04 IST).
 *
 * The live bug: after a verified ₹600 Aadhaar (UPI) save, "Isko remove
 * kardo" got a fabricated "hata diya" (nothing was deleted), then the
 * AI contradicted its own verified save, then "Hatana hai" was
 * deflected to manual deletion. Root cause was routing: the delete
 * branch was amount-gated and there was no "isko" resolution, so the
 * message fell through to the cloud model.
 *
 * Each case drives the REAL lib (respondToMessage + the parser +
 * applyAssistantAction) through a small ChatSim that mirrors the chat
 * UI's send/respond/confirm flow (draft answers, pending-preview
 * confirm via "Ha", lastSavedEntry recording only after a verified
 * save). A case passes only on the exact expected behaviour — state
 * verified in the store (entries, balances, Recycle Bin, audit log),
 * never on "some reply was returned".
 *
 * Writes tests/update23-results.json and exits non-zero unless every
 * case passes (financial-safety bar: 100%).
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-u23-test';
execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/dev-requests.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);
const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const convai = require(path.join(outDir, 'conversation-ai.js'));
const intentLib = require(path.join(outDir, 'intent.js'));

let seq = 0;
let keySeq = 0;
function profile(id, name) {
  return {
    id, name,
    category: 'Cyber Cafe / CSC Center',
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
  const id = `u23-${++seq}`;
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
function localISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, 0);
}
const TODAY = localISO(new Date());
const T = (t) => String(t || '');
const has = (...ns) => (r) => ns.some((n) => T(r.text).includes(n));
const hasNone = (...ns) => (r) => !ns.some((n) => T(r.text).includes(n));

function seedEntry(state, p1, service, paise, method, idSuffix) {
  const id = `seed-${idSuffix}`;
  state.dailyEntries.push({
    id, profileId: p1.id, date: TODAY, service, description: `${service} collection`,
    quantity: 1, ratePaise: paise, totalPaise: paise, method,
    expensePaise: 0, expenseMethod: 'cash', time: '10:00', notes: 'seed',
    createdAt: new Date().toISOString(),
  });
  state.cashTxns.push({
    id: `seed-txn-${idSuffix}`, profileId: p1.id, kind: 'in', method, amountPaise: paise,
    category: `${service} collection`, note: `Daily entry (${id})`, date: TODAY,
    dailyEntryId: id, createdAt: new Date().toISOString(),
  });
  return id;
}
const upiToday = (state, p1) => chat.computeFacts(state, p1).todayUpiPaise;
const cashToday = (state, p1) => chat.computeFacts(state, p1).todayCashPaise;

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
        return { kind: 'text', text: parsed.draft.question, intent: 'draft', draftQuestion: parsed.draft.question };
      }
      this.draft = null;
      if (parsed.kind === 'action') {
        this.pending = { action: parsed.action, lines: parsed.previewLines, total: parsed.totalPaise };
        return { kind: 'action', action: parsed.action, previewLines: parsed.previewLines, totalPaise: parsed.totalPaise, text: 'Ye entries save karun?', intent: 'business_action' };
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
    const res = asst.applyAssistantAction(this.state, this.p1.id, p.action, `u23-key-${++keySeq}`);
    if (!res.ok) return { kind: 'text', text: res.summary, exec: res, verified: false };
    const all = [
      ...this.state.jobs.map((x) => x.id), ...this.state.dailyEntries.map((x) => x.id),
      ...this.state.expenses.map((x) => x.id), ...this.state.cashTxns.map((x) => x.id),
      ...this.state.mtTransfers.map((x) => x.id), ...this.state.mtFunds.map((x) => x.id),
      ...this.state.customers.map((x) => x.id), ...this.state.recycle.map((x) => x.id),
    ];
    // Delete verification: the deleted record must be in the Recycle
    // Bin (its recycle item wraps the original, so match on the
    // wrapped id as well as the recycle item id).
    const verified = res.appliedIds.every((id) => all.includes(id)
      || this.state.recycle.some((r) => {
        try { return JSON.parse(r.data).id === id; } catch { return false; }
      }));
    if (p.action.kind === 'delete_entry') {
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
    return { kind: 'result', text: res.summary, exec: res, verified, action: p.action, lines: res.lines };
  }
}

// ---------------------------------------------------------------- registry
const CASES = [];
function C(id, title, run) { CASES.push({ id, title, run }); }
function ok(v, detail = '') { return v === true ? { ok: true } : { ok: false, detail: detail || `got ${JSON.stringify(v)}` }; }

// (a) EXACT 4pm sequence end-to-end
C('a-exact-sequence', '16:02 add Aadhaar ₹600 UPI → confirm → 16:03 "Isko remove kardo" → delete preview ₹600 → "Ha" → verified deleted, UPI ₹0, Recycle Bin + audit', () => {
  const sim = new Sim();
  const r1 = sim.send('Aaj Aadhar Card Ka Biometric Ka Customer Aaya 600 Ka Payment Leke');
  if (!r1.draftQuestion || !/cash|upi/i.test(T(r1.text))) return ok(false, `turn1 should ask Cash/UPI, got: ${T(r1.text).slice(0, 120)}`);
  const r2 = sim.send('Upi');
  if (r2.kind !== 'action' || r2.action.kind !== 'daily_income' || r2.totalPaise !== 60000) return ok(false, `turn2 should preview Aadhaar ₹600 UPI, got kind=${r2.kind} total=${r2.totalPaise}`);
  if (r2.action.entries[0].service !== 'Aadhaar Services' || r2.action.entries[0].method !== 'upi') return ok(false, `turn2 service/method wrong: ${JSON.stringify(r2.action.entries[0])}`);
  const r3 = sim.send('Ha');
  if (r3.kind !== 'result' || !r3.exec.ok || !r3.verified) return ok(false, `turn3 confirm should save+verify, got kind=${r3.kind} verified=${r3.verified} text=${T(r3.text).slice(0, 120)}`);
  if (upiToday(sim.state, sim.p1) !== 60000 || sim.state.dailyEntries.length !== 1) return ok(false, 'after save: UPI collection should be ₹600, 1 entry');
  const savedId = sim.state.dailyEntries[0].id;
  if (!sim.ctx.lastSavedEntry || sim.ctx.lastSavedEntry.id !== savedId) return ok(false, 'ctx.lastSavedEntry must be recorded after the verified save');
  const r4 = sim.send('Isko Remove Kardo Me Bus Check Kar Rha Tha');
  if (r4.kind !== 'action' || r4.action.kind !== 'delete_entry') return ok(false, `"Isko remove kardo" must be a delete preview, got kind=${r4.kind} intent=${r4.intent} text=${T(r4.text).slice(0, 160)}`);
  if (r4.action.targetId !== savedId) return ok(false, `delete target must be the just-saved entry ${savedId}, got ${r4.action.targetId}`);
  if (!/600/.test((r4.previewLines || []).join(' ')) || !/Aadhaar/.test((r4.previewLines || []).join(' '))) return ok(false, `delete preview must show the ₹600 Aadhaar entry, got: ${(r4.previewLines || []).join(' | ')}`);
  if (sim.state.dailyEntries.length !== 1) return ok(false, 'preview must NOT delete anything yet');
  const r5 = sim.send('Ha');
  if (r5.kind !== 'result' || !r5.exec.ok || !r5.verified) return ok(false, `delete confirm should delete+verify, got kind=${r5.kind} verified=${r5.verified}`);
  if (sim.state.dailyEntries.length !== 0 || sim.state.cashTxns.length !== 0) return ok(false, 'entry + linked txn must be gone after delete');
  if (upiToday(sim.state, sim.p1) !== 0) return ok(false, `UPI collection must be back to ₹0, got ${upiToday(sim.state, sim.p1)}`);
  if (!sim.state.recycle.some((r) => r.kind === 'DailyEntry' && /Aadhaar/.test(r.label))) return ok(false, 'deleted entry must be in the Recycle Bin');
  if (!sim.state.audit.some((a) => a.action === 'delete' && a.entity === 'DailyEntry')) return ok(false, 'audit log must have the delete entry');
  if (sim.ctx.lastSavedEntry) return ok(false, 'ctx.lastSavedEntry must be cleared after the verified delete');
  return ok(true);
});

// (a2) second "isko remove" after the delete: honest, no double-delete
C('a2-double-isko', 'A second "Isko remove kardo" after the delete is an honest "already gone" — never a second fake success', () => {
  const sim = new Sim();
  sim.send('Aaj Aadhar Card Ka Biometric Ka Customer Aaya 600 Ka Payment Leke');
  sim.send('Upi');
  sim.send('Ha');
  sim.send('Isko Remove Kardo');
  const del = sim.send('Ha');
  if (!del.exec.ok) return ok(false, 'setup delete failed');
  const r = sim.send('Isko remove kardo');
  if (r.kind === 'action') return ok(false, 'second isko must NOT produce another delete action');
  if (/hata diya|delete kar diya|deleted/i.test(T(r.text))) return ok(false, `must not claim a deletion: ${T(r.text).slice(0, 140)}`);
  if (!/nahi hai|pehle hi|Recycle Bin/i.test(T(r.text))) return ok(false, `must say honestly the entry is already gone: ${T(r.text).slice(0, 140)}`);
  return ok(true);
});

// (b) bare delete
C('b-bare-delete', '"Hatana hai" (no amount, no isko) → clarification listing recent candidates, never a cloud-style success claim', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Xerox', 30000, 'cash', 'x300');
  seedEntry(sim.state, sim.p1, 'Printing', 20000, 'upi', 'p200');
  const before = JSON.stringify([sim.state.dailyEntries, sim.state.cashTxns]);
  const r = sim.send('Hatana hai');
  if (r.kind === 'action') return ok(false, 'bare delete must NOT silently produce a delete action');
  if (!r.draftQuestion || !/Xerox/.test(T(r.text)) || !/Printing/.test(T(r.text))) return ok(false, `must list recent candidates, got: ${T(r.text).slice(0, 200)}`);
  if (/hata diya|delete kar diya|deleted|save ho gaya/i.test(T(r.text))) return ok(false, `must never claim success: ${T(r.text).slice(0, 140)}`);
  if (r.intent === 'general' || r.intent === 'unknown' || r.cloudNeeded) return ok(false, `must be handled locally as business_action, got intent=${r.intent} cloudNeeded=${r.cloudNeeded}`);
  if (JSON.stringify([sim.state.dailyEntries, sim.state.cashTxns]) !== before) return ok(false, 'state must not move on a clarification');
  // Pick candidate 1 by number, confirm, verify only that one is gone.
  const r2 = sim.send('1');
  if (r2.kind !== 'action' || r2.action.kind !== 'delete_entry') return ok(false, `picking "1" must give a delete preview, got kind=${r2.kind}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok) return ok(false, 'confirm of picked candidate must delete');
  if (sim.state.dailyEntries.length !== 1 || sim.state.dailyEntries[0].service !== 'Xerox') return ok(false, 'only the picked entry (candidate 1 = most recent, Printing) must be deleted; Xerox must remain');
  return ok(true);
});

// (c) amount form still works
C('c-amount-form', '"Aadhaar 600 wali entry delete kar do" (amount form) still works', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Aadhaar Services', 60000, 'upi', 'a600');
  const r = sim.send('Aadhaar 600 wali entry delete kar do');
  if (r.kind !== 'action' || r.action.kind !== 'delete_entry') return ok(false, `expected delete action, got kind=${r.kind} text=${T(r.text).slice(0, 140)}`);
  const r2 = sim.send('Ha');
  if (!r2.exec.ok || sim.state.dailyEntries.length !== 0 || upiToday(sim.state, sim.p1) !== 0) return ok(false, 'delete must remove the entry and zero the UPI collection');
  return ok(true);
});

// (d) two same-amount entries → disambiguation
C('d-same-amount', 'Delete with 2 same-amount entries → disambiguation list, then the picked one only is deleted', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Xerox', 60000, 'cash', 'x600');
  seedEntry(sim.state, sim.p1, 'Printing', 60000, 'upi', 'p600');
  const r = sim.send('600 wali entry delete kar do');
  if (r.kind === 'action') return ok(false, 'ambiguous delete must NOT pick one silently');
  if (!r.draftQuestion || !/Xerox/.test(T(r.text)) || !/Printing/.test(T(r.text))) return ok(false, `must list both ₹600 entries, got: ${T(r.text).slice(0, 200)}`);
  const r2 = sim.send('2');
  if (r2.kind !== 'action' || r2.action.kind !== 'delete_entry' || !/Printing/.test((r2.previewLines || []).join(' '))) return ok(false, `picking "2" must preview the Printing entry, got: ${(r2.previewLines || []).join(' | ')}`);
  const r3 = sim.send('Ha');
  if (!r3.exec.ok) return ok(false, 'confirm must delete');
  if (sim.state.dailyEntries.length !== 1 || sim.state.dailyEntries[0].service !== 'Xerox') return ok(false, 'only Printing must be deleted; Xerox must remain');
  return ok(true);
});

// (e) non-existent amount
C('e-nonexistent', 'Delete a non-existent amount → honest "koi entry nahi mili", nothing deleted', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Xerox', 30000, 'cash', 'x300');
  const r = sim.send('Xerox 9999 wali entry delete kar do');
  if (r.kind === 'action') return ok(false, 'must not produce a delete action for a missing entry');
  if (!/koi entry nahi mili/i.test(T(r.text))) return ok(false, `must say honestly no entry was found, got: ${T(r.text).slice(0, 160)}`);
  if (sim.state.dailyEntries.length !== 1) return ok(false, 'state must not move');
  return ok(true);
});

// (f) correction still works
C('f-correction', '"Galat tha" correction still works (Xerox 300 → 250)', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Xerox', 30000, 'cash', 'x300');
  const r = sim.send('Xerox 300 galat tha, 250 hona chahiye');
  if (r.kind !== 'action' || r.action.kind !== 'correct_entry' || r.action.newAmountPaise !== 25000) return ok(false, `expected correct_entry to 25000, got kind=${r.kind} text=${T(r.text).slice(0, 140)}`);
  const r2 = sim.send('Ha');
  if (!r2.exec.ok || sim.state.dailyEntries[0].totalPaise !== 25000) return ok(false, 'correction must change the entry to ₹250');
  return ok(true);
});

// (g) no contradiction after a verified save
C('g-no-contradiction', 'A general question right after a verified save must not contradict it', () => {
  const sim = new Sim();
  sim.send('Aaj Aadhar Card Ka Biometric Ka Customer Aaya 600 Ka Payment Leke');
  sim.send('Upi');
  const saved = sim.send('Ha');
  if (!saved.exec.ok) return ok(false, 'setup save failed');
  const r1 = sim.send('Maine kya save kiya tha?');
  if (!/600|Aadhaar/.test(T(r1.text))) return ok(false, `must ground the answer in the verified save, got: ${T(r1.text).slice(0, 160)}`);
  if (/save nahi|koi entry.*nahi|pehle se/i.test(T(r1.text))) return ok(false, `must never contradict the save: ${T(r1.text).slice(0, 160)}`);
  const r2 = sim.send('Kaise ho bhai?');
  if (/save nahi|pehle se|koi record nahi/i.test(T(r2.text))) return ok(false, `casual reply must not drag in false record talk: ${T(r2.text).slice(0, 160)}`);
  if (r2.intent !== 'casual') return ok(false, `greeting must stay casual, got intent=${r2.intent}`);
  // And with NO save in the conversation, the same question is honest.
  const sim2 = new Sim();
  const r3 = sim2.send('Maine kya save kiya tha?');
  if (!/koi entry save nahi hui/i.test(T(r3.text))) return ok(false, `with no save it must say so plainly, got: ${T(r3.text).slice(0, 160)}`);
  return ok(true);
});

// (h) cloud guard, driven directly
C('h-cloud-guard', 'Cloud-guard: fabricated success/contradiction claims are blocked and replaced; benign replies pass through', () => {
  const cases = [
    { text: 'Theek hai bhai, hata diya.', label: null, blocked: true, reason: 'financial_claim' },
    { text: 'Maine entry delete kar di hai.', label: null, blocked: true, reason: 'financial_claim' },
    { text: 'Saved — Aadhaar ₹600 save ho gaya.', label: null, blocked: true, reason: 'financial_claim' },
    { text: 'Maine koi entry save hi nahi ki thi, ₹600 pehle se tha.', label: 'Aadhaar Services ₹600.00 (upi)', blocked: true, reason: 'contradiction' },
    { text: 'हटा दिया, entry delete ho gayi.', label: null, blocked: true, reason: 'financial_claim' },
    { text: 'Namaste! Aaj ka din kaisa raha? Batao, kya help chahiye?', label: null, blocked: false, reason: null },
    { text: 'Aapki entry Daily Business mein dikh rahi hai.', label: null, blocked: false, reason: null },
    { text: 'Theek hai, preview dikhaunga, confirm ke baad save hoga.', label: null, blocked: false, reason: null },
  ];
  for (const c of cases) {
    const g = convai.guardCloudReply(c.text, { verifiedSaveLabel: c.label });
    if (g.blocked !== c.blocked) return ok(false, `guard("${c.text.slice(0, 40)}") blocked=${g.blocked}, expected ${c.blocked}`);
    if (c.blocked && g.reason !== c.reason) return ok(false, `guard reason=${g.reason}, expected ${c.reason}`);
    if (c.blocked) {
      if (convai.claimsFinancialAction(g.text)) return ok(false, `replacement still claims a financial action: ${g.text.slice(0, 120)}`);
      if (c.label && convai.contradictsVerifiedSave(g.text)) return ok(false, `replacement still contradicts the save: ${g.text.slice(0, 120)}`);
      if (!/Daily Business|Recycle Bin/.test(g.text)) return ok(false, `replacement must give the exact manual path: ${g.text.slice(0, 140)}`);
    } else if (g.text !== c.text) {
      return ok(false, 'benign reply must pass through unchanged');
    }
  }
  if (!convai.claimsFinancialAction('Entry delete kar diya.')) return ok(false, 'claimsFinancialAction must catch a delete claim');
  if (convai.claimsFinancialAction('Preview dikhaunga, confirm ke baad save hoga.')) return ok(false, 'future-tense "save hoga" must NOT be flagged');
  // System prompt must forbid the fabrication in the first place.
  const prompt = convai.buildSystemPrompt({
    lang: 'hi', langName: 'Hinglish', profileName: 'Al Falah Communication',
    category: 'Cyber Cafe / CSC Center', services: ['Xerox'],
    factsSummary: 'Today: income 0 paise.',
    contextNote: 'VERIFIED SAVE (never contradict): Saved and verified: Aadhaar Services ₹600.00 (upi) (2026-11-27) — never say it was never saved.',
  });
  if (!/hata diya/.test(prompt) || !/NEVER claim one was saved, deleted/.test(prompt)) return ok(false, 'system prompt must forbid save/delete claims');
  if (!/VERIFIED SAVE/.test(prompt)) return ok(false, 'system prompt must carry the verified-save fact');
  if (convai.DEFAULT_MODEL !== 'gemini-3.5-flash-lite') return ok(false, `model must stay gemini-3.5-flash-lite, got ${convai.DEFAULT_MODEL}`);
  return ok(true);
});

// Regression: "Khata" must never be read as "hata" (delete)
C('r1-khata-not-delete', 'Regression: "Customer Khata kholo" is navigation, NOT a delete', () => {
  const sim = new Sim();
  const r = sim.send('Customer Khata kholo');
  if (r.kind !== 'navigation' || r.navigateTo !== '/customer-khata') return ok(false, `expected navigation to /customer-khata, got kind=${r.kind} intent=${r.intent} nav=${r.navigateTo}`);
  if (intentLib.classifyIntent('Customer Khata kholo', {}, sim.p1.services) === 'business_action') return ok(false, 'classifier must not route Khata to business_action');
  return ok(true);
});

// Regression: how-to-delete is app help, not a delete action
C('r2-how-to-delete', 'Regression: "Entry kaise delete karu?" is help, not a delete action', () => {
  const sim = new Sim();
  seedEntry(sim.state, sim.p1, 'Xerox', 30000, 'cash', 'x300');
  const r = sim.send('Entry kaise delete karu?');
  if (r.kind === 'action' || r.draftQuestion) return ok(false, `how-to must not produce an action/draft, got kind=${r.kind}`);
  if (sim.state.dailyEntries.length !== 1) return ok(false, 'state must not move');
  return ok(true);
});

// Regression: add flow + checklist offer + "Ha" follow-up still work
C('r3-keep-what-works', 'Regression: add flow, checklist offer + "Ha", and service-only delete keep working', () => {
  const sim = new Sim();
  const r1 = sim.send('Aaj Xerox ke 300 cash hue');
  if (r1.kind !== 'action' || r1.action.kind !== 'daily_income' || r1.totalPaise !== 30000) return ok(false, `add flow broken: kind=${r1.kind} total=${r1.totalPaise}`);
  if (cashToday(sim.state, sim.p1) !== 0) return ok(false, 'preview must not save');
  const sim2 = new Sim();
  const p1 = sim2.send('Kal Pan Card banane hai');
  if (p1.intent !== 'plan' || !/checklist/i.test(T(p1.text))) return ok(false, `plan must offer a checklist, got intent=${p1.intent}`);
  const p2 = sim2.send('Ha');
  if (p2.intent !== 'accept_offer' || p2.kind !== 'checklist') return ok(false, `bare "Ha" must accept the checklist offer, got intent=${p2.intent} kind=${p2.kind}`);
  // Service-only delete: "Xerox wali entry delete kar do" (no amount).
  const sim3 = new Sim();
  seedEntry(sim3.state, sim3.p1, 'Xerox', 30000, 'cash', 'x300');
  const d1 = sim3.send('Xerox wali entry delete kar do');
  if (d1.kind !== 'action' || d1.action.kind !== 'delete_entry') return ok(false, `service-only delete must preview, got kind=${d1.kind} text=${T(d1.text).slice(0, 120)}`);
  return ok(true);
});

// ---------------------------------------------------------------- runner
const results = [];
let passed = 0;
for (const c of CASES) {
  let v;
  try {
    v = c.run();
  } catch (e) {
    v = { ok: false, detail: `threw: ${e && e.message ? e.message : String(e)}` };
  }
  const okk = v === true || (v && v.ok === true);
  if (okk) passed++;
  results.push({ id: c.id, title: c.title, pass: okk, detail: v && v.detail ? String(v.detail) : '' });
  console.log(`  ${okk ? 'PASS' : 'FAIL'} [${c.id}] ${c.title}${v && v.detail ? ' — ' + v.detail : ''}`);
}
const rate = Math.round((passed / CASES.length) * 1000) / 10;
console.log(`\nUPDATE 23 acceptance: ${passed}/${CASES.length} (${rate}%)`);
fs.writeFileSync(
  path.join(root, 'tests', 'update23-results.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), total: CASES.length, passed, rate, cases: results }, null, 2),
);
console.log('Wrote tests/update23-results.json');
if (passed !== CASES.length) {
  console.error(`ACCEPTANCE NOT MET: ${passed}/${CASES.length} passed (need 100%)`);
  process.exit(1);
}
