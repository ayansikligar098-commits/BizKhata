/**
 * BizKhata conversational-AI Playwright drive — UPDATE 14 + 15 + 16.
 *
 * Runs against the built static export served on 127.0.0.1:8931 with a
 * FRESH browser profile (empty localStorage — the app starts empty).
 * Registers a fresh account, creates the CSC business, then drives the
 * 10 UPDATE-14 + 10 UPDATE-15 acceptance conversations and the 3
 * UPDATE-16 "do it" commands through the REAL /chatbot UI, verifying
 * the replies on screen — plus one business-action flow (Xerox ₹300
 * cash → preview → Confirm & Save → store-verified) and one
 * duplicate-prevention check. Exits non-zero on the first failed check.
 *
 * Order matters: empty-store conversations run BEFORE the action flow
 * (which writes a real ₹300 entry), and language-switch tests run
 * LAST (they change the profile's AI language; it is reset to Auto
 * after each). Usage: node tests/drive-conversation.mjs
 * (expects an http server on 127.0.0.1:8931 serving out/).
 */
import { chromium } from 'playwright-core';

const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const BASE = 'http://127.0.0.1:8931';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const replies = [];
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function has(t, ...needles) { return needles.some((n) => String(t).includes(n)); }
function hasNone(t, ...needles) { return !needles.some((n) => String(t).includes(n)); }

const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  PAGEERROR:', String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('  CONSOLE-ERROR:', m.text().slice(0, 300)); });

async function waitForIdle(timeoutMs = 45000) {
  // UPDATE 17: replies now stream (thinking indicator → progressive
  // typing). Wait until no thinking indicator and no streaming bot
  // message remains, instead of a fixed sleep.
  const t0 = Date.now();
  for (;;) {
    const busy = (await page.locator('[data-testid="chat-thinking"]').count()) > 0
      || (await page.locator('[data-streaming="true"]').count()) > 0;
    if (!busy) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await sleep(250);
  }
}
async function chatSend(text) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  const idle = await waitForIdle();
  check('reply finished streaming', idle, idle ? '' : 'streaming did not finish in 45s');
}
async function lastBotText() {
  const bots = page.locator('[data-testid="chat-bot-msg"]');
  const n = await bots.count();
  return n ? (await bots.nth(n - 1).innerText()) : '';
}
async function ask(text) {
  await chatSend(text);
  const t = await lastBotText();
  replies.push({ q: text, a: t });
  return t;
}
async function resetAiLanguage() {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bizkhata.v1') || '{}');
    if (s.profiles && s.profiles[0]) s.profiles[0].aiLanguage = 'auto';
    localStorage.setItem('bizkhata.v1', JSON.stringify(s));
  });
  await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);
}

console.log('== 0. Register + create CSC business (fresh profile, empty app) ==');
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
check('chat page loads with input', (await page.getByTestId('chat-input').count()) === 1);

console.log('== UPDATE 14 acceptance (empty store) ==');
let t = await ask('Hi bhai, kaise ho?');
check('(1) greeting in Hinglish, no records talk', has(t, 'badhiya', 'theek', 'Badhiya') && hasNone(t, 'record', 'figure'), t.slice(0, 120));
t = await ask('Tell me a funny joke.');
check('(2) actual joke', has(t, 'virus', 'photocopy', 'homework', 'Teacher', 'Doctor'), t.slice(0, 120));
t = await ask('Mujhe PAN card ke baare mein samjhao.');
check('(3) PAN explainer with documents', has(t, 'PAN') && has(t, 'Aadhaar') && has(t, '10-digit'), t.slice(0, 120));
t = await ask('Aaje su chale chhe?');
check('(4) Gujarati reply, never Marathi', has(t, 'majama', 'theek', 'kem') && hasNone(t, 'record'), t.slice(0, 120));
t = await ask('Aaj kitna profit hua?');
check('(6) profit is real ₹0.00 on empty store', has(t, '₹0.00'), t.slice(0, 120));
t = await ask('Cash Book kaise use karte hain?');
check('(7) Cash Book steps + open link', has(t, 'Cash Book', '1.') && (await page.locator('.chat-link', { hasText: 'Cash Book' }).count()) >= 1, t.slice(0, 120));
t = await ask('I am bored, suggest something interesting.');
check('(8) bored reply, no records talk', has(t, 'interesting', 'idea', 'joke', 'learn') && hasNone(t, 'record'), t.slice(0, 120));
t = await ask('Aaj no total hisab batavo.');
check('(10) total is real ₹0.00, nothing invented', has(t, '₹0.00') && hasNone(t, '₹500', '₹200'), t.slice(0, 160));
t = await ask('Kaise Ho Bhai');
check('(screenshot) "Kaise Ho Bhai" → Hinglish natural reply', has(t, 'badhiya', 'theek', 'Badhiya') && hasNone(t, 'record', 'figure'), t.slice(0, 120));

console.log('== UPDATE 15 real-world conversations (empty store) ==');
t = await ask('Mujhe kal PAN Card banane hai.');
check('(1) plan ack + checklist offer, NEVER a money question', has(t, 'PAN Card') && has(t, 'checklist') && hasNone(t, 'rupaye hue', 'kitne rupaye', '₹'), t.slice(0, 160));
t = await ask('Kaise ho bhai?');
check('(2) natural greeting', has(t, 'badhiya', 'theek', 'Badhiya'), t.slice(0, 120));
t = await ask('Aaj shop par bahut kaam tha.');
check('(3) busy-day acknowledgement, no money question', has(t, 'rush', 'aaram', 'busy') && hasNone(t, 'rupaye'), t.slice(0, 120));
t = await ask('Mujhe ek business idea chahiye.');
check('(4) CSC business ideas', has(t, 'Money Transfer', 'PAN Card') && hasNone(t, 'rupaye hue'), t.slice(0, 160));
t = await ask('Website kaise bana sakta hoon?');
check('(5) website plan', has(t, 'Website') && has(t, 'plan', 'Google Sites', 'steps') && hasNone(t, 'rupaye hue'), t.slice(0, 160));
t = await ask('Aaj kitna profit hua?');
check('(7) profit ₹0.00', has(t, '₹0.00'), t.slice(0, 120));
t = await ask('I am feeling bored.');
check('(9) bored reply', has(t, 'interesting', 'idea', 'joke', 'learn') && hasNone(t, 'record'), t.slice(0, 120));
t = await ask('Kal mujhe kya kya kaam karna chahiye?');
check('(10) tomorrow work list', has(t, 'Pending jobs', 'Shop kholna') && hasNone(t, 'rupaye hue'), t.slice(0, 160));
t = await ask('Who won the cricket match yesterday?');
check('(live) live info is NOT invented', has(t, 'live') && hasNone(t, 'won by'), t.slice(0, 160));
t = await ask('Explain quantum entanglement in full detail with the latest research.');
check('(honest) unanswerable → says so + key, asks to rephrase', has(t, 'key') && has(t, 'samajh nahi paya', 'could not') && hasNone(t, 'rupaye hue'), t.slice(0, 200));

console.log('== UPDATE 16 do-commands (empty store) ==');
t = await ask('Aaj ka summary banao');
check('(c) real summary from ledgers, ₹0.00', has(t, '₹0.00'), t.slice(0, 160));
t = await ask('Kal ke kaam ki checklist banao');
check('(b) real checklist produced', has(t, 'checklist', 'Shop kholna') && has(t, '☐'), t.slice(0, 160));
const chkSaved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('bizkhata.v1') || '{}');
  const pid = s.profiles?.[0]?.id;
  const raw = pid ? localStorage.getItem(`bizkhata.checklists.v1.${pid}`) : null;
  return raw ? JSON.parse(raw).length : 0;
});
check('(b) checklist saved + retrievable in local storage', chkSaved >= 1, `saved=${chkSaved}`);
await chatSend('Cash Book kholo');
await sleep(1200);
check('(a) "Cash Book kholo" actually navigates to /cash-book', page.url().includes('/cash-book'), page.url());
await page.goto(`${BASE}/chatbot`, { waitUntil: 'domcontentloaded' });
await sleep(1200);

console.log('== Business action flow: Xerox ₹300 cash → preview → Confirm → store-verified ==');
await chatSend('Aaj Xerox ke 300 cash add kar.');
await sleep(900);
const preview = await page.locator('[data-testid="ai-preview"]').count();
check('preview card appears', preview >= 1);
const previewText = preview ? await page.locator('[data-testid="ai-preview"]').last().innerText() : '';
check('preview shows Xerox ₹300.00 CASH', has(previewText, 'Xerox', '₹300.00', 'CASH'), previewText.slice(0, 160));
await page.getByTestId('ai-confirm').last().click();
await sleep(1800);
const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('bizkhata.v1') || '{}'));
const entry = (savedState.dailyEntries || []).find((x) => x.service === 'Xerox' && x.totalPaise === 30000 && x.method === 'cash');
check('entry saved + verified in store after Confirm', !!entry, `dailyEntries=${(savedState.dailyEntries || []).length}`);
const savedMsg = await page.locator('[data-testid="ai-saved"]').count();
check('saved confirmation shown', savedMsg >= 1);

console.log('== Duplicate prevention: same message again shows duplicate warning ==');
await chatSend('Aaj Xerox ke 300 cash add kar.');
await sleep(900);
const dupText = (await page.locator('[data-testid="ai-preview"]').count())
  ? await page.locator('[data-testid="ai-preview"]').last().innerText() : '';
check('duplicate warning shown on repeat entry', has(dupText, 'pehle se saved', 'duplicate'), dupText.slice(0, 200));
await page.getByTestId('ai-cancel').last().click();
await sleep(600);
const afterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('bizkhata.v1') || '{}'));
check('cancelled duplicate did NOT write a second entry', (afterCancel.dailyEntries || []).filter((x) => x.service === 'Xerox' && x.totalPaise === 30000).length === 1);

console.log('== Language-switch tests (last — they change profile language) ==');
t = await ask('ગુજરાતીમાં મારી સાથે વાત કરો.');
check('(U14-9) switches to Gujarati', has(t, 'Gujarati', 'ગુજરાતી'), t.slice(0, 120));
await resetAiLanguage();
t = await ask('Mujhe Gujarati mein samjhao.');
check('(U15-8) switches to Gujarati immediately', has(t, 'Gujarati', 'ગુજરાતી'), t.slice(0, 120));
await resetAiLanguage();

console.log('\n--- ACTUAL UI REPLIES ---');
for (const r of replies) console.log(`\nQ: ${r.q}\nA: ${r.a.slice(0, 400)}`);
console.log(`\nDrive result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
