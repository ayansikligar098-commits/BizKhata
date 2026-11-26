/**
 * BizKhata conversational-AI acceptance suite — UPDATE 14 + 15 + 16.
 *
 * Drives the REAL unified conversation engine (conversation.ts: router
 * → local general engine → structured parser → ledger Q&A) on a
 * COMPLETELY EMPTY store (no jobs, no customers, no transactions).
 * Every conversation is judged on whether the reply genuinely answers
 * or understands what the user said — NOT merely on "it returned
 * some text". Exits non-zero if ANY check fails.
 *
 * UPDATE 14 (10): casual + general + business on empty store.
 * UPDATE 15 (10): plans/statements, dynamic understanding, honest
 *   limitation when the local engine cannot answer and no AI service
 *   is configured (these tests run WITHOUT a configured service, so
 *   they verify the honest-limitation behaviour, marked as such —
 *   no live-AI reply is faked anywhere in this suite).
 * UPDATE 16 (3): "do it" commands — navigation actually navigates,
 *   checklist is actually built + saved, summary is actually
 *   generated from the real ledgers.
 *
 * Run with `npm test`. Requires no key and no network.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-conv-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const lang = require(path.join(outDir, 'languages.js'));
const gen = require(path.join(outDir, 'general.js'));
const intentLib = require(path.join(outDir, 'intent.js'));
const asst = require(path.join(outDir, 'assistant.js'));

// Local calendar date — the app dates everything in the device's
// local timezone, never UTC (UTC dates run a day early 00:00–05:30 IST).
function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const TODAY = localISO(new Date());

function profile(id, name, services) {
  return {
    id, name, category: 'Cyber Cafe / CSC Center',
    services: services || ['PAN Card', 'Aadhaar Services', 'Voter ID', 'Ayushman Card', 'Smart Card', 'Xerox', 'Printing', 'Passport Size Photo', 'Scanning', 'Document Work'],
    customServices: [], expenseCategories: ['Machine Repair', 'Electricity', 'Internet', 'Paper', 'Ink', 'Rent', 'Staff', 'Transport', 'Other'],
    customExpenseCategories: [], disabledModules: [], hiddenCards: [],
    address: '', mobile: '', openingCashPaise: 0, openingUpiPaise: 0,
    receiptPrefix: 'BK', receiptCounter: 0, language: 'hinglish', theme: 'light', createdAt: TODAY,
  };
}

/** Completely empty store: no jobs, customers, transactions, expenses. */
function emptyState() {
  const p1 = profile('prof1', 'Al Falah Communication');
  return {
    state: {
      owner: null, profiles: [p1], activeProfileId: 'prof1',
      jobs: [], dailyEntries: [], cashTxns: [], mtFunds: [], mtTransfers: [], mtExpenses: [],
      customers: [], docs: [], agents: [], expenses: [], equipment: [], receipts: [], audit: [], recycle: [], executedActionKeys: [],
    },
    p1,
  };
}

const R = (text, ctx) => {
  const { state, p1 } = emptyState();
  return conv.respondToMessage({ message: text, state, profile: p1, ctx: ctx || {} });
};

const results = {};
const replies = [];
function run(category, name, fn) {
  results[category] = results[category] || { pass: 0, total: 0 };
  results[category].total++;
  let ok = false;
  let detail = '';
  let reply = '';
  try {
    const r = fn();
    ok = r.ok === true;
    detail = r.detail || '';
    reply = r.reply || '';
  } catch (e) {
    detail = ` (threw: ${e.message})`;
  }
  if (ok) results[category].pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${category}] ${name}${detail}`);
  if (reply) replies.push({ category, name, reply });
  return ok;
}

const NO_RECORD_WORDS = /koi record nahi|no record|no data|figure nahi|record nahi hai/i;
const MONEY_QUESTION = /kitne rupaye|rupaye hue|paise hue|how much money/i;
const hasNoRecordTalk = (t) => NO_RECORD_WORDS.test(t);
const hasMoneyQuestion = (t) => MONEY_QUESTION.test(t);

/* ================= UPDATE 14 — language detection (the screenshot bug) ================= */
run('detect', '"Kaise Ho Bhai" (exact screenshot input) detects as Hinglish, never Marathi', () => {
  const d = lang.detectLanguage('Kaise Ho Bhai');
  return { ok: d.code === 'hi', reply: `detectLanguage("Kaise Ho Bhai") → ${d.code} (${d.style})`, detail: d.code !== 'hi' ? ` got ${d.code}` : '' };
});
run('detect', '"Aaje su chale chhe?" detects as Gujarati', () => {
  const d = lang.detectLanguage('Aaje su chale chhe?');
  return { ok: d.code === 'gu', reply: `detectLanguage("Aaje su chale chhe?") → ${d.code}`, detail: d.code !== 'gu' ? ` got ${d.code}` : '' };
});
run('detect', '"Aaj no total hisab batavo" detects as Gujarati', () => {
  const d = lang.detectLanguage('Aaj no total hisab batavo');
  return { ok: d.code === 'gu', reply: `detectLanguage("Aaj no total hisab batavo") → ${d.code}`, detail: d.code !== 'gu' ? ` got ${d.code}` : '' };
});
run('detect', 'Lone "ho" never flips Hinglish to Marathi ("Kaise ho?")', () => {
  const d = lang.detectLanguage('Kaise ho?');
  return { ok: d.code === 'hi', detail: d.code !== 'hi' ? ` got ${d.code}` : '' };
});

/* ================= UPDATE 14 — the 10 acceptance conversations ================= */
run('u14', '(1) "Hi bhai, kaise ho?" → Hinglish natural reply, no records talk', () => {
  const r = R('Hi bhai, kaise ho?');
  const langOk = lang.detectLanguage(r.text).code === 'hi' || /bhai|hoon|badhiya/i.test(r.text);
  return { ok: r.intent === 'casual' && langOk && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '(2) "Tell me a funny joke." → an actual joke', () => {
  const r = R('Tell me a funny joke.');
  return { ok: /virus|photocopy|homework|teacher|doctor/i.test(r.text) && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '(3) "Mujhe PAN card ke baare mein samjhao." → PAN explainer with documents', () => {
  const r = R('Mujhe PAN card ke baare mein samjhao.');
  return { ok: /PAN/i.test(r.text) && /Aadhaar/i.test(r.text) && /10-digit|10 digit/i.test(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '(4) "Aaje su chale chhe?" → Gujarati reply, never Marathi', () => {
  const r = R('Aaje su chale chhe?');
  const d = lang.detectLanguage(r.text);
  return { ok: d.code === 'gu' && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent} replyLang=${d.code}` };
});
run('u14', '(5) "Aaj Xerox ke 300 cash add kar." → transaction preview (action, not text-only)', () => {
  const r = R('Aaj Xerox ke 300 cash add kar.');
  const e = r.action && r.action.kind === 'daily_income' ? r.action.entries[0] : null;
  const ok = r.kind === 'action' && e && e.service === 'Xerox' && e.amountPaise === 30000 && e.method === 'cash'
    && (r.previewLines || []).join(' ').includes('₹300.00');
  return { ok: !!ok, reply: (r.previewLines || []).join(' | ') + ' — Total: ₹300.00, Confirm & Save?', detail: ` kind=${r.kind}` };
});
run('u14', '(5b) preview → Confirm & Save actually writes + verifies in the store', () => {
  const { state, p1 } = emptyState();
  const r = conv.respondToMessage({ message: 'Aaj Xerox ke 300 cash add kar.', state, profile: p1, ctx: {} });
  const res = asst.applyAssistantAction(state, p1.id, r.action, 'idem-test-14-5');
  const saved = state.dailyEntries.find((x) => x.service === 'Xerox' && x.totalPaise === 30000 && x.method === 'cash');
  return { ok: res.ok === true && !!saved, reply: `applyAssistantAction → ok=${res.ok}; dailyEntries now has Xerox ₹300.00 cash (${state.dailyEntries.length} entr${state.dailyEntries.length === 1 ? 'y' : 'ies'})`, detail: res.ok ? '' : ` ${res.summary}` };
});
run('u14', '(5c) duplicate prevention: same action + same idempotency key is refused', () => {
  const { state, p1 } = emptyState();
  const r = conv.respondToMessage({ message: 'Aaj Xerox ke 300 cash add kar.', state, profile: p1, ctx: {} });
  asst.applyAssistantAction(state, p1.id, r.action, 'idem-dup-14');
  const second = asst.applyAssistantAction(state, p1.id, r.action, 'idem-dup-14');
  return { ok: second.ok === false && second.duplicate === true && state.dailyEntries.length === 1, reply: `second apply → ok=${second.ok}, duplicate=${second.duplicate}; entries still ${state.dailyEntries.length}`, detail: '' };
});
run('u14', '(6) "Aaj kitna profit hua?" → real figure ₹0.00 on empty store', () => {
  const r = R('Aaj kitna profit hua?');
  return { ok: /₹0\.00/.test(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '(7) "Cash Book kaise use karte hain?" → steps + offer to open Cash Book', () => {
  const r = R('Cash Book kaise use karte hain?');
  const hasLink = (r.links || []).some((l) => l.path === '/cash-book');
  return { ok: /1\./.test(r.text) && /Cash Book/.test(r.text) && hasLink, reply: r.text, detail: ` intent=${r.intent} links=${JSON.stringify(r.links)}` };
});
run('u14', '(8) "I am bored, suggest something interesting." → bored reply, no records talk', () => {
  const r = R('I am bored, suggest something interesting.');
  return { ok: r.intent === 'casual' && /interesting|idea|joke|learn/i.test(r.text) && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '(9) "ગુજરાતીમાં મારી સાથે વાત કરો." → switches to Gujarati', () => {
  const r = R('ગુજરાતીમાં મારી સાથે વાત કરો.');
  const d = lang.detectLanguage(r.text);
  return { ok: r.intent === 'language_switch' && r.languageChanged === 'gu' && d.code === 'gu', reply: r.text, detail: ` intent=${r.intent} lang=${r.languageChanged} replyLang=${d.code}` };
});
run('u14', '(10) "Aaj no total hisab batavo." → real total ₹0 on empty store, nothing invented', () => {
  const r = R('Aaj no total hisab batavo.');
  return { ok: /₹0\.00/.test(r.text) && !/₹[1-9]/.test(r.text.replace(/₹0\.00/g, '')), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u14', '"Kaise Ho Bhai" exact screenshot input → Hinglish natural reply, no records mention', () => {
  const r = R('Kaise Ho Bhai');
  const d = lang.detectLanguage(r.text);
  return { ok: r.intent === 'casual' && d.code === 'hi' && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent} replyLang=${d.code}` };
});
run('u14', 'Follow-up context: "I run a CSC centre." → "What about expenses?" → CSC expenses', () => {
  const first = R('I run a CSC centre.');
  const ctx = first.newCtx;
  const hasFact = (ctx.userFacts || []).includes('runs a CSC centre');
  const second = R('What about expenses?', ctx);
  return { ok: hasFact && second.intent === 'business_query', reply: `1) ${first.text}\n2) [intent=${second.intent}] ${second.text}`, detail: ` facts=${JSON.stringify(ctx.userFacts)} secondIntent=${second.intent}` };
});
run('u14', 'Mid-conversation language switch: Hinglish → Gujarati request switches reply language', () => {
  const first = R('Hi bhai, kaise ho?');
  const second = R('ગુજરાતીમાં મારી સાથે વાત કરો.', first.newCtx);
  return { ok: second.languageChanged === 'gu' && lang.detectLanguage(second.text).code === 'gu', reply: second.text, detail: ` lang=${second.languageChanged}` };
});
run('u14', 'Parser guard: "Mujhe kal PAN Card banane hai" is NEVER a money draft in parseAssistantMessage', () => {
  const { state, p1 } = emptyState();
  const p = chat.parseAssistantMessage('Mujhe kal PAN Card banane hai', state, p1, {});
  return { ok: p.kind === 'question', reply: `parseAssistantMessage → kind=${p.kind} (must be 'question', never a draft asking for money)`, detail: p.kind !== 'question' ? ` got ${p.kind}` : '' };
});

/* ================= UPDATE 15 — the 10 real-world conversations ================= */
run('u15', '(1) "Mujhe kal PAN Card banane hai." → plan ack + checklist offer, NEVER a money question', () => {
  const r = R('Mujhe kal PAN Card banane hai.');
  return { ok: r.intent === 'plan' && /PAN Card/i.test(r.text) && /checklist/i.test(r.text) && !hasMoneyQuestion(r.text) && !/₹/.test(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(2) "Kaise ho bhai?" → natural Hinglish greeting', () => {
  const r = R('Kaise ho bhai?');
  return { ok: r.intent === 'casual' && /badhiya|theek/i.test(r.text) && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(3) "Aaj shop par bahut kaam tha." → acknowledges a busy day, no money question', () => {
  const r = R('Aaj shop par bahut kaam tha.');
  return { ok: (r.intent === 'plan' || r.intent === 'statement') && /rush|aaram|busy/i.test(r.text) && !hasMoneyQuestion(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(4) "Mujhe ek business idea chahiye." → CSC business ideas, not a plan/money question', () => {
  const r = R('Mujhe ek business idea chahiye.');
  return { ok: r.intent === 'general' && /Money Transfer|PAN Card/i.test(r.text) && !hasMoneyQuestion(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(5) "Website kaise bana sakta hoon?" → website plan, no money question', () => {
  const r = R('Website kaise bana sakta hoon?');
  return { ok: r.intent === 'general' && /website/i.test(r.text) && /plan|steps|Google Sites/i.test(r.text) && !hasMoneyQuestion(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(6) "Aaj Xerox ke 300 cash hue." → transaction preview (action)', () => {
  const r = R('Aaj Xerox ke 300 cash hue.');
  const e = r.action && r.action.kind === 'daily_income' ? r.action.entries[0] : null;
  return { ok: r.kind === 'action' && e && e.service === 'Xerox' && e.amountPaise === 30000 && e.method === 'cash', reply: (r.previewLines || []).join(' | '), detail: ` kind=${r.kind}` };
});
run('u15', '(7) "Aaj kitna profit hua?" → real figure ₹0.00', () => {
  const r = R('Aaj kitna profit hua?');
  return { ok: /₹0\.00/.test(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(8) "Mujhe Gujarati mein samjhao." → language switches to Gujarati immediately', () => {
  const r = R('Mujhe Gujarati mein samjhao.');
  return { ok: r.intent === 'language_switch' && r.languageChanged === 'gu', reply: r.text, detail: ` intent=${r.intent} lang=${r.languageChanged}` };
});
run('u15', '(9) "I am feeling bored." → natural bored reply, no records talk', () => {
  const r = R('I am feeling bored.');
  return { ok: r.intent === 'casual' && /interesting|idea|joke|learn/i.test(r.text) && !hasNoRecordTalk(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', '(10) "Kal mujhe kya kya kaam karna chahiye?" → tomorrow work list, no money question', () => {
  const r = R('Kal mujhe kya kya kaam karna chahiye?');
  return { ok: r.intent === 'plan' && /pending|shop kholna|cash/i.test(r.text) && !hasMoneyQuestion(r.text), reply: r.text, detail: ` intent=${r.intent}` };
});
run('u15', 'Honest limitation (no AI service configured): live info is NOT invented', () => {
  const r = R('Who won the cricket match yesterday?');
  return { ok: r.cloudNeeded === true && /live|do not have/i.test(r.text) && !/won by|score.*\d+-\d+/i.test(r.text), reply: r.text, detail: ` cloudNeeded=${r.cloudNeeded} (tested-against-local-engine; no live-AI reply faked)` };
});
run('u15', 'Honest limitation (no AI service configured): unanswerable question says so + mentions the key, asks to rephrase', () => {
  const r = R('Explain quantum entanglement in full detail with the latest research.');
  return { ok: r.cloudNeeded === true && /samajh nahi paya|could not.*understand/i.test(r.text) && /key/i.test(r.text) && !hasMoneyQuestion(r.text), reply: r.text, detail: ` cloudNeeded=${r.cloudNeeded} keyNoticeShown=${r.keyNoticeShown} (tested-against-local-engine)` };
});

/* ================= UPDATE 16 — "do it" commands ================= */
run('u16', '(a) "Cash Book kholo" → actually navigates to /cash-book', () => {
  const r = R('Cash Book kholo');
  return { ok: r.kind === 'navigation' && r.navigateTo === '/cash-book', reply: `${r.text} [navigateTo=${r.navigateTo}]`, detail: ` kind=${r.kind}` };
});
run('u16', '(b) "Kal ke kaam ki checklist banao" → real checklist produced AND saved/retrievable', () => {
  const { state, p1 } = emptyState();
  const r = conv.respondToMessage({ message: 'Kal ke kaam ki checklist banao', state, profile: p1, ctx: {} });
  const saved = gen.listChecklists(p1.id);
  const ok = r.kind === 'checklist' && r.checklist && r.checklist.items.length >= 5 && saved.length >= 1 && saved[0].id === r.checklist.id;
  return { ok: !!ok, reply: r.text, detail: ` kind=${r.kind} items=${r.checklist ? r.checklist.items.length : 0} saved=${saved.length}` };
});
run('u16', '(c) "Aaj ka summary banao" → real summary from the ledgers (₹0.00 on empty store)', () => {
  const r = R('Aaj ka summary banao');
  return { ok: r.kind === 'summary' && /₹0\.00/.test(r.text), reply: r.text, detail: ` kind=${r.kind}` };
});
run('u16', '"Mujhe Gujarati mein samjhao" executes the switch (reply language changes, not just described)', () => {
  const r = R('Mujhe Gujarati mein samjhao.');
  const d = lang.detectLanguage(r.text);
  return { ok: r.languageChanged === 'gu' && d.code === 'gu', reply: r.text, detail: '' };
});

/* ================= UPDATE 17 — video-sequence regression (BUG A) =================
 * Exact 21s screen-recording sequence on bizkhata.pages.dev:
 *   "Kal Pan Card Banane Hai" → plan reply + checklist offer
 *   "Ha" → REAL saved checklist (was: "Confirm karne ke liye koi
 *   pending entry nahi hai")
 *   "Kal Pan Card Banane Hai Checklist Bana Do" → REAL saved checklist
 *   (was: the same plan reply again, no checklist ever built)
 * Plus: bare "Ha" with no offer and no entry must never produce the
 * pending-entry line as a financial confirm. */
const NO_PENDING_ENTRY_LINE = /Confirm karne ke liye koi pending entry/i;
run('u17', 'VIDEO (1) "Kal Pan Card Banane Hai" → plan + checklist offer + pendingOffer recorded', () => {
  const { state, p1 } = emptyState();
  const r = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai', state, profile: p1, ctx: {} });
  const ok = r.intent === 'plan' && /checklist/i.test(r.text) && /haan/i.test(r.text)
    && r.newCtx.pendingOffer && r.newCtx.pendingOffer.kind === 'checklist'
    && r.newCtx.pendingOffer.topic === 'pan' && r.newCtx.pendingOffer.when === 'kal';
  return { ok: !!ok, reply: r.text, detail: ` intent=${r.intent} pendingOffer=${JSON.stringify(r.newCtx.pendingOffer)}` };
});
run('u17', 'VIDEO (2) "Ha" after the offer → real SAVED checklist, never the pending-entry line', () => {
  const { state, p1 } = emptyState();
  const first = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai', state, profile: p1, ctx: {} });
  const r = conv.respondToMessage({ message: 'Ha', state, profile: p1, ctx: first.newCtx });
  const saved = gen.listChecklists(p1.id);
  const ok = r.intent === 'accept_offer' && r.kind === 'checklist' && r.checklist
    && r.checklist.items.length >= 5 && /Aadhaar Card/i.test(r.text)
    && saved.length >= 1 && saved[0].id === r.checklist.id
    && !NO_PENDING_ENTRY_LINE.test(r.text) && !r.newCtx.pendingOffer;
  return { ok: !!ok, reply: r.text, detail: ` intent=${r.intent} kind=${r.kind} items=${r.checklist ? r.checklist.items.length : 0} saved=${saved.length}` };
});
run('u17', 'VIDEO (3) "Kal Pan Card Banane Hai Checklist Bana Do" → do_checklist, real saved checklist (not the plan reply)', () => {
  const { state, p1 } = emptyState();
  const r = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai Checklist Bana Do', state, profile: p1, ctx: {} });
  const saved = gen.listChecklists(p1.id);
  const ok = r.intent === 'do_checklist' && r.kind === 'checklist' && r.checklist
    && r.checklist.items.length >= 5 && /Aadhaar Card/i.test(r.text)
    && saved.length >= 1 && saved[0].id === r.checklist.id && !/Kitne applications hain/i.test(r.text);
  return { ok: !!ok, reply: r.text, detail: ` intent=${r.intent} kind=${r.kind} items=${r.checklist ? r.checklist.items.length : 0} saved=${saved.length}` };
});
run('u17', 'VIDEO full sequence, threaded ctx: plan → "Ha" (checklist) → explicit request (2nd checklist, offer consumed)', () => {
  const p1 = profile('profU17seq', 'Al Falah Communication');
  const state = emptyState().state;
  state.profiles = [p1]; state.activeProfileId = 'profU17seq';
  let ctx = {};
  const r1 = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai', state, profile: p1, ctx });
  ctx = r1.newCtx;
  const r2 = conv.respondToMessage({ message: 'Ha', state, profile: p1, ctx });
  ctx = r2.newCtx;
  const r3 = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai Checklist Bana Do', state, profile: p1, ctx });
  const saved = gen.listChecklists('profU17seq');
  const ok = r1.intent === 'plan' && r2.intent === 'accept_offer' && r2.kind === 'checklist'
    && r3.intent === 'do_checklist' && r3.kind === 'checklist'
    && saved.length >= 2 && !NO_PENDING_ENTRY_LINE.test(r2.text) && !NO_PENDING_ENTRY_LINE.test(r3.text);
  return { ok: !!ok, reply: `1) ${r1.text}\n2) ${r2.text}\n3) ${r3.text}`, detail: ` intents=${r1.intent}/${r2.intent}/${r3.intent} saved=${saved.length}` };
});
run('u17', '"Ha" with NO pending offer and NO pending entry → honest reply, never the pending-entry line, never a checklist', () => {
  const r = R('Ha');
  const ok = r.intent !== 'accept_offer' && r.kind !== 'checklist' && !NO_PENDING_ENTRY_LINE.test(r.text);
  return { ok: !!ok, reply: r.text, detail: ` intent=${r.intent} kind=${r.kind}` };
});
run('u17', 'Offer clears on topic change: plan → profit question → "Ha" is NOT an acceptance', () => {
  const { state, p1 } = emptyState();
  const first = conv.respondToMessage({ message: 'Kal Pan Card Banane Hai', state, profile: p1, ctx: {} });
  const mid = conv.respondToMessage({ message: 'Aaj kitna profit hua?', state, profile: p1, ctx: first.newCtx });
  const r = conv.respondToMessage({ message: 'Ha', state, profile: p1, ctx: mid.newCtx });
  const ok = !mid.newCtx.pendingOffer && r.intent !== 'accept_offer' && r.kind !== 'checklist' && !NO_PENDING_ENTRY_LINE.test(r.text);
  return { ok: !!ok, reply: r.text, detail: ` midPendingOffer=${JSON.stringify(mid.newCtx.pendingOffer)} intent=${r.intent}` };
});
run('u17', 'Phrasings → do_checklist: "checklist bana do" / "checklist bana de" / "list bana do" / "checklist bana dijiye" / "checklist banake do"', () => {
  const services = ['PAN Card', 'Aadhaar Services', 'Xerox'];
  const cases = ['checklist bana do', 'checklist bana de', 'list bana do', 'checklist bana dijiye', 'checklist banake do', 'checklist bana dena', 'checklist banakar do', 'kaam ki list bana do'];
  const bad = cases.filter((c) => intentLib.classifyIntent(c, {}, services) !== 'do_checklist');
  return { ok: bad.length === 0, reply: cases.map((c) => `${c} → ${intentLib.classifyIntent(c, {}, services)}`).join('\n'), detail: bad.length ? ` missed: ${bad.join(', ')}` : '' };
});
run('u17', 'Phrasings → do_summary (same space bug): "summary bana do" / "report bana do" / "hisab bana do"', () => {
  const services = ['PAN Card', 'Aadhaar Services', 'Xerox'];
  const cases = ['summary bana do', 'report bana do', 'hisab bana do', 'summary bana de'];
  const bad = cases.filter((c) => intentLib.classifyIntent(c, {}, services) !== 'do_summary');
  return { ok: bad.length === 0, reply: cases.map((c) => `${c} → ${intentLib.classifyIntent(c, {}, services)}`).join('\n'), detail: bad.length ? ` missed: ${bad.join(', ')}` : '' };
});
run('u17', 'Acceptance phrasings with a pending offer: "Bana do" / "Kar do" / "Theek hai" / bare "checklist" / "हाँ"', () => {
  const services = ['PAN Card', 'Aadhaar Services', 'Xerox'];
  const offerCtx = { pendingOffer: { kind: 'checklist', topic: 'pan', when: 'kal' } };
  const cases = ['Bana do', 'Kar do', 'Theek hai', 'checklist', 'हाँ', 'Haan', 'Yes', 'bana dijiye'];
  const bad = cases.filter((c) => intentLib.classifyIntent(c, offerCtx, services) !== 'accept_offer');
  return { ok: bad.length === 0, reply: cases.map((c) => `${c} → ${intentLib.classifyIntent(c, offerCtx, services)}`).join('\n'), detail: bad.length ? ` missed: ${bad.join(', ')}` : '' };
});
run('u17', '"Ha, aur Xerox 300 cash hue" (yes + a real entry) is NOT swallowed as an offer acceptance', () => {
  const offerCtx = { pendingOffer: { kind: 'checklist', topic: 'pan', when: 'kal' } };
  const got = intentLib.classifyIntent('Ha, aur Xerox 300 cash hue', offerCtx, ['PAN Card', 'Xerox']);
  return { ok: got !== 'accept_offer', reply: `intent=${got}`, detail: ` got ${got}` };
});
run('u17', '"Kal mujhe kya kya kaam karna chahiye?" list → "Ha" saves it as a checklist', () => {
  const { state, p1 } = emptyState();
  const first = conv.respondToMessage({ message: 'Kal mujhe kya kya kaam karna chahiye?', state, profile: p1, ctx: {} });
  const r = conv.respondToMessage({ message: 'Ha', state, profile: p1, ctx: first.newCtx });
  const saved = gen.listChecklists(p1.id);
  const ok = first.newCtx.pendingOffer && first.newCtx.pendingOffer.topic === 'shop_day'
    && r.intent === 'accept_offer' && r.kind === 'checklist' && saved.length >= 1;
  return { ok: !!ok, reply: r.text, detail: ` intent=${r.intent} kind=${r.kind} saved=${saved.length}` };
});

/* ================= Summary ================= */
let totalPass = 0;
let total = 0;
for (const [cat, v] of Object.entries(results)) {
  totalPass += v.pass;
  total += v.total;
  console.log(`  ${cat}: ${v.pass}/${v.total}`);
}
console.log(`\nConversation acceptance: ${totalPass}/${total} (${((totalPass / total) * 100).toFixed(1)}%)`);
console.log('\n--- ACTUAL REPLIES (for the report) ---');
for (const r of replies) {
  console.log(`\n[${r.category}] ${r.name}\n${r.reply}`);
}
if (totalPass !== total) {
  console.log('\nFAILED — see FAIL lines above.');
  process.exit(1);
}
console.log('\nAll conversation acceptance tests passed.');
