/**
 * BizKhata streaming + typewriter unit suite — UPDATE 17.
 *
 * Drives the REAL streaming.ts / markdown.ts / conversation-ai.ts
 * (compiled with tsc, no browser, no key, no network):
 *   - chunker never splits grapheme clusters (Devanagari / Gujarati /
 *     Tamil / emoji / ZWJ / flags) and never shows a half-typed word;
 *   - Typewriter final text == source text for 10+ cases (incl. empty
 *     + 2000 words), stop preserves a prefix, append-while-typing
 *     buffers, flush() finishes instantly, pause/resume works;
 *   - measured typing pace for a 30-word reply at the default pace
 *     (reported; 150-word time is projected from it);
 *   - SSE parser: split lines, split multi-byte chars, [DONE], abort,
 *     error events, non-JSON lines, non-OK responses;
 *   - Markdown renderer: headings / bold / lists / tables / code /
 *     HTML escaping / unclosed fence;
 *   - Legacy key migration: old profile key → new key slot, new key
 *     wins, neither → empty, removal is respected, original kept.
 *   - Model constant (UPDATE 19): client DEFAULT_MODEL and Pages
 *     Function UPSTREAM_MODEL both equal the agreed live model, all
 *     three call paths send it, the shut-down model appears nowhere,
 *     and the value never leaks into UI files.
 * Exits non-zero if ANY check fails. Run with `npm test`.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-streaming-test';
fs.rmSync(outDir, { recursive: true, force: true });

execSync(
  `npx tsc src/lib/streaming.ts src/lib/markdown.ts src/lib/conversation-ai.ts src/lib/languages.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const streaming = require(path.join(outDir, 'streaming.js'));
const md = require(path.join(outDir, 'markdown.js'));

const results = {};
function run(category, name, fn) {
  results[category] = results[category] || { pass: 0, total: 0 };
  results[category].total++;
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then((v) => {
        ok = v.ok === true;
        detail = v.detail || '';
        if (ok) results[category].pass++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'} [${category}] ${name}${detail}`);
        return ok;
      }).catch((e) => {
        console.log(`  FAIL [${category}] ${name} (threw: ${e.message})`);
        return false;
      });
    }
    ok = r.ok === true;
    detail = r.detail || '';
  } catch (e) {
    detail = ` (threw: ${e.message})`;
  }
  if (ok) results[category].pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${category}] ${name}${detail}`);
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cases = [];
function finish() {
  let totalPass = 0;
  let total = 0;
  for (const [cat, v] of Object.entries(results)) {
    totalPass += v.pass;
    total += v.total;
    console.log(`  ${cat}: ${v.pass}/${v.total}`);
  }
  console.log(`\nStreaming unit tests: ${totalPass}/${total} (${((totalPass / total) * 100).toFixed(1)}%)`);
  if (totalPass !== total) {
    console.log('\nFAILED — see FAIL lines above.');
    process.exit(1);
  }
  console.log('\nAll streaming unit tests passed.');
}

/* ================= Chunker ================= */
const CHUNK_CASES = [
  'Hello world, this is a simple English sentence.',
  'मुझे पैन कार्ड बनाना है और आधार कार्ड भी चाहिए।',
  'कि ज्ञ क्ष त्र — संयुक्ताक्षर और मात्राएँ कभी नहीं टूटनी चाहिए।',
  'Aaje Xerox na 300 cash ane 200 UPI thaya, total 500.',
  'ગુજરાતીમાં મારી સાથે વાત કરો — આજે કેટલો નફો થયો?',
  'தமிழ் மொழியில் பேசுங்கள் — இன்று எவ்வளவு லாபம்?',
  'Hello 👋🏽 world 👨‍👩‍👧🇮🇳 — emoji and ZWJ families stay whole.',
  'Mixed Hinglish + ગુજરાતી + हिन्दी in one sentence, with ₹500.00.',
  'A verylongwordwithoutanyspacesatall'.repeat(3) + ' end.',
  '',
  'a',
  '₹',
];
for (const text of CHUNK_CASES) {
  cases.push(() => run('chunk', `join(chunks)==text for ${JSON.stringify(text.slice(0, 40))}`, () => {
    const chunks = streaming.splitIntoChunks(text);
    const joined = chunks.join('');
    return { ok: joined === text, detail: joined === text ? '' : ` got ${JSON.stringify(joined.slice(0, 60))}` };
  }));
  cases.push(() => run('chunk', `no chunk starts with a combining mark (${JSON.stringify(text.slice(0, 30))})`, () => {
    const chunks = streaming.splitIntoChunks(text);
    const bad = chunks.find((c) => streaming.startsWithCombiningMark(c));
    return { ok: !bad, detail: bad ? ` bad chunk ${JSON.stringify(bad)}` : '' };
  }));
}
cases.push(() => run('chunk', 'normal sentence: every chunk but the last ends with whitespace (no half-typed word)', () => {
  const chunks = streaming.splitIntoChunks('Aaj Xerox ke 300 cash hue aur 200 UPI bhi mile.');
  const bad = chunks.slice(0, -1).find((c) => !/\s$/.test(c));
  return { ok: !bad && chunks.length > 3, detail: ` chunks=${JSON.stringify(chunks)}` };
}));
cases.push(() => run('chunk', '"कि" stays one grapheme-safe chunk (vowel sign never split)', () => {
  const chunks = streaming.splitIntoChunks('कि');
  return { ok: chunks.length === 1 && chunks[0] === 'कि', detail: ` chunks=${JSON.stringify(chunks)}` };
}));
cases.push(() => run('chunk', 'ZWJ family emoji stays one chunk', () => {
  const chunks = streaming.splitIntoChunks('👨‍👩‍👧');
  return { ok: chunks.length === 1 && chunks[0] === '👨‍👩‍👧', detail: ` chunks=${JSON.stringify(chunks)}` };
}));

/* ================= Typewriter ================= */
/** Run a typewriter to completion and return the displayed text. */
function runTw(source, wordsPerSec) {
  return new Promise((resolve) => {
    const tw = new streaming.Typewriter({
      wordsPerSec,
      onUpdate: () => {},
      onDone: (displayed) => resolve(displayed),
    });
    tw.setSource(source);
    if (source === '') resolve(tw.displayedText);
  });
}
const TW_CASES = [
  '',
  'Hi.',
  'Main badhiya hoon bhai! Tum batao, sab kaisa chal raha hai?',
  'Aaj Xerox ke 300 cash hue aur 200 UPI bhi mile — total ₹500.00.',
  'मुझे पैन कार्ड के बारे में समजाओ। आधार कार्ड क्या है?',
  'ગુજરાતીમાં મારી સાથે વાત કરો. આજે કેટલો નફો થયો?',
  'Hello 👋🏽 world 👨‍👩‍👧🇮🇳 mixed with ₹1,000.00 and a longwordwithoutspaces'.repeat(2),
  'word '.repeat(50).trim(),
  'word '.repeat(2000).trim(), // very long: 2000 words
  'Line one.\nLine two with a list:\n- item one\n- item two\nDone.',
  'a'.repeat(500), // one giant token
];
for (const text of TW_CASES) {
  cases.push(async () => run('typewriter', `final == source (${text.length} chars, ${text.split(/\s+/).filter(Boolean).length} words)`, async () => {
    const shown = await runTw(text, 100000);
    return { ok: shown === text, detail: shown === text ? '' : ` shown ${shown.length} chars, expected ${text.length}` };
  }));
}
cases.push(async () => run('typewriter', 'stop() preserves a non-empty proper prefix (nothing lost, nothing extra)', async () => {
  const source = 'word '.repeat(200).trim();
  let shown = '';
  const tw = new streaming.Typewriter({ wordsPerSec: 11, onUpdate: (d) => { shown = d; }, onDone: () => {} });
  tw.setSource(source);
  await sleep(600);
  tw.stop();
  await sleep(200);
  const ok = shown.length > 0 && shown.length < source.length && source.startsWith(shown);
  return { ok, detail: ` shown ${shown.length} chars of ${source.length}` };
}));
cases.push(async () => run('typewriter', 'append() while typing buffers — final is part1+part2 exactly', async () => {
  const part1 = 'Aaj Xerox ke 300 cash hue. ';
  const part2 = 'Aur 200 UPI bhi mile — total ₹500.00.';
  const done = new Promise((resolve) => {
    const tw = new streaming.Typewriter({ wordsPerSec: 1000, onUpdate: () => {}, onDone: (d) => resolve(d) });
    tw.append(part1);
    setTimeout(() => { tw.append(part2); tw.end(); }, 300);
  });
  const shown = await done;
  return { ok: shown === part1 + part2, detail: shown === part1 + part2 ? '' : ` got ${JSON.stringify(shown)}` };
}));
cases.push(async () => run('typewriter', 'partial word is held back until it completes (no half-typed word)', async () => {
  let shown = '';
  const tw = new streaming.Typewriter({ wordsPerSec: 1000, onUpdate: (d) => { shown = d; }, onDone: () => {} });
  tw.append('Hello wo');
  await sleep(400);
  const mid = shown;
  tw.append('rld');
  tw.end();
  await sleep(500);
  return { ok: mid === 'Hello ' && shown === 'Hello world', detail: ` mid=${JSON.stringify(mid)} final=${JSON.stringify(shown)}` };
}));
cases.push(async () => run('typewriter', 'flush() shows everything instantly', async () => {
  const source = 'word '.repeat(100).trim();
  let shown = '';
  const tw = new streaming.Typewriter({ wordsPerSec: 11, onUpdate: (d) => { shown = d; }, onDone: () => {} });
  tw.setSource(source);
  await sleep(150);
  tw.flush();
  return { ok: shown === source && tw.isDone, detail: ` shown ${shown.length} chars` };
}));
cases.push(async () => run('typewriter', 'pause() freezes display, resume() completes', async () => {
  const source = 'word '.repeat(30).trim();
  let shown = '';
  const tw = new streaming.Typewriter({ wordsPerSec: 1000, onUpdate: (d) => { shown = d; }, onDone: () => {} });
  tw.setSource(source);
  await sleep(120);
  tw.pause();
  const frozen = shown;
  await sleep(250);
  const stillFrozen = shown === frozen;
  tw.resume();
  await sleep(800);
  return { ok: stillFrozen && shown === source, detail: ` frozen=${JSON.stringify(frozen.slice(0, 20))} final=${shown.length} chars` };
}));

// Measured pace (default 11 wps): 30 words → ~2.7 s.
let measured30Ms = 0;
cases.push(async () => run('typewriter', 'MEASURED pace: 30-word reply at default 11 wps', async () => {
  const source = 'word '.repeat(30).trim();
  const t0 = Date.now();
  await runTw(source, 11);
  measured30Ms = Date.now() - t0;
  const wps = (30 / (measured30Ms / 1000)).toFixed(1);
  return {
    ok: measured30Ms >= 2000 && measured30Ms <= 4200,
    detail: ` measured ${measured30Ms} ms for 30 words (${wps} wps); projected 150-word reply ≈ ${(measured30Ms * 5 / 1000).toFixed(1)} s`,
  };
}));

/* ================= SSE parser ================= */
function sseResponse(chunks, opts = {}) {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === 'string' ? new TextEncoder().encode(c) : c);
      controller.close();
    },
  });
  return new Response(stream, {
    status: opts.status || 200,
    headers: { 'content-type': opts.contentType || 'text/event-stream' },
  });
}
async function collectSSE(res, signal) {
  const parts = [];
  await streaming.consumeSSE(res, (t) => parts.push(t), signal);
  return parts.join('');
}
cases.push(async () => run('sse', 'delta chunks assemble; [DONE] ends cleanly', async () => {
  const res = sseResponse([
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
  const text = await collectSSE(res);
  return { ok: text === 'Hello world', detail: ` got ${JSON.stringify(text)}` };
}));
cases.push(async () => run('sse', 'lines split across network chunks still parse', async () => {
  const res = sseResponse([
    'data: {"choices":[{"delta":{"content":"Hel',
    'lo wo',
    'rld"}}]}\n\ndata: [DONE]\n\n',
  ]);
  const text = await collectSSE(res);
  return { ok: text === 'Hello world', detail: ` got ${JSON.stringify(text)}` };
}));
cases.push(async () => run('sse', 'multi-byte chars split across chunks never corrupt (₹ + emoji)', async () => {
  const full = 'data: {"choices":[{"delta":{"content":"₹500.00 👨‍👩‍👧"}}]}\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(full);
  // Split inside the ₹ (3 bytes) and inside the emoji bytes.
  const cut1 = bytes.indexOf(0xe2) + 1; // mid-₹
  const chunks = [bytes.slice(0, cut1), bytes.slice(cut1, cut1 + 10), bytes.slice(cut1 + 10)];
  const res = sseResponse(chunks);
  const text = await collectSSE(res);
  return { ok: text === '₹500.00 👨‍👩‍👧' && !text.includes('�'), detail: ` got ${JSON.stringify(text)}` };
}));
cases.push(async () => run('sse', 'error event → StreamError with a clean message (no upstream text)', async () => {
  const res = sseResponse(['data: {"error": "upstream exploded, code 500"}\n\n']);
  try {
    await collectSSE(res);
    return { ok: false, detail: ' did not throw' };
  } catch (e) {
    const clean = e instanceof streaming.StreamError && !/exploded|500/.test(e.message);
    return { ok: clean, detail: ` message=${JSON.stringify(e.message)}` };
  }
}));
cases.push(async () => run('sse', 'non-JSON data line passes through as raw text', async () => {
  const res = sseResponse(['data: plain streamed text\n\ndata: [DONE]\n\n']);
  const text = await collectSSE(res);
  return { ok: text === 'plain streamed text', detail: ` got ${JSON.stringify(text)}` };
}));
cases.push(async () => run('sse', 'non-OK response → StreamError (never raw HTTP text)', async () => {
  const res = sseResponse([], { status: 502 });
  try {
    await collectSSE(res);
    return { ok: false, detail: ' did not throw' };
  } catch (e) {
    return { ok: e instanceof streaming.StreamError && !/502/.test(e.message), detail: ` message=${JSON.stringify(e.message)}` };
  }
}));
cases.push(async () => run('sse', 'abort mid-stream → StreamError with aborted=true', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({
    async start(c) {
      c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
      await sleep(150);
      controller.abort();
      await sleep(300);
      try { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n')); } catch { /* closed */ }
      try { c.close(); } catch { /* ignore */ }
    },
  });
  const res = new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  try {
    await streaming.consumeSSE(res, () => {}, controller.signal);
    return { ok: false, detail: ' did not throw' };
  } catch (e) {
    return { ok: e instanceof streaming.StreamError && e.aborted === true, detail: ` aborted=${e.aborted}` };
  }
}));

/* ================= Markdown ================= */
cases.push(() => run('markdown', 'headings + bold + italic + inline code', () => {
  const html = md.markdownToHtml('# Title\n\nHello **bold** and *italic* and `code`.');
  return { ok: /<h2>Title<\/h2>/.test(html) && /<strong>bold<\/strong>/.test(html) && /<em>italic<\/em>/.test(html) && /<code>code<\/code>/.test(html), detail: ` ${html.slice(0, 160)}` };
}));
cases.push(() => run('markdown', 'unordered + ordered lists', () => {
  const html = md.markdownToHtml('- one\n- two\n\n1. first\n2. second');
  return { ok: /<ul>/.test(html) && /<li>one<\/li>/.test(html) && /<ol>/.test(html) && /<li>second<\/li>/.test(html), detail: ` ${html.slice(0, 160)}` };
}));
cases.push(() => run('markdown', 'pipe table renders with headers', () => {
  const html = md.markdownToHtml('| Service | Amount |\n|---|---|\n| Xerox | ₹300.00 |');
  return { ok: /<table>/.test(html) && /<th>Service<\/th>/.test(html) && /<td>₹300.00<\/td>/.test(html), detail: ` ${html.slice(0, 200)}` };
}));
cases.push(() => run('markdown', 'fenced code block + unclosed fence still renders as code', () => {
  const closed = md.markdownToHtml('```\nconst a = 1;\n```');
  const open = md.markdownToHtml('```\nconst a = 1;');
  return { ok: /<pre><code>const a = 1;<\/code><\/pre>/.test(closed) && /<pre><code>const a = 1;<\/code><\/pre>/.test(open), detail: ` closed=${closed} open=${open}` };
}));
cases.push(() => run('markdown', 'HTML is escaped — no markup injection', () => {
  const html = md.markdownToHtml('Hello <script>alert(1)</script> **x**');
  return { ok: !/<script>/.test(html) && /&lt;script&gt;/.test(html), detail: ` ${html}` };
}));

/* ================= Legacy key migration ================= */
function makeShim() {
  const store = new Map();
  return {
    store,
    window: {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
      },
    },
  };
}
function loadAiFresh(shim) {
  globalThis.window = shim.window;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(outDir)) delete require.cache[key];
  }
  return require(path.join(outDir, 'conversation-ai.js'));
}
function seedLegacy(shim, profiles, activeId) {
  shim.window.localStorage.setItem('bizkhata.v1', JSON.stringify({ activeProfileId: activeId, profiles }));
}
cases.push(() => run('migration', 'old profile key present → new getter returns it (opaque copy)', () => {
  const shim = makeShim();
  seedLegacy(shim, [{ id: 'p1', name: 'Shop', geminiKey: 'legacy-key-abc' }], 'p1');
  const ai = loadAiFresh(shim);
  const got = ai.getAiServiceKey();
  const inNewSlot = shim.window.localStorage.getItem('bizkhata.ai.service.key.v1');
  const legacy = JSON.parse(shim.window.localStorage.getItem('bizkhata.v1'));
  const kept = legacy.profiles[0].geminiKey === 'legacy-key-abc';
  return { ok: got === 'legacy-key-abc' && inNewSlot === 'legacy-key-abc' && kept, detail: ` got=${got === 'legacy-key-abc' ? 'copied' : got} keptOriginal=${kept}` };
}));
cases.push(() => run('migration', 'new key present → old key ignored', () => {
  const shim = makeShim();
  shim.window.localStorage.setItem('bizkhata.ai.service.key.v1', 'new-key-xyz');
  seedLegacy(shim, [{ id: 'p1', name: 'Shop', geminiKey: 'legacy-key-abc' }], 'p1');
  const ai = loadAiFresh(shim);
  const got = ai.getAiServiceKey();
  return { ok: got === 'new-key-xyz', detail: ` got=${got}` };
}));
cases.push(() => run('migration', 'neither key present → empty', () => {
  const shim = makeShim();
  seedLegacy(shim, [{ id: 'p1', name: 'Shop' }], 'p1');
  const ai = loadAiFresh(shim);
  return { ok: ai.getAiServiceKey() === '' && ai.hasAiServiceKey() === false, detail: '' };
}));
cases.push(() => run('migration', 'removal is respected — no re-migration after clear', () => {
  const shim = makeShim();
  seedLegacy(shim, [{ id: 'p1', name: 'Shop', geminiKey: 'legacy-key-abc' }], 'p1');
  const ai = loadAiFresh(shim);
  const first = ai.getAiServiceKey();
  ai.clearAiServiceKey();
  const after = ai.getAiServiceKey();
  return { ok: first === 'legacy-key-abc' && after === '', detail: ` first=${first === 'legacy-key-abc' ? 'copied' : first} afterClear=${JSON.stringify(after)}` };
}));
cases.push(() => run('migration', 'active profile preferred when several profiles carry a key', () => {
  const shim = makeShim();
  seedLegacy(shim, [
    { id: 'p1', name: 'Shop 1', geminiKey: 'key-one' },
    { id: 'p2', name: 'Shop 2', geminiKey: 'key-two' },
  ], 'p2');
  const ai = loadAiFresh(shim);
  return { ok: ai.getAiServiceKey() === 'key-two', detail: '' };
}));

/* ================= Model constant (UPDATE 19) ================= */
// The agreed live model (verified 2026-11-27 against Google's own
// models page, ai.google.dev/gemini-api/docs/models). The previous
// value was SHUT DOWN (June 1, 2026), so a dead model here fails
// every cloud call even with a valid key. The client constant and
// the Pages Function constant must agree, and the value must never
// appear in any UI file. Models get shut down — re-check this value
// against Google's models page periodically.
const AGREED_MODEL = 'gemini-3.8-flash';
const DEAD_MODEL = 'gemini-2.0-flash';
function readSource(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function allSourceFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) allSourceFiles(p, acc);
    else if (/\.(ts|tsx|js|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
cases.push(() => run('model', 'client DEFAULT_MODEL equals the agreed live model', () => {
  const ai = loadAiFresh(makeShim());
  return { ok: ai.DEFAULT_MODEL === AGREED_MODEL, detail: ` DEFAULT_MODEL=${ai.DEFAULT_MODEL}` };
}));
cases.push(() => run('model', 'Pages Function UPSTREAM_MODEL equals the agreed live model', () => {
  const src = readSource('functions/api/ai-chat.ts');
  const m = src.match(/UPSTREAM_MODEL\s*=\s*'([^']+)'/);
  return { ok: m !== null && m[1] === AGREED_MODEL, detail: ` UPSTREAM_MODEL=${m ? m[1] : '?'}` };
}));
cases.push(() => run('model', 'all three call paths send a model field', () => {
  const client = readSource('src/lib/conversation-ai.ts');
  const fn = readSource('functions/api/ai-chat.ts');
  const clientUses = (client.match(/model:\s*DEFAULT_MODEL/g) || []).length;
  const fnUses = (fn.match(/model:\s*UPSTREAM_MODEL/g) || []).length;
  return { ok: clientUses === 2 && fnUses === 1, detail: ` client=${clientUses} function=${fnUses}` };
}));
cases.push(() => run('model', 'dead (shut-down) model appears nowhere in src/ or functions/', () => {
  const bad = [];
  for (const f of [...allSourceFiles(path.join(root, 'src')), ...allSourceFiles(path.join(root, 'functions'))]) {
    if (fs.readFileSync(f, 'utf8').includes(DEAD_MODEL)) bad.push(path.relative(root, f));
  }
  return { ok: bad.length === 0, detail: bad.length ? ` found in: ${bad.join(', ')}` : '' };
}));
cases.push(() => run('model', 'model value never appears in UI files', () => {
  const bad = [];
  for (const rel of ['src/components/chatbot.tsx', 'src/components/views-reports.tsx', 'src/app/globals.css']) {
    if (readSource(rel).includes(AGREED_MODEL)) bad.push(rel);
  }
  return { ok: bad.length === 0, detail: bad.length ? ` found in: ${bad.join(', ')}` : '' };
}));

/* ================= Run ================= */
for (const c of cases) {
  const r = c();
  if (r && typeof r.then === 'function') await r;
}
delete globalThis.window;
finish();
