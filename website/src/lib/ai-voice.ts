/**
 * BizKhata AI voice — UPDATE 25.
 *
 * The owner (2026-11-27 19:01 IST): "Phone Ki Awaz Mat Do Proper Ai
 * Ki Voice Chahiye Muje" — NO phone/device voice. Spoken replies now
 * come from a real AI text-to-speech service (the same key the owner
 * already saved on his device, Settings → AI Chat), never from the
 * browser/device speech synthesis. There is NO device-voice fallback
 * anywhere in this module: when the AI voice cannot speak (no key,
 * daily limit reached, network failure), the reply stays text-only
 * with one honest line — the device voice is never substituted.
 *
 * FREE-TIER RATIONING (honest numbers): the voice service is free
 * but rationed — community/AI-Studio reports say ~10 spoken replies
 * a day for this voice model, and the exact number for the owner's
 * project can only be read on his AI Studio rate-limit page. The
 * design cap is therefore 10 spoken replies/day, counted on-device,
 * reset at midnight Pacific (the provider resets daily quotas at
 * midnight Pacific). The counter is visible in chat and in
 * Settings → Voice, and the limit is a hard stop, never a silent
 * fallback. Speaking does NOT consume the chat quota (rate limits are
 * per-model, per-project), but each spoken reply costs exactly 1
 * voice call no matter how short — so only SHORT replies are spoken
 * (first 2 sentences, max 400 characters); long replies stay
 * text-only.
 *
 * Speech input (STT) is unchanged and still lives in voice.ts
 * (browser speech recognition). This module is the OUTPUT side only:
 * quota, request building, response parsing, and <audio> playback.
 *
 * No provider/model name ever appears in any UI string, message or
 * error from this module — only "AI voice". The model id below is
 * internal (sent in the request body only), like DEFAULT_MODEL in
 * conversation-ai.ts. The key is never stored, logged or displayed
 * here — it is passed in by the caller (from the on-device key slot)
 * and sent only to the relay / the documented endpoint.
 */
import { cleanSpokenText, shortenForVoice } from './voice';
import type { BusinessProfile } from './types';

/** Internal voice model id — request body only, never shown in UI. */
export const AI_VOICE_MODEL = 'gemini-3.8-flash-lite-tts';
/** Documented Interactions API endpoint for speech generation. The
 *  OpenAI-compatible chat endpoint is text-only and is NOT used here. */
export const AI_VOICE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
/** Daily ration: spoken replies per day (conservative working
 *  assumption from community reports: ~10/day for this model). */
export const AI_VOICE_DAILY_LIMIT = 10;
/** The voice service allows ~3 requests/minute — serialize spoken
 *  replies at least this far apart so rapid replies never 429. */
export const AI_VOICE_MIN_GAP_MS = 21000;
/** Spoken-text cap: first 2 sentences, at most this many chars. */
export const AI_VOICE_MAX_CHARS = 400;

/**
 * Prebuilt voices the owner can hear and pick (Settings → Voice).
 * Plain names only — no provider/model words. Kore is the default.
 * The same voice speaks any supported language (Hindi, Hinglish,
 * Gujarati, ...); the voice is not language-specific.
 */
export interface AiVoiceOption {
  id: string;
  label: string;
  hint: string;
}
export const AI_VOICES: AiVoiceOption[] = [
  { id: 'Kore', label: 'Kore', hint: 'Default — clear and friendly' },
  { id: 'Puck', label: 'Puck', hint: 'Bright and lively' },
  { id: 'Charon', label: 'Charon', hint: 'Calm and steady' },
  { id: 'Fenrir', label: 'Fenrir', hint: 'Warm and deep' },
];
export const AI_VOICE_DEFAULT = 'Kore';

/** Sentence used by the "hear the voice" test in Settings. Counts as
 *  one spoken reply, like any other — the UI says so plainly. */
export const AI_VOICE_TEST_SENTENCE =
  'Namaste bhai! Aaj ka total paanch sau rupaye hai, UPI se teen sau aaye.';

/** The voice the profile picked (default Kore when unset/unknown). */
export function aiVoiceFor(profile: BusinessProfile | null | undefined): string {
  const v = profile?.aiVoice || '';
  if (v && AI_VOICES.some((o) => o.id === v)) return v;
  return AI_VOICE_DEFAULT;
}

/* ================= Daily quota (midnight Pacific reset) ================ */

const VOICE_COUNT_STORAGE = 'bizkhata.ai.voice.count.v1';
const memCount = new Map<string, string>();

function storeGet(k: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(k);
  } catch { /* ignore */ }
  return memCount.get(k) ?? null;
}
function storeSet(k: string, v: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem(k, v); return; }
  } catch { /* ignore */ }
  memCount.set(k, v);
}

/**
 * Calendar date in the America/Los_Angeles timezone — the provider
 * resets daily quotas at midnight Pacific, so the on-device counter
 * must reset on the same boundary (a local-midnight reset would let
 * the owner spend "tomorrow's" voices while the provider still
 * counts them as today, and hit a 429 mid-day).
 */
export function pacificDateString(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

export interface VoiceUsage {
  date: string;
  used: number;
}

/** Spoken replies used so far today (Pacific day). */
export function voiceUsageToday(now: Date = new Date()): VoiceUsage {
  const date = pacificDateString(now);
  try {
    const raw = storeGet(VOICE_COUNT_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as VoiceUsage;
      if (parsed && parsed.date === date && Number.isFinite(parsed.used)) {
        return { date, used: Math.max(0, Math.floor(parsed.used)) };
      }
    }
  } catch { /* corrupt entry — start fresh */ }
  return { date, used: 0 };
}

export function voiceRemaining(now: Date = new Date()): number {
  return Math.max(0, AI_VOICE_DAILY_LIMIT - voiceUsageToday(now).used);
}

export function canSpeakToday(now: Date = new Date()): boolean {
  return voiceRemaining(now) > 0;
}

/** Record one spent spoken reply; returns the new used count. */
export function recordVoiceUse(now: Date = new Date()): number {
  const u = voiceUsageToday(now);
  const next = Math.min(AI_VOICE_DAILY_LIMIT, u.used + 1);
  storeSet(VOICE_COUNT_STORAGE, JSON.stringify({ date: u.date, used: next }));
  return next;
}

/** A 429 from the service means the provider-side limit is hit even
 *  if the on-device counter disagrees — stop for today, honestly. */
export function markVoiceQuotaExhausted(now: Date = new Date()): number {
  const u = voiceUsageToday(now);
  storeSet(VOICE_COUNT_STORAGE, JSON.stringify({ date: u.date, used: AI_VOICE_DAILY_LIMIT }));
  return AI_VOICE_DAILY_LIMIT;
}

/** "AI voice: 7/10 aaj" — shown in chat and in Settings → Voice. */
export function voiceCounterText(now: Date = new Date()): string {
  const u = voiceUsageToday(now);
  return `AI voice: ${u.used}/${AI_VOICE_DAILY_LIMIT} aaj`;
}

/* ================= Honest user-facing lines (no provider words) ================= */

export const VOICE_NO_KEY =
  'AI awaz ke liye key chahiye — Settings → AI Chat mein key save karo, phir awaz chalegi. Tab tak jawab text mein padh lo.';
export const VOICE_QUOTA_DONE =
  'Aaj ki AI awaz khatam ho gayi hai — kal subah phir milegi. Tab tak jawab chat mein padh lo.';
export const VOICE_LONG_REPLY_NOTE =
  'Lamba jawab hai — sirf pehli lines bol raha hoon, poora jawab chat mein padh lo.';

/* ================= Spoken text (short replies only) ================= */

export interface PreparedSpeech {
  /** Text to send to the voice service (already cleaned). */
  text: string;
  /** True when the reply was cut down to the spoken cap. */
  wasTrimmed: boolean;
}

/**
 * Short replies only: first 2 sentences, max 400 chars. A long
 * reply (full day summary, checklist) is never read out in full —
 * the owner hears the first lines and reads the rest on screen.
 */
export function prepareSpokenText(text: string): PreparedSpeech {
  const short = shortenForVoice(text, 2);
  const cleaned = cleanSpokenText(short, AI_VOICE_MAX_CHARS);
  const full = cleanSpokenText(text, 100000);
  return { text: cleaned, wasTrimmed: full.length > cleaned.length + 1 };
}

/* ================= Request building (Interactions API) ================= */

/**
 * Request body for the documented Interactions API speech call.
 * Audio comes back base64 in steps[].content[].data. The key is NOT
 * part of the body — it travels in the x-goog-api-key header.
 */
export function ttsRequestBody(text: string, voiceName: string): Record<string, unknown> {
  const voice = AI_VOICES.some((o) => o.id === voiceName) ? voiceName : AI_VOICE_DEFAULT;
  return {
    model: AI_VOICE_MODEL,
    input: [
      {
        type: 'user_input',
        content: [
          {
            type: 'text',
            text,
            annotations: [
              { type: 'speech_metadata', style: 'warm, friendly, speaking clearly and naturally' },
            ],
          },
        ],
      },
    ],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  };
}

/** Extract the base64 audio bytes from an Interactions API answer.
 *  Returns null when the shape is not recognised (never throws). */
export function extractTtsAudio(payload: unknown): { audioBase64: string; mime: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const steps = root.steps;
  if (!Array.isArray(steps)) {
    // Some shapes carry the audio at the top level.
    if (typeof root.data === 'string' && root.data.length > 0) {
      return { audioBase64: root.data, mime: typeof root.mimeType === 'string' ? root.mimeType : 'audio/wav' };
    }
    return null;
  }
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (typeof it.data === 'string' && it.data.length > 0) {
        return {
          audioBase64: it.data,
          mime: typeof it.mimeType === 'string' ? it.mimeType : 'audio/wav',
        };
      }
      const inline = it.inlineData as Record<string, unknown> | undefined;
      if (inline && typeof inline.data === 'string' && inline.data.length > 0) {
        return {
          audioBase64: inline.data,
          mime: typeof inline.mimeType === 'string' ? inline.mimeType : 'audio/wav',
        };
      }
    }
  }
  return null;
}

/** Base64 → bytes (browser atob + Node Buffer both work). */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ================= <audio> playback (interruptible) ================= */

export interface AudioLike {
  src: string;
  /** (ev: unknown) so a real HTMLAudioElement fits: its onended
   *  takes an Event, which is assignable to unknown. */
  onended: ((ev: unknown) => void) | null;
  onerror: ((error: string) => void) | null;
  play: () => Promise<void> | void;
  pause: () => void;
}

/**
 * Thin wrapper over one <audio> element: play base64 WAV audio from
 * a blob URL, stop immediately on interrupt. Word-boundary events
 * do not exist for AI audio (the old device-voice highlight is gone
 * with the device voice — the UI shows a plain "speaking" state).
 * All browser audio objects are injected, so tests drive it with
 * fakes and no real speaker is ever needed here.
 */
export class AiVoicePlayer {
  private createAudio: () => AudioLike;
  private createObjectUrl: (bytes: Uint8Array, mime: string) => string;
  private revokeObjectUrl: (url: string) => void;
  private audio: AudioLike | null = null;
  private currentUrl: string | null = null;
  private playing = false;
  onEnded: (() => void) | null = null;

  constructor(opts: {
    createAudio: () => AudioLike;
    createObjectUrl: (bytes: Uint8Array, mime: string) => string;
    revokeObjectUrl: (url: string) => void;
  }) {
    this.createAudio = opts.createAudio;
    this.createObjectUrl = opts.createObjectUrl;
    this.revokeObjectUrl = opts.revokeObjectUrl;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Play base64 audio. Stops any audio already playing first. */
  async play(audioBase64: string, mime: string): Promise<boolean> {
    this.stop();
    let url: string;
    try {
      url = this.createObjectUrl(base64ToBytes(audioBase64), mime || 'audio/wav');
    } catch {
      return false;
    }
    const audio = this.createAudio();
    this.audio = audio;
    this.currentUrl = url;
    this.playing = true;
    audio.src = url;
    audio.onended = () => {
      this.playing = false;
      this.cleanupUrl();
      this.audio = null;
      if (this.onEnded) this.onEnded();
    };
    audio.onerror = () => {
      this.playing = false;
      this.cleanupUrl();
      this.audio = null;
    };
    try {
      await audio.play();
    } catch {
      this.playing = false;
      this.cleanupUrl();
      this.audio = null;
      return false;
    }
    return true;
  }

  /** Stop immediately (mic tap / Stop button / "Bas"). Nothing is
   *  queued behind it — a stopped reply never resumes. */
  stop(): void {
    const audio = this.audio;
    this.audio = null;
    this.playing = false;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch { /* ignore */ }
    }
    this.cleanupUrl();
  }

  private cleanupUrl(): void {
    if (this.currentUrl) {
      try { this.revokeObjectUrl(this.currentUrl); } catch { /* ignore */ }
      this.currentUrl = null;
    }
  }
}

/* ================= One spoken reply, end to end ================= */

export type AiVoiceFailureReason =
  | 'no-key'
  | 'quota'
  | 'rate-gap'
  | 'network'
  | 'upstream'
  | 'empty';

export type AiVoiceResult =
  | { ok: true; used: number; remaining: number; trimmed: boolean; lastCallMs: number }
  | { ok: false; reason: AiVoiceFailureReason; waitMs?: number };

export interface SpeakAiReplyOpts {
  /** Full bot reply text (spoken part is derived inside). */
  text: string;
  voiceName: string;
  /** Owner's saved key (from the on-device slot) — empty = no key. */
  key: string;
  fetchImpl: (input: string, init?: Record<string, unknown>) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
  player: AiVoicePlayer;
  /** Relay first (same-origin Pages Function); direct call is the
   *  fallback when the relay is not deployed (local static server). */
  relayUrl?: string;
  nowMs?: number;
  /** ms timestamp of the last voice call (rate-gap serialisation). */
  lastCallMs?: number;
}

/**
 * Speak one reply with the real AI voice. Order of checks:
 *   no key → 'no-key' (never speaks, never calls anything);
 *   quota used up → 'quota' (hard stop, no device voice);
 *   called <21s after the previous voice call → 'rate-gap' (the
 *     caller waits and retries once — never two calls at once);
 *   relay / direct fetch → audio bytes → player.play() → record use.
 * The quota is recorded only AFTER audio bytes arrive (a failed
 * call never spends one of the 10). A 429 marks the day exhausted.
 * fetch errors are 'network'; a bad upstream shape is 'upstream'.
 */
export async function speakAiReply(opts: SpeakAiReplyOpts): Promise<AiVoiceResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const key = (opts.key || '').trim();
  if (!key) return { ok: false, reason: 'no-key' };
  const now = new Date(nowMs);
  if (!canSpeakToday(now)) return { ok: false, reason: 'quota' };
  if (opts.lastCallMs !== undefined && nowMs - opts.lastCallMs < AI_VOICE_MIN_GAP_MS) {
    return { ok: false, reason: 'rate-gap', waitMs: AI_VOICE_MIN_GAP_MS - (nowMs - opts.lastCallMs) };
  }
  const prepared = prepareSpokenText(opts.text);
  if (!prepared.text) return { ok: false, reason: 'empty' };
  const body = ttsRequestBody(prepared.text, opts.voiceName);
  const relayUrl = opts.relayUrl ?? '/api/ai-tts';

  // 1. Same-origin relay (Cloudflare Pages Function) — the key goes
  //    to the relay in the POST body, never in a URL, never logged.
  let audio: { audioBase64: string; mime: string } | null = null;
  let saw429 = false;
  try {
    const res = await opts.fetchImpl(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, text: prepared.text, voice: opts.voiceName }),
    });
    if (res.status === 429) saw429 = true;
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      if (data && data.ok === true && typeof data.audio === 'string' && data.audio.length > 0) {
        audio = { audioBase64: data.audio, mime: typeof data.mime === 'string' ? data.mime : 'audio/wav' };
      } else if (data && data.error === 'rate-limited') {
        saw429 = true;
      }
    }
  } catch {
    // Relay unreachable (e.g. local static server) — fall through
    // to the direct call below.
    audio = null;
  }

  // 2. Direct call to the documented endpoint (fallback only).
  if (!audio && !saw429) {
    try {
      const res = await opts.fetchImpl(AI_VOICE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
      if (res.status === 429) saw429 = true;
      else if (res.ok) audio = extractTtsAudio(await res.json());
    } catch {
      return { ok: false, reason: 'network' };
    }
  }
  if (saw429) {
    markVoiceQuotaExhausted(now);
    return { ok: false, reason: 'quota' };
  }
  if (!audio) return { ok: false, reason: 'upstream' };
  const played = await opts.player.play(audio.audioBase64, audio.mime);
  if (!played) return { ok: false, reason: 'upstream' };
  const used = recordVoiceUse(now);
  return { ok: true, used, remaining: Math.max(0, AI_VOICE_DAILY_LIMIT - used), trimmed: prepared.wasTrimmed, lastCallMs: nowMs };
}
