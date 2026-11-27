/**
 * BizKhata AI-voice acceptance suite — UPDATE 25.
 *
 * Drives the REAL ai-voice module (quota, request building, response
 * parsing, <audio> playback, end-to-end speakAiReply) with fake fetch
 * + fake <audio> objects. No microphone, no speaker, no key and no
 * network on this VM — every network call is a stubbed fetch.
 *
 * HONEST SCOPE: what this suite CANNOT prove (owner phone test only):
 * the real voice's sound quality and latency, how Roman Hinglish
 * (vs Devanagari) is pronounced, the exact RPD for the owner's
 * project (only his AI Studio rate-limit page shows it), and the
 * live relay (Cloudflare Pages Function) actually deployed at
 * /api/ai-tts. Those are listed again at the end of the run.
 *
 * Run with `npm test`. Requires no key and no network.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/bizkhata-ai-voice-test';

execSync(
  `npx tsc src/lib/types.ts src/lib/languages.ts src/lib/voice.ts src/lib/ai-voice.ts --outDir ${outDir} --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'pipe' },
);

const require = createRequire(import.meta.url);
const ai = require(path.join(outDir, 'ai-voice.js'));
const voice = require(path.join(outDir, 'voice.js'));

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
function hasNone(t, ...needles) { return !needles.some((n) => String(t).includes(n)); }

// A tiny fake WAV payload (base64) — content does not matter, the
// player only ever sees bytes + a mime type.
const B64 = Buffer.from('RIFFxxxxWAVEfmt data', 'utf8').toString('base64');
// Distinct fake Pacific days, so each speak test gets a fresh quota
// counter (the on-device counter is keyed by Pacific date).
const D = (day, hour = 12) => Date.UTC(2031, 0, day, hour, 0, 0);

/* ================= Fake <audio> ================= */

class FakeAudio {
  constructor() {
    this.src = '';
    this.onended = null;
    this.onerror = null;
    this.playCalls = 0;
    this.paused = false;
    this.played = false;
    this.throwOnPlay = false;
  }
  async play() {
    this.playCalls++;
    if (this.throwOnPlay) throw new Error('play failed');
    this.played = true;
  }
  pause() { this.paused = true; this.played = false; }
  end() { if (this.onended) this.onended(); }
  fail() { if (this.onerror) this.onerror('error'); }
}

function makePlayer() {
  const audios = [];
  const created = [];
  const revoked = [];
  const player = new ai.AiVoicePlayer({
    createAudio: () => { const a = new FakeAudio(); audios.push(a); return a; },
    createObjectUrl: (bytes, mime) => { const u = `blob:fake-${created.length}`; created.push({ url: u, bytes: bytes.length, mime }); return u; },
    revokeObjectUrl: (url) => { revoked.push(url); },
  });
  return { player, audios, created, revoked };
}

function relayOk() {
  return { ok: true, status: 200, json: async () => ({ ok: true, audio: B64, mime: 'audio/wav' }) };
}
function directOk() {
  return { ok: true, status: 200, json: async () => ({ steps: [{ content: [{ data: B64, mimeType: 'audio/wav' }] }] }) };
}
function fetchRecorder(handler) {
  const calls = [];
  const fn = async (input, init) => {
    calls.push({ input, init });
    return handler(input, init);
  };
  fn.calls = calls;
  return fn;
}

console.log('BizKhata AI voice — UPDATE 25 (fake fetch + fake <audio>; no mic/speaker/key here):');

/* ================= 1. Constants & defaults ================= */
section('caps, counter and voice defaults (UPDATE 25)');
{
  check('daily limit is 10 spoken replies', ai.AI_VOICE_DAILY_LIMIT, 10);
  check('min gap is 21s (3 RPM)', ai.AI_VOICE_MIN_GAP_MS, 21000);
  check('spoken-text cap is 400 chars', ai.AI_VOICE_MAX_CHARS, 400);
  check('default voice is Kore', ai.AI_VOICE_DEFAULT, 'Kore');
  check('4 voices offered', ai.AI_VOICES.length, 4);
  check('voices are plain names, no provider words', hasNone(ai.AI_VOICES.map((v) => `${v.id} ${v.label} ${v.hint}`).join(' '), 'Gemini', 'Google', 'OpenAI', 'gemini'), true);
  check('voice model is the TTS model (internal only)', ai.AI_VOICE_MODEL, 'gemini-3.8-flash-lite-tts');
  check('endpoint is the Interactions API', ai.AI_VOICE_ENDPOINT, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  check('test sentence is Hinglish', ai.AI_VOICE_TEST_SENTENCE.includes('Namaste bhai'), true);
  check('test sentence is short', ai.AI_VOICE_TEST_SENTENCE.length < 200, true);
}

/* ================= 2. TTS request building ================= */
section('TTS request building (Interactions API)');
{
  const body = ai.ttsRequestBody('Namaste bhai, aaj ka total paanch sau hai.', 'Kore');
  check('body model', body.model, 'gemini-3.8-flash-lite-tts');
  check('body response format is audio', body.response_format?.type, 'audio');
  const input = body.input?.[0];
  check('body input type user_input', input?.type, 'user_input');
  const textPart = input?.content?.[0];
  check('body carries the text', textPart?.text, 'Namaste bhai, aaj ka total paanch sau hai.');
  check('body carries a speaking style', String(textPart?.annotations?.[0]?.style || '').includes('warm'), true);
  check('body speech config voice Kore', body.generation_config?.speech_config?.[0]?.voice, 'Kore');
  check('body never contains a key', hasNone(JSON.stringify(body), 'test-key', 'x-goog-api-key', 'api_key'), true);
  check('unknown voice falls back to Kore', ai.ttsRequestBody('Hi', 'NoSuchVoice').generation_config.speech_config[0].voice, 'Kore');
  check('Puck is accepted', ai.ttsRequestBody('Hi', 'Puck').generation_config.speech_config[0].voice, 'Puck');
  check('Charon is accepted', ai.ttsRequestBody('Hi', 'Charon').generation_config.speech_config[0].voice, 'Charon');
  check('Fenrir is accepted', ai.ttsRequestBody('Hi', 'Fenrir').generation_config.speech_config[0].voice, 'Fenrir');
}

/* ================= 3. Response parsing ================= */
section('extractTtsAudio (response parsing)');
{
  check('steps shape', ai.extractTtsAudio({ steps: [{ content: [{ data: B64, mimeType: 'audio/wav' }] }] })?.audioBase64, B64);
  check('steps mime kept', ai.extractTtsAudio({ steps: [{ content: [{ data: B64, mimeType: 'audio/wav' }] }] })?.mime, 'audio/wav');
  check('inlineData fallback', ai.extractTtsAudio({ steps: [{ content: [{ inlineData: { data: B64, mimeType: 'audio/wav' } }] }] })?.audioBase64, B64);
  check('top-level data fallback', ai.extractTtsAudio({ data: B64 })?.audioBase64, B64);
  check('garbage → null', ai.extractTtsAudio({ steps: [{ content: [{ text: 'hello' }] }] }), null);
  check('empty → null', ai.extractTtsAudio({}), null);
  check('null → null', ai.extractTtsAudio(null), null);
  check('base64 round-trip', Buffer.from(ai.base64ToBytes(B64)).toString('base64'), B64);
}

/* ================= 4. Spoken-text cap ================= */
section('short replies only (2 sentences / 400 chars)');
{
  const short = ai.prepareSpokenText('Namaste bhai! Aaj ka total paanch sau hai.');
  check('short reply not trimmed', short.wasTrimmed, false);
  check('short reply kept whole', short.text, 'Namaste bhai! Aaj ka total paanch sau hai.');
  const long = ai.prepareSpokenText('Pehli line. Dusri line. Teesri line jo lambi hai aur aage badhti hai. Chauthi line bhi hai.');
  check('long reply trimmed', long.wasTrimmed, true);
  check('long reply is 2 sentences', long.text, 'Pehli line. Dusri line.');
  const huge = ai.prepareSpokenText('A'.repeat(900) + '. B'.repeat(50));
  check('huge reply capped at 400 chars', huge.text.length <= 400, true);
  check('huge reply trimmed', huge.wasTrimmed, true);
  check('empty reply → empty', ai.prepareSpokenText('   ').text, '');
  check('markdown stripped for speech', ai.prepareSpokenText('**Profit** ₹500 hai.').text.includes('**'), false);
}

/* ================= 5. Quota & counter ================= */
section('quota / counter (10 per day, midnight Pacific reset)');
{
  const day = new Date(D(5));
  check('fresh day: 0 used', ai.voiceUsageToday(day).used, 0);
  check('fresh day: 10 remaining', ai.voiceRemaining(day), 10);
  check('fresh day: can speak', ai.canSpeakToday(day), true);
  check('counter text fresh', ai.voiceCounterText(day), 'AI voice: 0/10 aaj');
  check('record 1 use', ai.recordVoiceUse(day), 1);
  check('after 1: 1 used', ai.voiceUsageToday(day).used, 1);
  check('after 1: 9 remaining', ai.voiceRemaining(day), 9);
  check('counter text after 1', ai.voiceCounterText(day), 'AI voice: 1/10 aaj');
  for (let i = 0; i < 11; i++) ai.recordVoiceUse(day);
  check('cap stops at 10 (11 extra records)', ai.voiceUsageToday(day).used, 10);
  check('at cap: 0 remaining', ai.voiceRemaining(day), 0);
  check('at cap: cannot speak', ai.canSpeakToday(day), false);
  check('counter text at cap', ai.voiceCounterText(day), 'AI voice: 10/10 aaj');
  // Next Pacific day starts fresh.
  const nextDay = new Date(D(6));
  check('next Pacific day resets to 0', ai.voiceUsageToday(nextDay).used, 0);
  check('next Pacific day can speak', ai.canSpeakToday(nextDay), true);
  // Midnight-Pacific boundary: 23:00 PST on the 4th is still the 4th;
  // 00:30 PST on the 5th is already the 5th.
  const beforeMidnight = new Date(Date.UTC(2031, 0, 5, 7, 0, 0)); // 23:00 PST Jan 4
  const afterMidnight = new Date(Date.UTC(2031, 0, 5, 8, 30, 0)); // 00:30 PST Jan 5
  check('Pacific date before midnight is Jan 4', ai.pacificDateString(beforeMidnight), '2031-01-04');
  check('Pacific date after midnight is Jan 5', ai.pacificDateString(afterMidnight), '2031-01-05');
  ai.recordVoiceUse(beforeMidnight);
  check('use recorded on Jan 4 does not carry to Jan 5', ai.voiceUsageToday(afterMidnight).used, 0);
  // A 429 exhausts the day even if the on-device counter disagrees.
  const day7 = new Date(D(7));
  check('mark exhausted → 10', ai.markVoiceQuotaExhausted(day7), 10);
  check('exhausted day cannot speak', ai.canSpeakToday(day7), false);
}

/* ================= 6. Voice pick persistence ================= */
section('voice pick (aiVoiceFor)');
{
  const p = (aiVoice) => ({ id: 'prof1', aiVoice });
  check('no profile → Kore', ai.aiVoiceFor(null), 'Kore');
  check('unset → Kore', ai.aiVoiceFor(p(undefined)), 'Kore');
  check('saved Puck → Puck', ai.aiVoiceFor(p('Puck')), 'Puck');
  check('saved Charon → Charon', ai.aiVoiceFor(p('Charon')), 'Charon');
  check('saved Fenrir → Fenrir', ai.aiVoiceFor(p('Fenrir')), 'Fenrir');
  check('unknown saved name → Kore', ai.aiVoiceFor(p('Google हिन्दी')), 'Kore');
}

/* ================= 7. No device voice anywhere ================= */
section('no device voice — speechSynthesis is never called');
{
  const srcVoice = fs.readFileSync(path.join(root, 'src/lib/voice.ts'), 'utf8');
  const srcAiVoice = fs.readFileSync(path.join(root, 'src/lib/ai-voice.ts'), 'utf8');
  check('ai-voice.ts never mentions speechSynthesis', !srcAiVoice.includes('speechSynthesis'), true);
  check('ai-voice.ts never calls synth.speak', !srcAiVoice.includes('synth.speak'), true);
  check('voice.ts has no speechSynthesis call (only a comment)', !/speechSynthesis\s*\(|speechSynthesis\./.test(srcVoice), true);
  check('voice.ts speak() is a no-op returning false', new voice.VoiceController({ createRecognition: () => null, getSettings: () => ({ ...voice.DEFAULT_VOICE_SETTINGS }) }, { onState: () => {}, onFinalTranscript: () => {}, onInterimTranscript: () => {}, onError: () => {} }).speak('Namaste', 'hi-IN'), false);
  check('VoiceController.isSpeaking always false', new voice.VoiceController({ createRecognition: () => null, getSettings: () => ({ ...voice.DEFAULT_VOICE_SETTINGS }) }, { onState: () => {}, onFinalTranscript: () => {}, onInterimTranscript: () => {}, onError: () => {} }).isSpeaking, false);
  const srcChatbot = fs.readFileSync(path.join(root, 'src/components/chatbot.tsx'), 'utf8');
  check('chatbot.tsx never calls speechSynthesis', !/speechSynthesis\s*\(|speechSynthesis\./.test(srcChatbot), true);
  const srcSettings = fs.readFileSync(path.join(root, 'src/components/views-reports.tsx'), 'utf8');
  check('Settings never calls speechSynthesis', !/speechSynthesis\s*\(|speechSynthesis\./.test(srcSettings), true);
  check('honest no-key line has no provider name', hasNone(ai.VOICE_NO_KEY, 'Gemini', 'Google', 'OpenAI', 'gemini'), true);
  check('honest quota line has no provider name', hasNone(ai.VOICE_QUOTA_DONE, 'Gemini', 'Google', 'OpenAI', 'gemini'), true);
  check('honest long-reply note has no provider name', hasNone(ai.VOICE_LONG_REPLY_NOTE, 'Gemini', 'Google', 'OpenAI', 'gemini'), true);
  check('no-key line guides to Settings → AI Chat', ai.VOICE_NO_KEY.includes('AI Chat'), true);
  check('quota line says tomorrow', ai.VOICE_QUOTA_DONE.includes('kal'), true);
}

/* ================= 8. Player: interruption ================= */
section('AiVoicePlayer — interruption (stop is immediate)');
{
  const { player, audios, created, revoked } = makePlayer();
  let ended = 0;
  player.onEnded = () => { ended++; };
  check('not playing before play', player.isPlaying, false);
  const ok1 = await player.play(B64, 'audio/wav');
  check('play succeeds', ok1, true);
  check('playing after play', player.isPlaying, true);
  check('audio src is the blob URL', audios[0].src, created[0].url);
  check('play called once', audios[0].playCalls, 1);
  // A second play stops the first immediately (pause + revoke).
  const ok2 = await player.play(B64, 'audio/wav');
  check('second play succeeds', ok2, true);
  check('first audio paused by second play', audios[0].paused, true);
  check('first blob URL revoked', revoked.includes(created[0].url), true);
  check('still playing after second play', player.isPlaying, true);
  // Stop: pause + revoke immediately, nothing queued.
  player.stop();
  check('stop → not playing', player.isPlaying, false);
  check('stop pauses current audio', audios[1].paused, true);
  check('stop revokes current URL', revoked.includes(created[1].url), true);
  check('stop does not fire onEnded', ended, 0);
  // Natural end: onEnded fires, URL revoked, not playing.
  await player.play(B64, 'audio/wav');
  audios[2].end();
  check('onEnded fired on natural end', ended, 1);
  check('natural end → not playing', player.isPlaying, false);
  check('natural end revokes URL', revoked.includes(created[2].url), true);
  // A stopped reply never resumes: its onended is detached.
  await player.play(B64, 'audio/wav');
  player.stop();
  audios[3].end();
  check('stopped reply does not fire onEnded', ended, 1);
  // A failed play reports false.
  const badPlayer = new ai.AiVoicePlayer({
    createAudio: () => { const a = new FakeAudio(); a.throwOnPlay = true; return a; },
    createObjectUrl: () => 'blob:bad',
    revokeObjectUrl: () => {},
  });
  check('failed play returns false', await badPlayer.play(B64, 'audio/wav'), false);
  check('failed play → not playing', badPlayer.isPlaying, false);
}

/* ================= 9. speakAiReply end to end ================= */
section('speakAiReply — end to end (fake fetch)');
{
  // (a) No key → no-key, fetch NEVER called, quota untouched.
  {
    const fetch = fetchRecorder(async () => relayOk());
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste bhai', voiceName: 'Kore', key: '', fetchImpl: fetch, player, nowMs: D(10) });
    check('no key → no-key', res.reason, 'no-key');
    check('no key → fetch never called', fetch.calls.length, 0);
    check('no key → quota untouched', ai.voiceUsageToday(new Date(D(10))).used, 0);
  }
  // (b) Relay success → ok, quota +1, player played, key in body only.
  {
    const fetch = fetchRecorder(async () => relayOk());
    const { player, audios } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste bhai! Aaj ka total paanch sau hai.', voiceName: 'Kore', key: 'k-secret-1', fetchImpl: fetch, player, nowMs: D(11) });
    check('relay success → ok', res.ok, true);
    check('relay success → used 1', res.used, 1);
    check('relay success → 9 remaining', res.remaining, 9);
    check('relay success → not trimmed', res.trimmed, false);
    check('relay success → player played', audios[0].played, true);
    check('relay called once', fetch.calls.length, 1);
    check('relay URL is /api/ai-tts', fetch.calls[0].input, '/api/ai-tts');
    check('relay method POST', fetch.calls[0].init.method, 'POST');
    const body = JSON.parse(fetch.calls[0].init.body);
    check('relay body carries key', body.key, 'k-secret-1');
    check('relay body carries text', body.text.includes('Namaste bhai'), true);
    check('relay body carries voice', body.voice, 'Kore');
    check('key never in the URL', !String(fetch.calls[0].input).includes('k-secret-1'), true);
  }
  // (c) Quota out → quota, fetch NEVER called.
  {
    const day = new Date(D(12));
    for (let i = 0; i < 10; i++) ai.recordVoiceUse(day);
    const fetch = fetchRecorder(async () => relayOk());
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(12) });
    check('quota out → quota', res.reason, 'quota');
    check('quota out → fetch never called', fetch.calls.length, 0);
  }
  // (d) Rate gap: called <21s after the last call → rate-gap + waitMs.
  {
    const fetch = fetchRecorder(async () => relayOk());
    const { player } = makePlayer();
    const now = D(13);
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: now, lastCallMs: now - 5000 });
    check('rate gap → rate-gap', res.reason, 'rate-gap');
    check('rate gap → waitMs is 16s', res.waitMs, 16000);
    check('rate gap → fetch never called', fetch.calls.length, 0);
    const okAfter = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: now, lastCallMs: now - 30000 });
    check('after 30s gap → speaks', okAfter.ok, true);
  }
  // (e) Relay 429 → quota + day marked exhausted.
  {
    const fetch = fetchRecorder(async () => ({ ok: false, status: 429, json: async () => ({ ok: false, error: 'rate-limited' }) }));
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(14) });
    check('relay 429 → quota', res.reason, 'quota');
    check('relay 429 → day exhausted', ai.canSpeakToday(new Date(D(14))), false);
  }
  // (f) Relay down → direct call fallback, with the key in the header.
  {
    const fetch = fetchRecorder(async (input) => {
      if (input === '/api/ai-tts') throw new Error('relay down');
      return directOk();
    });
    const { player, audios } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste bhai', voiceName: 'Puck', key: 'k-secret-2', fetchImpl: fetch, player, nowMs: D(15) });
    check('relay down → direct fallback speaks', res.ok, true);
    check('direct fallback → player played', audios[0].played, true);
    const direct = fetch.calls.find((c) => c.input === ai.AI_VOICE_ENDPOINT);
    check('direct call hit the Interactions endpoint', !!direct, true);
    check('direct call carries key in header', direct.init.headers['x-goog-api-key'], 'k-secret-2');
    const body = JSON.parse(direct.init.body);
    check('direct body model', body.model, 'gemini-3.8-flash-lite-tts');
    check('direct body voice Puck', body.generation_config.speech_config[0].voice, 'Puck');
    check('direct body has no key field', !('key' in body), true);
  }
  // (g) Both down → network, quota NOT spent.
  {
    const fetch = fetchRecorder(async () => { throw new Error('down'); });
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(16) });
    check('both down → network', res.reason, 'network');
    check('network failure spends no quota', ai.voiceUsageToday(new Date(D(16))).used, 0);
  }
  // (h) Bad upstream shape → upstream, quota NOT spent.
  {
    const fetch = fetchRecorder(async (input) => {
      if (input === '/api/ai-tts') return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ choices: [] }) };
    });
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(17) });
    check('bad shape → upstream', res.reason, 'upstream');
    check('upstream failure spends no quota', ai.voiceUsageToday(new Date(D(17))).used, 0);
  }
  // (i) Long reply → trimmed, spoken text capped at 400 chars.
  {
    let spokenText = '';
    const fetch = fetchRecorder(async (input, init) => {
      if (input === '/api/ai-tts') { spokenText = JSON.parse(init.body).text; return relayOk(); }
      return directOk();
    });
    const { player } = makePlayer();
    const long = 'Pehli line. Dusri line. ' + 'Teesri line bahut lambi hai. '.repeat(30);
    const res = await ai.speakAiReply({ text: long, voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(18) });
    check('long reply → ok', res.ok, true);
    check('long reply → trimmed', res.trimmed, true);
    check('spoken text capped at 400 chars', spokenText.length <= 400, true);
    check('spoken text is the first 2 sentences', spokenText, 'Pehli line. Dusri line.');
  }
  // (j) Empty reply → empty, nothing called.
  {
    const fetch = fetchRecorder(async () => relayOk());
    const { player } = makePlayer();
    const res = await ai.speakAiReply({ text: '   ', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player, nowMs: D(19) });
    check('empty reply → empty', res.reason, 'empty');
    check('empty reply → fetch never called', fetch.calls.length, 0);
  }
  // (k) Player failure → upstream, quota NOT spent.
  {
    const fetch = fetchRecorder(async () => relayOk());
    const badPlayer = new ai.AiVoicePlayer({
      createAudio: () => { const a = new FakeAudio(); a.throwOnPlay = true; return a; },
      createObjectUrl: () => 'blob:bad',
      revokeObjectUrl: () => {},
    });
    const res = await ai.speakAiReply({ text: 'Namaste', voiceName: 'Kore', key: 'k', fetchImpl: fetch, player: badPlayer, nowMs: D(20) });
    check('player failure → upstream', res.reason, 'upstream');
    check('player failure spends no quota', ai.voiceUsageToday(new Date(D(20))).used, 0);
  }
}

/* ================= Summary ================= */
console.log('\n================ ai-voice test summary ================');
let totalPass = 0;
let total = 0;
for (const [name, r] of Object.entries(results)) {
  if (name === '_cur') continue;
  totalPass += r.pass;
  total += r.total;
  console.log(`  ${r.pass === r.total ? 'PASS' : 'FAIL'} ${name}: ${r.pass}/${r.total}`);
}
console.log(`  TOTAL: ${totalPass}/${total} checks passed`);
console.log('\nUnverified on this VM (no mic, no speaker, no owner key here):');
console.log('  - Real voice quality: does Kore/Puck/Charon/Fenrir sound natural in Hindi/Hinglish/Gujarati?');
console.log('  - Roman Hinglish pronunciation (Devanagari vs Roman) — hearing test on the phone');
console.log('  - Real latency of one spoken reply (network + generation + playback)');
console.log('  - Exact RPD for the owner\'s project (only his AI Studio rate-limit page shows it)');
console.log('  - The /api/ai-tts relay actually deployed and answering on bizkhata.pages.dev');
if (failures > 0 || totalPass !== total) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll AI-voice acceptance checks passed.');
