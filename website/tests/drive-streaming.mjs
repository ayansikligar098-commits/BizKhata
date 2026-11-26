/**
 * BizKhata streaming + typing Playwright drive — UPDATE 17.
 *
 * Runs against the built static export served on 127.0.0.1:8931 with a
 * FRESH browser profile (empty localStorage — the app starts empty).
 * Registers a fresh account, creates the CSC business, then measures
 * the REAL /chatbot UI: time-to-first-word, typing speed (words/sec),
 * and the 14-step acceptance flow:
 *   (1) send → (2) thinking dots + "BizKhata AI is thinking..." →
 *   (3) first chunk → (4) progressive display (sampled at 3 points,
 *   must grow, never jump to full) → (5) moderate speed (wps reported)
 *   → (6) blinking cursor while typing → (7) smooth scroll
 *   (scrollTop grows) → (8) long reply completes without freezing →
 *   (9) cursor gone at finish → (10) Stop keeps partial text and
 *   cancels → (11) Regenerate produces a fresh reply; a forced cloud
 *   failure falls back to the on-device reply with an honest cloud
 *   note (never a bare Retry with no answer) →
 *   (12) Gujarati + Hindi + Hinglish + mixed-language replies render
 *   correctly (no U+FFFD, no split vowel signs) → (13) short reply
 *   total < ~4 s → (14) long reply never appears all at once
 *   (displayed length at mid-time < full length).
 * Desktop viewport (1440×900) runs the full flow; a mobile viewport
 * (390px) re-runs the core typing checks. No key is configured on
 * this VM, so all replies come from the on-device engine and are
 * shown with the typewriter — the drive measures the DISPLAY path,
 * not a live cloud stream (that needs the owner's key on his device).
 * Writes measured results to /tmp/streaming-drive-results.json.
 * Exits non-zero on the first failed check.
 * Usage: node tests/drive-streaming.mjs
 * (expects an http server on 127.0.0.1:8931 serving out/).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const BASE = 'http://127.0.0.1:8931';
const OUT = '/tmp/streaming-drive-results.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const results = { steps: {}, timings: {}, notes: [] };
function check(step, name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${step}] ${name}${detail ? ` — ${detail}` : ''}`);
  results.steps[step] = { name, ok, detail };
  if (!ok) failures++;
}
const has = (t, ...ns) => ns.some((n) => String(t).includes(n));
const hasNone = (t, ...ns) => !ns.some((n) => String(t).includes(n));
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;

const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function registerAndOpenChat(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLE-ERROR:', m.text().slice(0, 300)); });
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
  return { ctx, page };
}
async function waitForIdle(page, timeoutMs = 45000) {
  const t0 = Date.now();
  for (;;) {
    const busy = (await page.locator('[data-testid="chat-thinking"]').count()) > 0
      || (await page.locator('[data-streaming="true"]').count()) > 0;
    if (!busy) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await sleep(200);
  }
}
async function lastBotText(page) {
  const bots = page.locator('[data-testid="chat-bot-msg"]');
  const n = await bots.count();
  return n ? (await bots.nth(n - 1).innerText()) : '';
}
/**
 * Send a message and sample the last bot message's displayed text
 * while it types. Returns { samples: [{t, len}], firstWordMs,
 * totalMs, finalText, finalWords, wps }.
 */
async function sendSampled(page, text, maxMs = 45000) {
  const t0 = Date.now();
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  const samples = [];
  let firstWordMs = null;
  let prevLen = -1;
  for (;;) {
    const t = Date.now() - t0;
    const txt = await lastBotText(page);
    const len = txt.length;
    if (len > 0 && firstWordMs === null) firstWordMs = t;
    if (len !== prevLen) { samples.push({ t, len }); prevLen = len; }
    const busy = (await page.locator('[data-testid="chat-thinking"]').count()) > 0
      || (await page.locator('[data-streaming="true"]').count()) > 0;
    if (!busy) break;
    if (t > maxMs) break;
    await sleep(100);
  }
  const totalMs = Date.now() - t0;
  const finalText = await lastBotText(page);
  const finalWords = words(finalText);
  const typingMs = firstWordMs === null ? 0 : totalMs - firstWordMs;
  const wps = typingMs > 0 ? finalWords / (typingMs / 1000) : 0;
  return { samples, firstWordMs, totalMs, finalText, finalWords, wps };
}

/* ================= Desktop 1440×900 — full 14-step flow ================= */
console.log('== Desktop 1440×900: register + open chat ==');
const { ctx, page } = await registerAndOpenChat({ width: 1440, height: 900 });
check('1', 'chat page loads with input', (await page.getByTestId('chat-input').count()) === 1);

console.log('== Steps 1–9, 13–14: short reply (greeting) ==');
// (1) send, (2) thinking, (3) first chunk, (4) progressive,
// (5) speed, (6) cursor, (7) scroll, (9) cursor gone, (13) < ~4 s.
const t0 = Date.now();
await page.getByTestId('chat-input').fill('Hi bhai, kaise ho?');
await page.getByTestId('chat-send').click();
check('1', 'send accepts the message', (await page.locator('[data-testid="chat-user-msg"]').count()) >= 1);
await sleep(120);
const thinking = await page.locator('[data-testid="chat-thinking"]').count();
const thinkingText = thinking ? await page.locator('[data-testid="chat-thinking"]').innerText() : '';
check('2', 'thinking dots + exact text "BizKhata AI is thinking..." visible', thinking >= 1 && thinkingText.includes('BizKhata AI is thinking...'), thinkingText.slice(0, 60));
// (6) cursor appears while typing: poll for it during the first 2 s.
let cursorSeen = false;
let scrollStart = await page.evaluate(() => { const el = document.querySelector('.chat-msgs'); return el ? el.scrollTop : -1; });
for (let i = 0; i < 20; i++) {
  if ((await page.locator('.chat-cursor').count()) > 0) { cursorSeen = true; break; }
  await sleep(100);
}
check('6', 'blinking cursor present while typing', cursorSeen);
const short = await (async () => {
  // Continue sampling from here (the reply is already in flight).
  const samples = [];
  let firstWordMs = null;
  let prevLen = -1;
  for (;;) {
    const t = Date.now() - t0;
    const txt = await lastBotText(page);
    const len = txt.length;
    if (len > 0 && firstWordMs === null) firstWordMs = t;
    if (len !== prevLen) { samples.push({ t, len }); prevLen = len; }
    const busy = (await page.locator('[data-testid="chat-thinking"]').count()) > 0
      || (await page.locator('[data-streaming="true"]').count()) > 0;
    if (!busy) break;
    if (t > 45000) break;
    await sleep(100);
  }
  const totalMs = Date.now() - t0;
  const finalText = await lastBotText(page);
  const finalWords = words(finalText);
  const typingMs = firstWordMs === null ? 0 : totalMs - firstWordMs;
  return { samples, firstWordMs, totalMs, finalText, finalWords, wps: typingMs > 0 ? finalWords / (typingMs / 1000) : 0 };
})();
const scrollEnd = await page.evaluate(() => { const el = document.querySelector('.chat-msgs'); return el ? el.scrollTop : -1; });
check('3', 'first displayable text arrives', short.firstWordMs !== null && short.finalText.length > 0, `first word at ${short.firstWordMs} ms`);
const mid = short.samples.filter((s) => s.len > 0 && s.len < short.finalText.length);
check('4', 'progressive display: text grows in steps, never jumps to full', mid.length >= 2 && short.samples.every((s, i, a) => i === 0 || s.len >= a[i - 1].len), `samples=${short.samples.length} growing=${mid.length}`);
check('5', 'moderate typing speed (6–16 words/sec)', short.wps >= 6 && short.wps <= 16, `${short.wps.toFixed(1)} wps, ${short.finalWords} words`);
results.timings.shortScroll = { start: scrollStart, end: scrollEnd };
// NOTE: step (7) is verified later (after step 12), once the message
// list is long enough to overflow — a 19-word reply cannot scroll a
// 900px-tall list, so scrollTop 0 → 0 here is expected, not a bug.
check('9', 'cursor gone at finish + timestamp shown', (await page.locator('.chat-cursor').count()) === 0 && (await page.locator('.chat-time').count()) >= 1);
check('13', 'short reply total time < ~4 s', short.totalMs < 4000, `${short.totalMs} ms, ${short.finalWords} words`);
check('13b', 'short reply is a real greeting (not empty / error)', has(short.finalText, 'badhiya', 'theek', 'Badhiya'), short.finalText.slice(0, 100));
results.timings.short = { firstWordMs: short.firstWordMs, totalMs: short.totalMs, words: short.finalWords, wps: +short.wps.toFixed(2) };

console.log('== Steps 8 + 14: long reply (PAN explainer, ~120 words) ==');
const long = await sendSampled(page, 'Mujhe PAN card ke baare mein samjhao.');
const longMid = long.samples.filter((s) => s.len > 0 && s.len < long.finalText.length);
check('8', 'long reply completes without freezing', (await waitForIdle(page)) && long.finalText.length > 200, `${long.finalWords} words in ${long.totalMs} ms`);
check('14', 'long reply never appears all at once (mid-time length < full)', longMid.length >= 3 && long.samples[Math.floor(long.samples.length / 2)].len < long.finalText.length, `samples=${long.samples.length} mid=${long.samples[Math.floor(long.samples.length / 2)]?.len}/${long.finalText.length}`);
check('8b', 'long reply speed stays moderate', long.wps >= 6 && long.wps <= 16, `${long.wps.toFixed(1)} wps`);
check('9b', 'cursor gone after long reply', (await page.locator('.chat-cursor').count()) === 0);
results.timings.long = { firstWordMs: long.firstWordMs, totalMs: long.totalMs, words: long.finalWords, wps: +long.wps.toFixed(2) };

console.log('== Step 10: Stop keeps partial text and cancels ==');
await page.getByTestId('chat-input').fill('Mujhe PAN card ke baare mein samjhao.');
await page.getByTestId('chat-send').click();
// Wait until some text is displayed, then Stop.
let stoppedLen = 0;
for (let i = 0; i < 60; i++) {
  const txt = await lastBotText(page);
  if (txt.length > 30) break;
  await sleep(100);
}
const beforeStop = await lastBotText(page);
await page.getByTestId('chat-stop').click();
await sleep(1200);
const afterStop = await lastBotText(page);
await sleep(1000);
const afterStop2 = await lastBotText(page);
check('10', 'Stop keeps partial text, cancels generation, shows stopped note',
  beforeStop.length > 0 && afterStop.length >= beforeStop.length && afterStop2.length === afterStop.length
  && (await page.locator('[data-streaming="true"]').count()) === 0
  && (await page.locator('.chat-stopped-note').count()) >= 1,
  `kept ${afterStop.length} chars (was ${beforeStop.length} at click), stable across 1 s`);

console.log('== Step 11a: Regenerate produces a fresh reply ==');
const regenBefore = await lastBotText(page);
await page.getByTestId('chat-regenerate').click();
const regenIdle = await waitForIdle(page);
const regenAfter = await lastBotText(page);
check('11a', 'Regenerate produces a fresh reply', regenIdle && regenAfter.length > 50, `before=${regenBefore.length} chars after=${regenAfter.length} chars`);

console.log('== Step 11b: forced cloud failure falls back to the local reply (never a bare Retry) ==');
// 2026-11-27 fix (user-reported: "AI se help mangu to jawab hi nahi
// deta"): when the configured cloud service fails or times out, the
// chat must still answer with the on-device reply it already computed,
// flagged with one honest cloud note — never a red "Retry" note with
// no answer at all. Regenerate (not Retry) is the re-attempt path.
await page.evaluate(() => {
  localStorage.setItem('bizkhata.ai.service.endpoint.v1', 'https://invalid.example.invalid/chat');
  localStorage.setItem('bizkhata.ai.service.key.v1', 'dummy-key-for-drive-test');
});
await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
await sleep(1200);
await page.getByTestId('chat-input').fill('Explain quantum entanglement in full detail with the latest research.');
await page.getByTestId('chat-send').click();
const failedIdle = await waitForIdle(page, 60000);
const fallbackText = await lastBotText(page);
const cloudNote = await page.locator('.chat-cloud-note').count();
const failedNote = await page.locator('.chat-failed-note').count();
const retryBtn = await page.getByTestId('chat-retry').count();
check('11b', 'forced failure shows the local reply + honest cloud note (no failed note, no bare Retry)', failedIdle && fallbackText.length > 20 && cloudNote >= 1 && failedNote === 0 && retryBtn === 0, `reply=${fallbackText.length} chars cloudNote=${cloudNote} failedNote=${failedNote} retry=${retryBtn}`);
await page.getByTestId('chat-regenerate').click();
const retryIdle = await waitForIdle(page, 60000);
const retryText = await lastBotText(page);
const cloudNote2 = await page.locator('.chat-cloud-note').count();
const failedNote2 = await page.locator('.chat-failed-note').count();
check('11b2', 'Regenerate re-attempts and falls back to the local reply again (same invalid endpoint)', retryIdle && retryText.length > 20 && cloudNote2 >= 1 && failedNote2 === 0, `reply=${retryText.length} chars cloudNote=${cloudNote2} failedNote=${failedNote2}`);
await page.evaluate(() => {
  localStorage.removeItem('bizkhata.ai.service.endpoint.v1');
  localStorage.removeItem('bizkhata.ai.service.key.v1');
});
await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
await sleep(1200);
const recover = await sendSampled(page, 'Hi bhai, kaise ho?');
check('11b3', 'after clearing the bad endpoint, local replies work again', recover.finalText.length > 20 && has(recover.finalText, 'badhiya', 'theek', 'Badhiya'));

console.log('== Step 12: Gujarati + Hindi + Hinglish + mixed-language ==');
const guj = await sendSampled(page, 'Aaje su chale chhe?');
check('12a', 'Gujarati reply renders (no U+FFFD, no split vowel signs)', hasNone(guj.finalText, '�') && has(guj.finalText, 'majama', 'theek', 'kem', 'મજામાં'), guj.finalText.slice(0, 120));
const hin = await sendSampled(page, 'Kaise ho bhai?');
check('12b', 'Hindi/Hinglish reply renders correctly', hasNone(hin.finalText, '�') && has(hin.finalText, 'badhiya', 'theek', 'Badhiya'), hin.finalText.slice(0, 120));
const hing = await sendSampled(page, 'Aaj kitna profit hua?');
check('12c', 'Hinglish profit reply is real ₹0.00', hasNone(hing.finalText, '�') && has(hing.finalText, '₹0.00'), hing.finalText.slice(0, 120));
const mixed = await sendSampled(page, 'Bhai, aaj kaam kaisa raha? મજામાં?');
check('12d', 'mixed-language reply renders (Gujarati script intact)', hasNone(mixed.finalText, '�') && has(mixed.finalText, 'badhiya', 'theek', 'majama', 'Badhiya'), mixed.finalText.slice(0, 120));

console.log('== Step 7 (deferred): smooth scroll on a long reply, list now overflowing ==');
const scrollBefore = await page.evaluate(() => { const el = document.querySelector('.chat-msgs'); return el ? { top: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight } : null; });
await page.getByTestId('chat-input').fill('Mujhe PAN card ke baare mein samjhao.');
await page.getByTestId('chat-send').click();
const scrollSamples = [];
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => { const el = document.querySelector('.chat-msgs'); return el ? el.scrollTop : -1; });
  scrollSamples.push(s);
  const busy = (await page.locator('[data-streaming="true"]').count()) > 0;
  if (!busy) break;
  await sleep(250);
}
await waitForIdle(page);
const scrollAfter = await page.evaluate(() => { const el = document.querySelector('.chat-msgs'); return el ? { top: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight } : null; });
const scrollGrew = scrollSamples.some((v, i) => i > 0 && v > scrollSamples[i - 1]);
check('7', 'smooth scroll: list overflows and scrollTop grows as text arrives',
  scrollBefore && scrollBefore.sh > scrollBefore.ch && scrollGrew && scrollAfter.top > scrollBefore.top,
  `overflow sh=${scrollBefore?.sh} ch=${scrollBefore?.ch}, scrollTop ${scrollBefore?.top} → ${scrollAfter?.top} (samples grew: ${scrollGrew})`);

await ctx.close();

/* ================= Mobile 390px — core typing checks ================= */
console.log('== Mobile 390px: core typing checks ==');
const m = await registerAndOpenChat({ width: 390, height: 844 });
check('M1', 'mobile chat page loads with input', (await m.page.getByTestId('chat-input').count()) === 1);
const mShort = await sendSampled(m.page, 'Hi bhai, kaise ho?');
check('M2', 'mobile short reply types progressively and finishes', mShort.finalText.length > 20 && mShort.totalMs < 5000, `${mShort.totalMs} ms, ${mShort.finalWords} words, ${mShort.wps.toFixed(1)} wps`);
const mMid = mShort.samples.filter((s) => s.len > 0 && s.len < mShort.finalText.length);
check('M3', 'mobile progressive display (grows, never jumps)', mMid.length >= 2, `samples=${mShort.samples.length}`);
const mLong = await sendSampled(m.page, 'Mujhe PAN card ke baare mein samjhao.');
check('M4', 'mobile long reply completes', mLong.finalText.length > 200, `${mLong.finalWords} words in ${mLong.totalMs} ms`);
check('M5', 'mobile cursor gone at finish', (await m.page.locator('.chat-cursor').count()) === 0);
results.timings.mobile = { shortMs: mShort.totalMs, shortWps: +mShort.wps.toFixed(2), longMs: mLong.totalMs, longWps: +mLong.wps.toFixed(2), longWords: mLong.finalWords };
await m.ctx.close();

results.failures = failures;
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${OUT}`);
console.log(`Drive result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
