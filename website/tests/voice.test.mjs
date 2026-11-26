/**
 * BizKhata voice acceptance suite — UPDATE 18.
 *
 * Drives the REAL conversational pipeline with SIMULATED transcripts
 * (text standing in for speech-recognition output) plus the real
 * VoiceController driven by fake recognition/synthesis objects.
 *
 * HONEST SCOPE: this VM has NO microphone, so no real voice
 * conversation is tested here. Every "voice" check below feeds a
 * transcript string into handleVoiceTranscript() / respondToMessage()
 * exactly as a real SpeechRecognition result would, and verifies the
 * ACTUAL backend/store operations (entries written, amounts, methods,
 * navigation targets, spoken-text queue) — never animations. The
 * things that remain unverified until a real device is used are
 * listed at the end of the run: live microphone recognition quality
 * per language, real-device TTS voices, and the live cloud-AI reply
 * (no key is configured on this VM; the cloud path is tested here
 * only against a stubbed endpoint).
 *
 * The 6 brief sentences are tested VERBATIM, plus natural-phrasing
 * variations (fragments, word-order swaps, slang, incomplete
 * sentences) — the assistant must understand the user's own way of
 * speaking; there is no fixed command grammar anywhere.
 *
 * Run with `npm test`. Requires no key and no network.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-voice-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/money.ts src/lib/accounting.ts src/lib/store.ts src/lib/categories.ts src/lib/routes.ts src/lib/languages.ts src/lib/chatbot.ts src/lib/knowledge.ts src/lib/assistant.ts src/lib/ai.ts src/lib/general.ts src/lib/intent.ts src/lib/conversation-ai.ts src/lib/conversation.ts src/lib/voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const conv = require(path.join(outDir, 'conversation.js'));
const chat = require(path.join(outDir, 'chatbot.js'));
const lang = require(path.join(outDir, 'languages.js'));
const asst = require(path.join(outDir, 'assistant.js'));
const acct = require(path.join(outDir, 'accounting.js'));
const cai = require(path.join(outDir, 'conversation-ai.js'));
const voice = require(path.join(outDir, 'voice.js'));

const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      customers: [], docs: [], agents: [{ id: 'agt1', profileId: 'prof1', name: 'Ramesh Bhai', mobile: '9876500010', type: 'Aadhaar Backend Agent', status: 'Active', notes: '' }], expenses: [], equipment: [], receipts: [], audit: [], recycle: [], executedActionKeys: [],
    },
    p1,
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
function has(t, ...needles) { return needles.some((n) => String(t).includes(n)); }
function hasNone(t, ...needles) { return !needles.some((n) => String(t).includes(n)); }

/** Simulate one voice turn: transcript → voice edge → pipeline. */
function voiceTurn(text, ctx, state, p1, confidence = 0.95) {
  const decision = voice.handleVoiceTranscript({ transcript: text, confidence, prev: null });
  if (decision.action !== 'send') return { decision, res: null };
  const res = conv.respondToMessage({ message: decision.text, state, profile: p1, ctx: ctx || {} });
  return { decision, res };
}

/* ================= Fake browser voice objects ================= */

class FakeRecognition {
  static instances = [];
  constructor() {
    this.startCalls = 0;
    this.stopped = false;
    this.lang = '';
    this.interimResults = false;
    this.continuous = false;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    FakeRecognition.instances.push(this);
  }
  start() { this.startCalls++; }
  stop() { this.stopped = true; }
  emitFinal(transcript, confidence = 0.95) {
    if (this.onresult) this.onresult([{ transcript, confidence, isFinal: true }]);
  }
  emitInterim(transcript) {
    if (this.onresult) this.onresult([{ transcript, confidence: 0.9, isFinal: false }]);
  }
  emitError(error) { if (this.onerror) this.onerror(error); }
  emitEnd() { if (this.onend) this.onend(); }
}

class FakeSynthesis {
  static voices = [
    { name: 'Google हिन्दी', lang: 'hi-IN', default: false },
    { name: 'Google Gujarati', lang: 'gu-IN', default: false },
    { name: 'Google US English', lang: 'en-US', default: true },
  ];
  constructor() {
    this.spoken = [];
    this.cancelCalls = 0;
    this.utterances = [];
    this.speaking = false;
  }
  speak(u) { this.spoken.push(u); this.utterances.push(u); this.speaking = true; }
  cancel() { this.cancelCalls++; this.speaking = false; }
  getVoices() { return FakeSynthesis.voices; }
  finishLast() {
    const u = this.utterances[this.utterances.length - 1];
    this.speaking = false;
    if (u && u.onend) u.onend();
  }
  fireBoundary(charIndex) {
    const u = this.utterances[this.utterances.length - 1];
    if (u && u.onboundary) u.onboundary(charIndex);
  }
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.voice = undefined;
    this.onend = null;
    this.onerror = null;
    this.onboundary = null;
  }
}

function makeController(synth, settings, opts = {}) {
  const events = { states: [], finals: [], interims: [], errors: [], speechEnds: 0, boundaries: [] };
  const ctrl = new voice.VoiceController(
    {
      createRecognition: () => new FakeRecognition(),
      synthesis: synth,
      createUtterance: (t) => new FakeUtterance(t),
      getSettings: () => settings,
      silenceTimeoutMs: opts.silenceTimeoutMs,
    },
    {
      onState: (s) => events.states.push(s),
      onFinalTranscript: (t, c) => events.finals.push({ text: t, confidence: c }),
      onInterimTranscript: (t) => events.interims.push(t),
      onError: (k) => events.errors.push(k),
      onSpeechEnd: () => events.speechEnds++,
      onBoundary: (i) => events.boundaries.push(i),
    },
  );
  return { ctrl, events };
}

console.log('BizKhata voice — UPDATE 18 (simulated transcripts; no microphone on this VM):');

/* ================= 1. Pure voice helpers ================= */
section('voice helpers (pure, no browser)');
{
  const voices = FakeSynthesis.voices;
  check('pickVoice exact lang gu-IN', voice.pickVoice(voices, 'gu-IN')?.name, 'Google Gujarati');
  check('pickVoice preferred name wins', voice.pickVoice(voices, 'gu-IN', 'Google हिन्दी')?.name, 'Google हिन्दी');
  check('pickVoice prefix hi matches hi-IN', voice.pickVoice(voices, 'hi')?.name, 'Google हिन्दी');
  check('pickVoice unknown lang falls back to default', voice.pickVoice(voices, 'fr-FR')?.name, 'Google US English');
  check('pickVoice empty list', voice.pickVoice([], 'hi-IN'), undefined);
  check('cleanSpokenText strips markdown', voice.cleanSpokenText('**Profit** is ₹500.00 *today*'), 'Profit is 500.00 rupaye today');
  check('cleanSpokenText truncates at sentence', voice.cleanSpokenText('Pehla vakya. Dusra vakya jo bahut lamba hai aur aage badhta hai.', 20), 'Pehla vakya.');
  check('shortenForVoice keeps 2 sentences', voice.shortenForVoice('Ek. Do. Teen. Chaar.'), 'Ek. Do.');
  check('splitInterrupt bas only', JSON.stringify(voice.splitInterrupt('Bas, short mein batao')), JSON.stringify({ interrupted: true, remainder: '' }));
  check('splitInterrupt with remainder', voice.splitInterrupt('Bas, short mein batao, aaj ka hisab batao').remainder, 'aaj ka hisab batao');
  check('splitInterrupt ruk', voice.splitInterrupt('Ruk, cash book kholo').remainder, 'cash book kholo');
  check('splitInterrupt normal sentence', voice.splitInterrupt('Aaj Xerox ke 300 cash hue').interrupted, false);
  check('isInterruptOnly bas', voice.isInterruptOnly('Bas'), true);
  check('isInterruptOnly with instruction', voice.isInterruptOnly('Bas, aaj ka hisab batao'), false);
  check('low confidence financial → clarify', voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: 0.35 }).action, 'clarify');
  check('low confidence greeting → clarify', voice.handleVoiceTranscript({ transcript: 'Kaise ho bhai', confidence: 0.2 }).action, 'clarify');
  check('confident transcript → send', voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: 0.95 }).action, 'send');
  check('no confidence given → send', voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: null }).action, 'send');
  check('empty transcript → ignore', voice.handleVoiceTranscript({ transcript: '   ', confidence: 0.9 }).action, 'ignore');
  check('repeat transcript → ignore', voice.handleVoiceTranscript({ transcript: 'Haan', confidence: 0.9, prev: { text: 'Haan', atMs: 1000 }, nowMs: 3000 }).action, 'ignore');
  check('same transcript after window → send', voice.handleVoiceTranscript({ transcript: 'Haan', confidence: 0.9, prev: { text: 'Haan', atMs: 1000 }, nowMs: 9000 }).action, 'send');
  check('different transcript → send', voice.handleVoiceTranscript({ transcript: 'Nahi', confidence: 0.9, prev: { text: 'Haan', atMs: 1000 }, nowMs: 2000 }).action, 'send');
  check('interrupt decision', voice.handleVoiceTranscript({ transcript: 'Bas, short mein batao', confidence: 0.9 }).action, 'interrupt');
  check('voice settings defaults', JSON.stringify(voice.voiceSettingsFor(null)), JSON.stringify({ repliesEnabled: false, rate: 1, continuous: false, voicesByLang: {} }));
  const p = profile('px', 'X');
  p.voiceReplies = true; p.voiceRate = 3; p.voiceContinuous = true; p.voiceByLang = { gu: 'Google Gujarati' };
  const vs = voice.voiceSettingsFor(p);
  check('voice settings rate clamped', vs.rate, 1.5);
  check('voice settings replies', vs.repliesEnabled, true);
  check('voice settings continuous', vs.continuous, true);
  check('preferred voice by lang', voice.preferredVoiceName(vs, 'gu'), 'Google Gujarati');
  check('voice lang key gu', voice.voiceLangKeyFor(p), 'default'); // aiLanguage unset → default
  p.aiLanguage = 'gu';
  check('voice lang key aiLanguage', voice.voiceLangKeyFor(p), 'gu');
  check('recognition lang profile gu', voice.recognitionLangFor(p, 'hello'), 'gu-IN');
  check('recognition lang auto gujarati text', voice.recognitionLangFor(profile('py', 'Y'), 'Aaje su chale chhe?'), 'gu-IN');
  check('SR supported', voice.isSpeechRecognitionSupported({ SpeechRecognition: {} }), true);
  check('SR webkit supported', voice.isSpeechRecognitionSupported({ webkitSpeechRecognition: {} }), true);
  check('SR unsupported', voice.isSpeechRecognitionSupported({}), false);
  check('silence timeout', voice.SILENCE_TIMEOUT_MS, 5000);
  check('low confidence threshold', voice.LOW_CONFIDENCE_THRESHOLD, 0.6);
  const bcp = lang.SUPPORTED_LANGUAGES.map((l) => lang.voiceLangFor(l.code));
  check('all 23 languages have BCP-47 tags', bcp.every((t) => typeof t === 'string' && t.includes('-')), true);
  check('error message denied mentions permission', voice.voiceErrorMessage('denied').includes('permission'), true);
  check('error message unsupported mentions browser', voice.voiceErrorMessage('unsupported').includes('browser'), true);
  check('no provider name in voice messages', hasNone(Object.values(voice.VOICE_MESSAGES).join(' '), 'Gemini', 'Google', 'OpenAI', 'API key'), true);
}

/* ================= 2. The 6 brief sentences, VERBATIM ================= */
section('brief sentences verbatim (voice → pipeline)');
{
  // (1) "Aaje 500 rupiya Xerox na malya." — service + amount, NO mode:
  // must ask Cash/UPI, never guess, never save.
  {
    const { state, p1 } = emptyState();
    const { decision, res } = voiceTurn('Aaje 500 rupiya Xerox na malya.', {}, state, p1);
    check('S1 decision send', decision.action, 'send');
    check('S1 asks method (draft)', !!res.draftQuestion, true);
    check('S1 draft mentions Cash/UPI', has(res.draftQuestion || '', 'Cash', 'UPI'), true);
    check('S1 no action saved', res.action, undefined);
    check('S1 store still empty', state.dailyEntries.length, 0);
  }
  // (2) "Aaj 300 cash aur 200 UPI hue." — two amounts, NO service:
  // must ask which service, never guess, never save; answering the
  // service keeps 300 cash + 200 UPI (modes preserved, not flattened).
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('Aaj 300 cash aur 200 UPI hue.', {}, state, p1);
    check('S2 asks service (draft)', !!res.draftQuestion, true);
    check('S2 draft mentions service', has(res.draftQuestion || '', 'service'), true);
    check('S2 no action saved', res.action, undefined);
    const done = chat.applyDraftAnswer(res.draft, 'Xerox', state, p1, {});
    check('S2 draft completes to action', done.kind, 'action');
    check('S2 two entries kept', done.action.entries.length, 2);
    check('S2 entry 1 cash 300', done.action.entries[0].method === 'cash' && done.action.entries[0].amountPaise === 30000, true);
    check('S2 entry 2 UPI 200', done.action.entries[1].method === 'upi' && done.action.entries[1].amountPaise === 20000, true);
    const r = asst.applyAssistantAction(state, p1.id, done.action, 'voice-s2');
    check('S2 saved', r.ok, true);
    check('S2 store has 2 entries', state.dailyEntries.length, 2);
    check('S2 total 50000 paise', state.dailyEntries.reduce((a, e) => a + e.totalPaise, 0), 50000);
  }
  // (3) "Agent ne 500 rupaye dene hain." — owed, not paid: ask WHICH
  // agent, never invent one, never save a payment.
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('Agent ne 500 rupaye dene hain.', {}, state, p1);
    check('S3 asks agent (draft)', !!res.draftQuestion, true);
    check('S3 draft mentions agent', has((res.draftQuestion || '').toLowerCase(), 'agent'), true);
    check('S3 no action saved', res.action, undefined);
    check('S3 store still empty', state.dailyEntries.length, 0);
  }
  // (4) "Kal PAN Card ke 5 application karne hain." — a PLAN (5 is a
  // count of applications, not ₹5): acknowledge, never a money question.
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('Kal PAN Card ke 5 application karne hain.', {}, state, p1);
    check('S4 intent plan', res.intent, 'plan');
    check('S4 no action', res.action, undefined);
    check('S4 no ₹5 money question', hasNone(res.text, '₹5', 'kitne rupaye'), true);
    check('S4 mentions PAN Card plan', has(res.text, 'PAN Card'), true);
  }
  // (5) "Aaj ka total hisab batao." — real figures from the ledgers
  // (₹0.00 on an empty store — a figure, never "no records").
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('Aaj ka total hisab batao.', {}, state, p1);
    check('S5 answers with real figures', has(res.text, '₹0.00'), true);
    check('S5 never says no records instead of a figure', hasNone(res.text, 'koi record nahi'), true);
  }
  // (6) "આજે કેટલો નફો થયો?" — Gujarati script profit question,
  // answered in Gujarati with the real figure.
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('આજે કેટલો નફો થયો?', {}, state, p1);
    check('S6 answers profit', has(res.text, '₹0.00'), true);
    check('S6 replies in Gujarati', has(res.text, 'chhe'), true);
  }
}

/* ================= 3. Natural phrasing (no fixed commands) ================= */
section('natural phrasing — his own words, no fixed grammar');
{
  const cases = [
    ['Xerox 300 cash', 'action'],
    ['300 cash Xerox aaj hue', 'action'],
    ['Xerox ka 300 cash aaya', 'action'],
    ['Aaj Xerox ke 300 cash hue', 'action'],
    ['Xerox 300', 'draft'],
    ['300 cash', 'draft'],
  ];
  for (const [text, want] of cases) {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn(text, {}, state, p1);
    if (want === 'action') {
      check(`"${text}" → action preview`, res.kind, 'action');
      check(`"${text}" → no save yet`, state.dailyEntries.length, 0);
    } else {
      check(`"${text}" → clarification, no save`, !!res.draftQuestion && !res.action, true);
    }
  }
  // Follow-up in the same conversation, voice → text switching:
  // voice turn saves Xerox (context), text turn adds 200 UPI to it.
  {
    const { state, p1 } = emptyState();
    const first = voiceTurn('Aaj Xerox ke 300 cash hue', {}, state, p1);
    check('follow-up first is action', first.res.kind, 'action');
    const r1 = asst.applyAssistantAction(state, p1.id, first.res.action, 'voice-fu1');
    check('follow-up first saved', r1.ok, true);
    // The chat UI remembers the service just saved (lastService).
    const ctx = { ...first.res.newCtx, lastService: 'Xerox', lastTopic: 'daily_income' };
    const second = conv.respondToMessage({ message: 'Aur 200 UPI bhi add kar do', state, profile: p1, ctx });
    check('follow-up text turn is action', second.kind, 'action');
    check('follow-up keeps Xerox service', second.action.entries[0].service, 'Xerox');
    check('follow-up is UPI 200', second.action.entries[0].method === 'upi' && second.action.entries[0].amountPaise === 20000, true);
    const r2 = asst.applyAssistantAction(state, p1.id, second.action, 'voice-fu2');
    check('follow-up saved, no duplicate', r2.ok && state.dailyEntries.length === 2, true);
  }
  // Incomplete sentence: amount but no mode/service → short question.
  {
    const { state, p1 } = emptyState();
    const { res } = voiceTurn('Xerox 300', {}, state, p1);
    check('incomplete asks mode in his style', has(res.draftQuestion || '', 'Cash', 'UPI'), true);
  }
}

/* ================= 4. The 14 UPDATE 18 scenarios ================= */
section('scenario 1 — normal voice conversation');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Kaise ho bhai?', {}, state, p1);
  check('greeting is casual', res.intent, 'casual');
  check('greeting never mentions records', hasNone(res.text, 'record', '₹0'), true);
  check('greeting is warm', has(res.text, 'bhai'), true);
}

section('scenario 2 — mixed-language input');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Aaje Xerox na 300 cash malya', {}, state, p1);
  check('mixed gu+hi → action', res.kind, 'action');
  check('mixed service Xerox', res.action.entries[0].service, 'Xerox');
  check('mixed amount 30000', res.action.entries[0].amountPaise, 30000);
  check('mixed method cash', res.action.entries[0].method, 'cash');
}

section('scenario 3 — cash income by voice (store-verified)');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Aaj Xerox ke 300 cash hue', {}, state, p1);
  check('cash preview is action', res.kind, 'action');
  const r = asst.applyAssistantAction(state, p1.id, res.action, 'voice-cash1');
  check('cash saved ok', r.ok, true);
  check('cash daily entry written', state.dailyEntries.length, 1);
  check('cash entry total paise', state.dailyEntries[0].totalPaise, 30000);
  check('cash entry method', state.dailyEntries[0].method, 'cash');
  check('cash txn written', state.cashTxns.filter((x) => x.method === 'cash').length, 1);
  check('cash balance +300', acct.balancesPaise(0, 0, state.cashTxns.filter((x) => x.profileId === 'prof1')).cash, 30000);
}

section('scenario 4 — UPI income by voice (store-verified)');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Aaj Printing ke 200 UPI hue', {}, state, p1);
  check('upi preview is action', res.kind, 'action');
  const r = asst.applyAssistantAction(state, p1.id, res.action, 'voice-upi1');
  check('upi saved ok', r.ok, true);
  check('upi entry method', state.dailyEntries[0].method, 'upi');
  check('upi balance +200', acct.balancesPaise(0, 0, state.cashTxns.filter((x) => x.profileId === 'prof1')).upi, 20000);
}

section('scenario 5 — expense by voice (store-verified)');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Bijli ka bill 500 cash kharcha hua', {}, state, p1);
  check('expense preview is action', res.kind, 'action');
  check('expense kind', res.action.kind, 'expense');
  const r = asst.applyAssistantAction(state, p1.id, res.action, 'voice-exp1');
  check('expense saved ok', r.ok, true);
  check('expense written', state.expenses.length, 1);
  check('expense amount paise', state.expenses[0].amountPaise, 50000);
}

section('scenario 6 — daily profit by voice (real figures)');
{
  const { state, p1 } = emptyState();
  const inc = voiceTurn('Aaj Xerox ke 300 cash hue', {}, state, p1);
  asst.applyAssistantAction(state, p1.id, inc.res.action, 'voice-p1');
  const exp = voiceTurn('Bijli ka bill 100 cash kharcha hua', {}, state, p1);
  asst.applyAssistantAction(state, p1.id, exp.res.action, 'voice-p2');
  const { res } = voiceTurn('Aaj kitna profit hua?', {}, state, p1);
  check('profit answer quotes ₹200.00', has(res.text, '₹200.00'), true);
  check('profit answer is not a guess', hasNone(res.text, 'koi record nahi'), true);
}

section('scenario 7 — open Cash Book by voice (actual navigation)');
{
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Cash Book kholo', {}, state, p1);
  check('navigation kind', res.kind, 'navigation');
  check('navigates to /cash-book', res.navigateTo, '/cash-book');
  const upi = voiceTurn('UPI Book kholo', {}, state, p1);
  check('UPI Book navigates', upi.res.navigateTo, '/upi-book');
}

section('scenario 8 — interrupt AI speech');
{
  const synth = new FakeSynthesis();
  const { ctrl, events } = makeController(synth, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: false, voicesByLang: {} });
  check('speak starts', ctrl.speak('Aaj ka hisab lamba jawab hai jo bol raha hai', 'hi-IN'), true);
  check('controller speaking', ctrl.currentState, 'speaking');
  check('utterance queued', synth.spoken.length, 1);
  check('utterance lang hi-IN', synth.spoken[0].lang, 'hi-IN');
  const cancelsBefore = synth.cancelCalls;
  ctrl.interruptSpeech();
  check('interrupt cancels speech', synth.cancelCalls, cancelsBefore + 1);
  check('interrupt state idle', ctrl.currentState, 'idle');
  // "Bas, short mein batao" + new instruction: stop + process the rest.
  const intr = voice.splitInterrupt('Bas, short mein batao, aaj ka hisab batao');
  check('interrupt remainder is the new instruction', intr.remainder, 'aaj ka hisab batao');
  const { state, p1 } = emptyState();
  const { res } = voiceTurn(intr.remainder, {}, state, p1);
  check('new instruction answered after interrupt', has(res.text, '₹0.00'), true);
  check('short version is shorter', voice.shortenForVoice('Pehla. Dusra. Teesra.').length < 'Pehla. Dusra. Teesra.'.length, true);
  // Boundary events drive the spoken-word highlight.
  const synth2 = new FakeSynthesis();
  const c2 = makeController(synth2, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: false, voicesByLang: {} });
  c2.ctrl.speak('Namaste bhai', 'hi-IN');
  synth2.fireBoundary(4);
  check('boundary event delivered', c2.events.boundaries[0], 4);
  check('no crash on interrupt when idle', (() => { c2.ctrl.interruptSpeech(); return true; })(), true);
  void events;
}

section('scenario 9 — voice ↔ text switching (context preserved)');
{
  const { state, p1 } = emptyState();
  const v1 = voiceTurn('Aaj Xerox ke 300 cash hue', {}, state, p1);
  asst.applyAssistantAction(state, p1.id, v1.res.action, 'voice-s9a');
  const ctx = { ...v1.res.newCtx, lastService: 'Xerox', lastTopic: 'daily_income' };
  // Text follow-up in the same conversation reuses the voice context.
  const t1 = conv.respondToMessage({ message: 'Aur 200 UPI bhi add kar do', state, profile: p1, ctx });
  check('text follow-up after voice works', t1.kind, 'action');
  check('text follow-up same service', t1.action.entries[0].service, 'Xerox');
  // And a voice turn after a text turn keeps the same history context.
  const ctx2 = { ...t1.newCtx, lastService: 'Xerox', lastTopic: 'daily_income' };
  const v2 = voiceTurn('Aaj ka total hisab batao', ctx2, state, p1);
  check('voice question after text works', has(v2.res.text, '₹300.00'), true);
}

section('scenario 10 — continuous mode (multi-turn, no re-tap)');
{
  FakeRecognition.instances = [];
  const synth = new FakeSynthesis();
  const { ctrl, events } = makeController(synth, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: true, voicesByLang: {} });
  ctrl.setContinuous(true);
  check('continuous listen starts', ctrl.startListening('hi-IN'), true);
  check('state listening', ctrl.currentState, 'listening');
  const rec1 = FakeRecognition.instances[0];
  rec1.emitInterim('Kaise ho');
  check('interim transcript shown', events.interims[0], 'Kaise ho');
  rec1.emitFinal('Kaise ho bhai', 0.93);
  check('turn 1 transcript delivered', events.finals[0].text, 'Kaise ho bhai');
  // In continuous mode the same session stays live across the reply.
  check('session still live after turn 1', ctrl.currentState, 'listening');
  check('speak reply', ctrl.speak('Main badhiya hoon bhai', 'hi-IN'), true);
  synth.finishLast();
  check('speech end reported', events.speechEnds, 1);
  check('still listening after reply (session live)', ctrl.currentState, 'listening');
  // Turn 2 on the SAME session, without tapping the mic again.
  rec1.emitFinal('Aaj ka total hisab batao', 0.91);
  check('turn 2 transcript delivered without re-tap', events.finals[1].text, 'Aaj ka total hisab batao');
  // Chrome ends a session after a pause even in continuous mode —
  // the controller restarts it visibly.
  rec1.emitEnd();
  check('session restarts after auto-end', FakeRecognition.instances.length, 2);
  check('restarted session listening', ctrl.currentState, 'listening');
  ctrl.stopAll();
  check('stopAll ends listening', ctrl.currentState, 'idle');
}

section('scenario 11 — mic permission denial (clean error, text fallback)');
{
  FakeRecognition.instances = [];
  const synth = new FakeSynthesis();
  const { ctrl, events } = makeController(synth, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: false, voicesByLang: {} });
  ctrl.startListening('hi-IN');
  const rec = FakeRecognition.instances[FakeRecognition.instances.length - 1];
  rec.emitError('not-allowed');
  check('denial reported as denied', events.errors[0], 'denied');
  check('denial message guides to Allow', voice.voiceErrorMessage('denied').includes('Allow'), true);
  check('mic off after denial', ctrl.currentState, 'idle');
  // Text chat still works after the denial.
  const { state, p1 } = emptyState();
  const { res } = voiceTurn('Aaj kitna profit hua?', {}, state, p1);
  check('text fallback answers after denial', has(res.text, '₹0.00'), true);
  // Unsupported browser: no recognition factory at all.
  const noRec = new voice.VoiceController(
    { createRecognition: () => null, synthesis: synth, createUtterance: (t) => new FakeUtterance(t), getSettings: () => ({ ...voice.DEFAULT_VOICE_SETTINGS }) },
    { onState: () => {}, onFinalTranscript: () => {}, onInterimTranscript: () => {}, onError: (k) => events.errors.push(k), onSpeechEnd: () => {}, onBoundary: () => {} },
  );
  check('unsupported start fails cleanly', noRec.startListening('hi-IN'), false);
  check('unsupported error reported', events.errors[events.errors.length - 1], 'unsupported');
}

section('scenario 12 — network failure + recovery (local engine answers)');
{
  const { state, p1 } = emptyState();
  // No key configured on this VM → cloud path honestly unavailable.
  check('no key → cloud not configured', cai.hasAiServiceKey(), false);
  const r0 = await cai.callConversationAI([{ role: 'user', content: 'Hi' }], 'system');
  check('no key → call returns not-configured', r0.ok === false && r0.reason === 'not-configured', true);
  // Local engine still answers with real figures while "offline".
  const { res } = voiceTurn('Aaj kitna profit hua?', {}, state, p1);
  check('local engine answers during outage', has(res.text, '₹0.00'), true);
  // Key + endpoint configured, network down → honest failure, local stands.
  const realFetch = globalThis.fetch;
  cai.setAiServiceKey('test-key-not-real');
  cai.setAiServiceEndpoint('https://example.invalid/v1/chat');
  globalThis.fetch = async () => { throw new Error('network down'); };
  const r1 = await cai.callConversationAI([{ role: 'user', content: 'Hi' }], 'system');
  check('network down → call fails honestly', r1.ok === false && r1.reason === 'network', true);
  // Recovery: endpoint answers again → cloud path works (stubbed
  // endpoint — this is NOT a live cloud call, no real key is used).
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Namaste bhai!' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const r2 = await cai.callConversationAI([{ role: 'user', content: 'Hi' }], 'system');
  check('recovery → call succeeds', r2.ok === true && r2.text === 'Namaste bhai!', true);
  globalThis.fetch = realFetch;
  cai.clearAiServiceKey();
  cai.setAiServiceEndpoint('');
  check('key cleared after test', cai.hasAiServiceKey(), false);
  // Voice recognition itself reports network errors honestly too.
  const synth = new FakeSynthesis();
  const { ctrl, events } = makeController(synth, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: false, voicesByLang: {} });
  ctrl.startListening('hi-IN');
  FakeRecognition.instances[FakeRecognition.instances.length - 1].emitError('network');
  check('recognition network error reported', events.errors[0], 'network');
}

section('scenario 13 — ambiguous financial instructions (no save)');
{
  const { state, p1 } = emptyState();
  const amb1 = voiceTurn('Xerox 300', {}, state, p1);
  check('missing mode → clarification, no action', !!amb1.res.draftQuestion && !amb1.res.action, true);
  const amb2 = voiceTurn('Agent ne paise dene hain', {}, state, p1);
  check('no amount → no action', amb2.res.action, undefined);
  const amb3 = voiceTurn('300', {}, state, p1);
  check('bare number → no action', amb3.res.action, undefined);
  const low = voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: 0.4 });
  check('low-confidence financial → clarify, never send', low.action, 'clarify');
  check('store untouched by ambiguous turns', state.dailyEntries.length === 0 && state.expenses.length === 0, true);
}

section('scenario 14 — duplicate prevention (repeat transcript / repeat Haan)');
{
  // Repeat transcript within the window is ignored at the voice edge.
  const first = voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: 0.95, prev: null });
  check('first transcript sends', first.action, 'send');
  const repeat = voice.handleVoiceTranscript({ transcript: 'Aaj Xerox ke 300 cash hue', confidence: 0.95, prev: { text: 'Aaj Xerox ke 300 cash hue', atMs: 1000 }, nowMs: 2000 });
  check('repeat transcript ignored', repeat.action, 'ignore');
  // Repeat "Haan" after a confirm: the idempotency key blocks the
  // second save even if the UI ever double-fires it.
  const { state, p1 } = emptyState();
  const parsed = chat.parseAssistantMessage('Aaj Xerox ke 300 rupaye cash hue', state, p1, {});
  const r1 = asst.applyAssistantAction(state, p1.id, parsed.action, 'voice-dup14');
  const r2 = asst.applyAssistantAction(state, p1.id, parsed.action, 'voice-dup14');
  check('first Haan saves', r1.ok, true);
  check('second Haan rejected as duplicate', r2.duplicate, true);
  check('exactly one entry after repeat Haan', state.dailyEntries.length, 1);
  // And the voice edge ignores a repeated "Haan" transcript outright.
  const haan2 = voice.handleVoiceTranscript({ transcript: 'Haan', confidence: 0.92, prev: { text: 'Haan', atMs: 5000 }, nowMs: 6000 });
  check('repeat Haan transcript ignored', haan2.action, 'ignore');
}

/* ================= 5. Silence detection ================= */
section('silence detection');
{
  const synth = new FakeSynthesis();
  const { ctrl, events } = makeController(synth, { ...voice.DEFAULT_VOICE_SETTINGS, rate: 1, continuous: false, voicesByLang: {} }, { silenceTimeoutMs: 40 });
  ctrl.startListening('hi-IN');
  await sleep(90);
  check('silence stops listening', ctrl.currentState, 'idle');
  check('silence reports no-speech', events.errors[0], 'no-speech');
  check('silence message asks to repeat', voice.voiceErrorMessage('no-speech').includes('dobara'), true);
}

/* ================= 6. Latency (local engine) ================= */
section('latency — transcript → reply (local engine)');
const latencies = [];
{
  const sentences = [
    'Aaje 500 rupiya Xerox na malya.',
    'Aaj 300 cash aur 200 UPI hue.',
    'Agent ne 500 rupaye dene hain.',
    'Kal PAN Card ke 5 application karne hain.',
    'Aaj ka total hisab batao.',
    'આજે કેટલો નફો થયો?',
    'Kaise ho bhai?',
    'Aaj Xerox ke 300 cash hue',
    'Cash Book kholo',
    'Bijli ka bill 500 cash kharcha hua',
  ];
  for (let round = 0; round < 3; round++) {
    for (const s of sentences) {
      const { state, p1 } = emptyState();
      const t0 = performance.now();
      conv.respondToMessage({ message: s, state, profile: p1, ctx: {} });
      latencies.push(performance.now() - t0);
    }
  }
  latencies.sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = latencies[Math.floor(latencies.length * 0.95) - 1];
  const max = latencies[latencies.length - 1];
  console.log(`  transcript→reply: n=${latencies.length} mean=${mean.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`);
  check('p95 under 100ms (local engine)', p95 < 100, true);
  check('max under 500ms (local engine)', max < 500, true);
}

/* ================= Summary ================= */
console.log('\n================ voice test summary ================');
let totalPass = 0;
let total = 0;
for (const [name, r] of Object.entries(results)) {
  if (name === '_cur') continue;
  totalPass += r.pass;
  total += r.total;
  console.log(`  ${r.pass === r.total ? 'PASS' : 'FAIL'} ${name}: ${r.pass}/${r.total}`);
}
console.log(`  TOTAL: ${totalPass}/${total} checks passed`);
console.log('\nUnverified on this VM (no microphone, no owner key here):');
console.log('  - Live microphone recognition quality per language/browser');
console.log('  - Real-device speech voices + spoken-word highlight timing');
console.log('  - Live cloud-AI reply (owner key lives on his device only)');
console.log('  - Continuous conversation across a real multi-minute call');
if (failures > 0 || totalPass !== total) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll voice acceptance checks passed.');
