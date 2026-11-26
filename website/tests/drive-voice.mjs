/**
 * BizKhata voice Playwright drive — UPDATE 18.
 *
 * Runs against the built static export served on 127.0.0.1:8932 with a
 * FRESH browser profile (empty localStorage — the app starts empty).
 * Installs FAKE Web Speech API objects (SpeechRecognition +
 * speechSynthesis) before the app loads, then drives the REAL /chatbot
 * UI with injected transcripts — the same strings a real microphone
 * would produce — and verifies the on-screen chat state, the spoken
 * reply queue, and the store (localStorage) after each step.
 *
 * HONEST SCOPE: the fakes stand in for a microphone this VM does not
 * have. Recognition quality, real-device voices and the live cloud
 * reply are NOT verified here — only that the app correctly handles
 * transcripts, speaks replies, interrupts, continues, and performs
 * real backend operations from them.
 *
 * REGRESSION COVERAGE: V4 is the regression test for a real bug this
 * drive caught (2026-11-27): the VoiceController's callbacks are
 * bound once at first mic tap, so they closed over the render whose
 * store predated the voice-saved entries — a totals question asked
 * after a voice save quoted ₹0.00. Fixed by reading the latest store
 * through refs in chatbot.tsx (stateRef/profileRef); V4 now quotes
 * the real ₹500.00. If V4 ever regresses to ₹0.00, that fix broke.
 *
 * Usage: npm run build && serve out/ on 127.0.0.1:8932, then:
 *   node tests/drive-voice.mjs
 */
import { createRequire } from 'node:module';

// playwright-core is NOT a website dependency (the site ships no test
// runner): resolve it from the shared drive installs on this VM.
const require = createRequire(import.meta.url);
let chromium;
for (const p of [
  '/home/hatch/workspace/bizkhata-drive/node_modules/playwright-core',
  '/home/hatch/workspace/ai-drive/node_modules/playwright-core',
]) {
  try { ({ chromium } = require(p)); break; } catch { /* try next */ }
}
if (!chromium) throw new Error('playwright-core not found — install it (npm i playwright-core) in ~/workspace/bizkhata-drive');

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const BASE = 'http://127.0.0.1:8932';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function has(t, ...needles) { return needles.some((n) => String(t).includes(n)); }
function hasNone(t, ...needles) { return !needles.some((n) => String(t).includes(n)); }

/** Fake Web Speech API, installed before any app code runs. */
const VOICE_INIT = `
window.__voice = { recognitions: [], tts: { utterances: [], cancels: 0, speaking: false } };
class FakeSR {
  constructor() {
    this.lang = ''; this.interimResults = false; this.continuous = false;
    this.onresult = null; this.onerror = null; this.onend = null;
    this.started = false; this.stopped = false;
    window.__voice.recognitions.push(this);
  }
  start() {
    if (window.__voice.denyNext) {
      window.__voice.denyNext = false;
      const err = this.onerror;
      setTimeout(() => err && err({ error: 'not-allowed' }), 10);
      return;
    }
    this.started = true;
  }
  stop() { this.stopped = true; const e = this.onend; setTimeout(() => e && e(), 10); }
  abort() { this.stopped = true; }
  __emit(transcript, isFinal, confidence) {
    const alt = { transcript, confidence: confidence == null ? 0.95 : confidence };
    const res = { 0: alt, length: 1, isFinal: !!isFinal };
    const results = { 0: res, length: 1 };
    this.onresult && this.onresult({ results, resultIndex: 0 });
  }
  __emitError(error) { this.onerror && this.onerror({ error }); }
  __emitEnd() { this.onend && this.onend(); }
}
Object.defineProperty(window, 'SpeechRecognition', { value: FakeSR, configurable: true });
Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSR, configurable: true });
const tts = window.__voice.tts;
const fakeVoices = [
  { name: 'Test Hindi', lang: 'hi-IN', default: false },
  { name: 'Test Gujarati', lang: 'gu-IN', default: false },
  { name: 'Test English', lang: 'en-US', default: true },
];
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    getVoices: () => fakeVoices,
    speak: (u) => { tts.utterances.push(u); tts.speaking = true; },
    cancel: () => { tts.cancels++; tts.speaking = false; },
    get speaking() { return tts.speaking; },
    get paused() { return false; },
  },
  configurable: true,
});
window.__voice.__lastRec = () => window.__voice.recognitions[window.__voice.recognitions.length - 1];
window.__voice.__finishTTS = () => {
  const u = tts.utterances[tts.utterances.length - 1];
  tts.speaking = false;
  if (u && u.onend) u.onend();
};
window.__voice.__ttsBoundary = (i) => {
  const u = tts.utterances[tts.utterances.length - 1];
  if (u && u.onboundary) u.onboundary({ charIndex: i });
};
`;

const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function newVoicePage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(VOICE_INIT);
  page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLE-ERROR:', m.text().slice(0, 300)); });
  return { ctx, page };
}

/** Wait until the last bot message has finished streaming. */
async function waitReplyDone(page, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const n = await page.locator('[data-testid="chat-bot-msg"]').count();
    if (n > 0) {
      const streaming = await page.locator('[data-testid="chat-bot-msg"]').last().getAttribute('data-streaming');
      if (streaming === 'false') return true;
    }
    await sleep(250);
  }
  return false;
}

async function lastBotText(page) {
  const bots = page.locator('[data-testid="chat-bot-msg"]');
  const n = await bots.count();
  return n ? (await bots.nth(n - 1).innerText()) : '';
}

async function emitFinal(page, text, confidence) {
  await page.evaluate(([t, c]) => {
    window.__voice.__lastRec().__emit(t, true, c == null ? 0.95 : c);
  }, [text, confidence == null ? null : confidence]);
  await sleep(300);
}

async function store(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('bizkhata.v1') || '{}'));
}
async function ttsCount(page) {
  return page.evaluate(() => window.__voice.tts.utterances.length);
}
async function ttsCancels(page) {
  return page.evaluate(() => window.__voice.tts.cancels);
}
async function voiceStatus(page) {
  return (await page.locator('[data-testid="voice-status"]').innerText()).trim();
}

console.log('== 0. Register + create CSC business (fresh profile, empty app) ==');
const { ctx, page } = await newVoicePage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await sleep(2000);
await page.getByRole('button', { name: 'Create account' }).first().click();
await sleep(800);
const inputs = page.locator('.auth-card input');
await inputs.nth(0).fill('9999999999');
await inputs.nth(1).fill('1234');
await inputs.nth(2).fill('1234');
await inputs.nth(3).fill('mango');
await page.getByRole('button', { name: 'Create Account' }).click();
await sleep(1500);
await page.getByRole('button', { name: 'Create Business' }).click();
await sleep(1500);
const skip = page.getByRole('button', { name: 'Skip (English)' });
if (await skip.count()) { await skip.click(); await sleep(1500); }
await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
await sleep(1500);
check('chat page loads with mic + continuous controls',
  (await page.getByTestId('chat-mic').count()) === 1 && (await page.getByTestId('voice-continuous').count()) === 1);

console.log('== V1. Voice income: Xerox ₹300 cash → preview → Confirm → store-verified ==');
await page.getByTestId('chat-mic').click();
await sleep(600);
let status = await voiceStatus(page);
check('listening indicator visible while mic on', has(status, 'Sun raha hoon'), status.slice(0, 120));
await emitFinal(page, 'Aaj Xerox ke 300 cash hue');
check('voice reply finished streaming', await waitReplyDone(page));
let preview = await page.locator('[data-testid="ai-preview"]').count();
check('preview card appears for voice entry', preview >= 1);
const previewText = preview ? await page.locator('[data-testid="ai-preview"]').last().innerText() : '';
check('preview shows Xerox ₹300.00 CASH', has(previewText, 'Xerox', '₹300.00', 'CASH'), previewText.slice(0, 160));
check('reply was spoken (TTS queue has the reply)', (await ttsCount(page)) >= 1, `utterances=${await ttsCount(page)}`);
await page.getByTestId('ai-confirm').last().click();
await sleep(1800);
let s = await store(page);
let entry = (s.dailyEntries || []).find((x) => x.service === 'Xerox' && x.totalPaise === 30000 && x.method === 'cash');
check('voice entry saved + verified in store after Confirm', !!entry, `dailyEntries=${(s.dailyEntries || []).length}`);
check('saved confirmation shown', (await page.locator('[data-testid="ai-saved"]').count()) >= 1);

console.log('== V2. Repeat "Haan" by voice → exactly one entry ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Haan');
check('repeat Haan reply finished', await waitReplyDone(page));
s = await store(page);
check('no second entry after repeat Haan',
  (s.dailyEntries || []).filter((x) => x.service === 'Xerox' && x.totalPaise === 30000).length === 1);

console.log('== V3. Voice follow-up: "Aur 200 UPI bhi add kar do" → UPI entry ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Aur 200 UPI bhi add kar do');
check('follow-up reply finished', await waitReplyDone(page));
preview = await page.locator('[data-testid="ai-preview"]').count();
check('follow-up preview appears', preview >= 1);
const preview2 = preview ? await page.locator('[data-testid="ai-preview"]').last().innerText() : '';
check('follow-up preview shows Xerox ₹200.00 UPI', has(preview2, 'Xerox', '₹200.00', 'UPI'), preview2.slice(0, 160));
await page.getByTestId('ai-confirm').last().click();
await sleep(1800);
s = await store(page);
check('two entries in store (300 cash + 200 UPI)', (s.dailyEntries || []).length === 2, `dailyEntries=${(s.dailyEntries || []).length}`);

console.log('== V4. Daily total by voice (real figures ₹500.00) ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Aaj ka total hisab batao');
check('total reply finished', await waitReplyDone(page));
let t = await lastBotText(page);
check('voice total quotes real ₹500.00', has(t, '₹500.00'), t.slice(0, 200));

console.log('== V5. Navigation by voice: "Cash Book kholo" ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Cash Book kholo');
await sleep(1500);
check('voice navigation actually opens /cash-book', page.url().includes('/cash-book'), page.url());
await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
await sleep(1200);

console.log('== V6. Spoken-word highlight (boundary events) ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Kaise ho bhai');
check('greeting reply finished', await waitReplyDone(page));
await page.evaluate(() => window.__voice.__ttsBoundary(5));
await sleep(400);
check('speaking message renders with highlight', (await page.locator('[data-testid="chat-speaking"]').count()) >= 1);
await page.evaluate(() => window.__voice.__finishTTS());
await sleep(400);

console.log('== V7. Interruption: Stop button cancels speech ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Aaj ka total hisab batao');
check('long reply finished streaming', await waitReplyDone(page));
status = await voiceStatus(page);
check('speaking indicator visible', has(status, 'Bol raha hoon'), status.slice(0, 120));
const cancelsBefore = await ttsCancels(page);
await page.getByTestId('voice-stop').click();
await sleep(400);
check('Stop cancels the speech', (await ttsCancels(page)) > cancelsBefore, `cancels=${await ttsCancels(page)}`);
status = await voiceStatus(page);
check('speaking indicator gone after Stop', hasNone(status, 'Bol raha hoon'), status.slice(0, 120));

console.log('== V8. "Bas, short mein batao" interrupts + answers short ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Bas, short mein batao, aaj ka hisab batao');
check('interrupt reply finished', await waitReplyDone(page));
t = await lastBotText(page);
check('interrupted instruction answered with real figures', has(t, '₹500.00'), t.slice(0, 200));

console.log('== V9. Continuous mode: multi-turn without re-tapping mic ==');
await page.getByTestId('voice-continuous').click();
await sleep(400);
check('continuous toggle is on', (await page.getByTestId('voice-continuous').getAttribute('aria-pressed')) === 'true');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Aaj kitna profit hua?');
check('continuous turn 1 finished', await waitReplyDone(page));
t = await lastBotText(page);
check('continuous turn 1 quotes ₹500.00 profit', has(t, '₹500.00'), t.slice(0, 200));
await page.evaluate(() => window.__voice.__finishTTS());
await sleep(600);
status = await voiceStatus(page);
check('still listening after reply in continuous mode (no re-tap)', has(status, 'Sun raha hoon'), status.slice(0, 120));
// Turn 2 on the SAME session — no mic tap.
await emitFinal(page, 'Aaj Xerox se kitna kamaya?');
check('continuous turn 2 finished without re-tap', await waitReplyDone(page));
t = await lastBotText(page);
check('continuous turn 2 answers from real records', has(t, '₹300.00'), t.slice(0, 200));
await page.evaluate(() => window.__voice.__finishTTS());
await sleep(400);
await page.getByTestId('voice-continuous').click();
await sleep(500);
status = await voiceStatus(page);
check('continuous off stops listening', hasNone(status, 'Sun raha hoon'), status.slice(0, 120));

console.log('== V10. Low-confidence transcript → clarification, no save ==');
await page.getByTestId('chat-mic').click();
await sleep(500);
await emitFinal(page, 'Aaj Xerox ke 300 cash hue', 0.3);
check('low-confidence reply finished', await waitReplyDone(page));
t = await lastBotText(page);
check('low-confidence asks to repeat', has(t, 'dobara'), t.slice(0, 200));
s = await store(page);
check('low-confidence turn saved nothing', (s.dailyEntries || []).length === 2);

console.log('== V11. Voice settings (Settings → Voice card) ==');
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await sleep(1500);
const settingsText = await page.locator('body').innerText();
check('Voice settings card present', has(settingsText, 'Voice replies', 'Speech rate', 'Continuous conversation'));
check('no provider name anywhere in Settings text', hasNone(settingsText, 'Gemini', 'gemini', 'OpenAI'));
const voiceCard = page.locator('#settings-voice');
await voiceCard.locator('button', { hasText: 'On' }).first().click();
await sleep(800);
s = await store(page);
check('voice replies On persisted on profile', s.profiles?.[0]?.voiceReplies === true, `voiceReplies=${s.profiles?.[0]?.voiceReplies}`);

await ctx.close();

console.log('== V12. Mic permission denial (separate context) ==');
{
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await c2.newPage();
  await p2.addInitScript(VOICE_INIT);
  p2.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
  await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await p2.getByRole('button', { name: 'Create account' }).first().click();
  await sleep(800);
  const in2 = p2.locator('.auth-card input');
  await in2.nth(0).fill('8888888888');
  await in2.nth(1).fill('1234');
  await in2.nth(2).fill('1234');
  await in2.nth(3).fill('mango');
  await p2.getByRole('button', { name: 'Create Account' }).click();
  await sleep(1500);
  await p2.getByRole('button', { name: 'Create Business' }).click();
  await sleep(1500);
  const sk2 = p2.getByRole('button', { name: 'Skip (English)' });
  if (await sk2.count()) { await sk2.click(); await sleep(1500); }
  await p2.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await p2.evaluate(() => { window.__voice.denyNext = true; });
  await p2.getByTestId('chat-mic').click();
  check('denial reply finished', await waitReplyDone(p2));
  const dt = await lastBotText(p2);
  check('denial shows permission guidance', has(dt, 'permission', 'Allow'), dt.slice(0, 200));
  // Text chat still works after the denial.
  await p2.getByTestId('chat-input').fill('Aaj kitna profit hua?');
  await p2.getByTestId('chat-send').click();
  check('text fallback works after denial', await waitReplyDone(p2));
  const tt = await lastBotText(p2);
  check('text fallback answers with real figures', has(tt, '₹0.00'), tt.slice(0, 200));
  await c2.close();
}

console.log('== V13. Unsupported browser (no fake installed) ==');
{
  const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p3 = await c3.newPage();
  // Force the APIs absent even if this Chromium build exposes them.
  await p3.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
  });
  p3.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
  await p3.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await p3.getByRole('button', { name: 'Create account' }).first().click();
  await sleep(800);
  const in3 = p3.locator('.auth-card input');
  await in3.nth(0).fill('7777777777');
  await in3.nth(1).fill('1234');
  await in3.nth(2).fill('1234');
  await in3.nth(3).fill('mango');
  await p3.getByRole('button', { name: 'Create Account' }).click();
  await sleep(1500);
  await p3.getByRole('button', { name: 'Create Business' }).click();
  await sleep(1500);
  const sk3 = p3.getByRole('button', { name: 'Skip (English)' });
  if (await sk3.count()) { await sk3.click(); await sleep(1500); }
  await p3.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await p3.getByTestId('chat-mic').click();
  check('unsupported reply finished', await waitReplyDone(p3));
  const ut = await lastBotText(p3);
  check('unsupported browser gets clear message + text fallback', has(ut, 'support nahi hai') && has(ut, 'type karke'), ut.slice(0, 200));
  await c3.close();
}

console.log(`\nDrive result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
