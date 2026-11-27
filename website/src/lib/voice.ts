/**
 * BizKhata voice layer — UPDATE 18 (website).
 *
 * Voice is a NEW INPUT/OUTPUT MODALITY on top of the existing
 * conversational engine — it never replaces it and never duplicates
 * its intent logic:
 *
 *   spoken words → Web Speech API (SpeechRecognition) → transcript
 *     → the SAME respondToMessage() / intent pipeline as typed chat
 *     (conversation.ts) → reply text → AI voice (ai-voice.ts).
 *
 * UPDATE 25 — the device-voice OUTPUT is GONE. The owner (2026-11-27
 * 19:01 IST): "Phone Ki Awaz Mat Do Proper Ai Ki Voice Chahiye Muje".
 * Speech synthesis (speechSynthesis) is no longer a speech path
 * anywhere: VoiceController.speak() returns false and never touches
 * a synthesis object, and no code in this module creates an
 * utterance. Spoken replies are AI voice only (src/lib/ai-voice.ts:
 * quota + Interactions API + <audio> playback). When the AI voice
 * cannot speak, the reply stays text-only — never the device voice.
 * Speech INPUT (recognition) is unchanged and still lives here.
 *
 * UPDATE 25 — STT thresholds unified with Android (C-16): low-
 * confidence 0.5 (was 0.6 web / 0.45 Android), duplicate window
 * 5 s (was 6 s web / 4 s Android) — the same mumble is treated the
 * same on both surfaces.
 *
 * The conversational intelligence behind the reply is the SAME
 * provider-neutral conversational-AI client as text chat
 * (conversation-ai.ts): when the owner has added a key in
 * Settings → AI Chat, the cloud AI powers the understanding and the
 * reply; without a key, the on-device local engine handles it.
 * Speech-to-text and text-to-speech themselves are NOT that service —
 * they are the browser-native Web Speech API (free, no key, no
 * account). No provider or model name ever appears in any UI text,
 * message, error or label — only "BizKhata AI Assistant".
 *
 * Privacy: audio is processed in the browser only. No recording is
 * stored, uploaded or sent anywhere. The transcript is the only thing
 * that reaches the chat pipeline — exactly like a typed message.
 *
 * Safety (same rules as text chat, enforced here at the voice edge):
 *  - A voice "Haan" confirms ONLY a preview that is already on
 *    screen. Nothing is ever saved from a transcript alone.
 *  - Low-confidence transcripts of financial instructions are NEVER
 *    sent to the parser — the assistant asks the user to repeat.
 *  - Missing amount / mode / service is never guessed — the engine's
 *    clarification draft asks a short question instead.
 *  - A repeated transcript (recognition firing twice, or the user
 *    saying "Haan" twice) can never create a second entry: the
 *    transcript is de-duplicated here AND the confirm flow carries
 *    its idempotency key (assistant.ts).
 *
 * This module is deliberately split in two:
 *  1. Pure, dependency-free helpers (pickVoice, cleanSpokenText,
 *     handleVoiceTranscript, ...) — unit-tested without a browser.
 *  2. VoiceController — a thin, injectable adapter over the browser
 *     SpeechRecognition object (input only). Tests drive it with
 *     fakes; the chat UI uses the real browser object.
 * This VM has no microphone, so no real-voice conversation is ever
 * claimed as tested here — see tests/voice.test.mjs.
 */
import { detectLanguage, voiceLangFor, type AiLangCode } from './languages';
import type { BusinessProfile } from './types';

/* ================= Voice settings (per business profile) ================ */

/** Voice preferences, stored on the business profile (same localStorage
 *  persistence as every other profile setting — never mixed across
 *  profiles, never in backups of the AI key). */
export interface VoiceSettings {
  /** Speak AI replies aloud. Default off — the user turns it on. */
  repliesEnabled: boolean;
  /** Speech rate for spoken replies (0.5 slow … 1.5 fast). */
  rate: number;
  /** Continuous conversation: keep listening across turns. */
  continuous: boolean;
  /** Preferred speech voice name per language code ('default' = any
   *  language). Browser/device voices only — never a cloud voice. */
  voicesByLang: Record<string, string>;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  repliesEnabled: false,
  rate: 1,
  continuous: false,
  voicesByLang: {},
};

/** Read the effective voice settings for one profile. */
export function voiceSettingsFor(profile: BusinessProfile | null | undefined): VoiceSettings {
  if (!profile) return { ...DEFAULT_VOICE_SETTINGS, voicesByLang: {} };
  const rate = typeof profile.voiceRate === 'number' && Number.isFinite(profile.voiceRate)
    ? Math.min(1.5, Math.max(0.5, profile.voiceRate))
    : 1;
  return {
    repliesEnabled: profile.voiceReplies ?? false,
    rate,
    continuous: profile.voiceContinuous ?? false,
    voicesByLang: { ...(profile.voiceByLang || {}) },
  };
}

/** Storage key for the preferred voice: the profile's AI language, or
 *  'default' when the AI language is auto-detect. */
export function voiceLangKeyFor(profile: BusinessProfile | null | undefined): string {
  return profile?.aiLanguage && profile.aiLanguage !== 'auto' ? profile.aiLanguage : 'default';
}

/** Preferred voice name for a language code ('' = no preference). */
export function preferredVoiceName(settings: VoiceSettings, langCode: AiLangCode | 'default'): string {
  return settings.voicesByLang[langCode] || settings.voicesByLang['default'] || '';
}

/* ================= Capability detection ================= */

export interface SpeechEnv {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

export function isSpeechRecognitionSupported(env: SpeechEnv): boolean {
  return Boolean(env.SpeechRecognition || env.webkitSpeechRecognition);
}

/* ================= Voice picking (device voices — legacy) =================
 * pickVoice / preferredVoiceName are pure helpers kept for the
 * Settings voice-name plumbing and the unit tests. They no longer
 * drive any speech output: UPDATE 25 removed the device voice
 * entirely (ai-voice.ts is the only speech path). */

export interface SpeechVoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

function normLangTag(tag: string): string {
  return (tag || '').replace(/_/g, '-').toLowerCase();
}

/**
 * Pick the best speech voice for a BCP-47 language tag.
 * Order: exact preferred name → exact language → same language
 * prefix (hi-IN matches hi) → browser default → first voice.
 * Returns undefined when the browser offers no voices at all.
 */
export function pickVoice(
  voices: SpeechVoiceLike[],
  langBcp47: string,
  preferredName?: string,
): SpeechVoiceLike | undefined {
  if (!voices || voices.length === 0) return undefined;
  if (preferredName) {
    const named = voices.find((v) => v.name === preferredName);
    if (named) return named;
  }
  const want = normLangTag(langBcp47);
  const exact = voices.find((v) => normLangTag(v.lang) === want);
  if (exact) return exact;
  const prefix = want.split('-')[0];
  const sameLang = voices.find((v) => normLangTag(v.lang).split('-')[0] === prefix);
  if (sameLang) return sameLang;
  const def = voices.find((v) => v.default);
  if (def) return def;
  return voices[0];
}

/** BCP-47 tag to request from recognition for a reply language. */
export function recognitionLangFor(profile: BusinessProfile | null | undefined, text: string): string {
  if (profile?.aiLanguage && profile.aiLanguage !== 'auto') return voiceLangFor(profile.aiLanguage);
  return voiceLangFor(detectLanguage(text).code);
}

/* ================= Text for speaking ================= */

/** Make assistant text speakable: strip Markdown/links/bullets, read
 *  ₹ amounts as "rupaye", collapse whitespace. Never invents words. */
export function cleanSpokenText(text: string, maxChars = 400): string {
  let s = (text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [label](url) → label
    .replace(/[*#`>|_~]/g, '')
    .replace(/₹\s?([\d,]+\.?\d*)/g, '$1 rupaye')
    .replace(/₹/g, 'rupaye')
    .replace(/•/g, ', ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= maxChars) return s;
  // Cut at a sentence boundary inside the limit, else at a word.
  const cut = s.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (lastStop > maxChars * 0.4) return cut.slice(0, lastStop + 1).trim();
  const lastSpace = cut.lastIndexOf(' ');
  // Keep the total at most maxChars even with the trailing '…'.
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, maxChars - 1)).trim() + '…';
}

/** "Short mein batao": keep only the first N sentences of a reply. */
export function shortenForVoice(text: string, maxSentences = 2): string {
  const clean = cleanSpokenText(text, 2000);
  const parts = clean.match(/[^.!?।]+[.!?।]+["')\]]*\s*/g) || [clean];
  return parts.slice(0, Math.max(1, maxSentences)).map((p) => p.trim()).join(' ') || clean;
}

/** Split a transcript into spoken words (Unicode-safe). */
export function spokenWords(text: string): string[] {
  return cleanSpokenText(text, 100000).split(/\s+/).filter(Boolean);
}

/* ================= Interruption ================= */

/** "Bas, short mein batao." / "Ruk" / "Chup" / "Stop" — said while the
 *  assistant is speaking. The speech must stop immediately and the
 *  rest of the sentence (if any) is the new instruction. */
const INTERRUPT_RE = /^\s*(bas|ruk|chup|stop|band\s*karo|ruk\s*jao|bas\s*kar)\b[,.!]*/i;

export interface InterruptSplit {
  interrupted: boolean;
  /** The instruction after the interrupt phrase ('' = only "bas"). */
  remainder: string;
}

export function splitInterrupt(transcript: string): InterruptSplit {
  const m = (transcript || '').match(INTERRUPT_RE);
  if (!m) {
    // "… short mein batao" anywhere at the start also interrupts.
    if (/^\s*(short\s*(mein|me)\s*batao|chhota\s*batao)/i.test(transcript || '')) {
      return { interrupted: true, remainder: (transcript || '').replace(/^\s*(short\s*(mein|me)\s*batao|chhota\s*batao)\b[,.!]*/i, '').trim() };
    }
    return { interrupted: false, remainder: (transcript || '').trim() };
  }
  let rest = (transcript || '').slice(m[0].length).trim();
  // "Bas, short mein batao, aaj ka hisab batao" → strip the filler too.
  rest = rest.replace(/^(short\s*(mein|me)\s*batao|chhota\s*batao)\b[,.!]*/i, '').trim();
  return { interrupted: true, remainder: rest };
}

export function isInterruptOnly(transcript: string): boolean {
  const s = splitInterrupt(transcript);
  return s.interrupted && s.remainder === '';
}

/** Short acknowledgement when the user only says "bas" — no engine
 *  call, no new question, just stop and wait for the next instruction. */
export const INTERRUPT_ACK_HI = 'Theek hai — short mein bataunga. Bolo, kya chahiye?';
export const INTERRUPT_ACK_GU = 'Barabar — tunkma kahish. Bolo, shu joie chhe?';

/* ================= Transcript handling (the voice edge) ================= */

export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const REPEAT_WINDOW_MS = 5000;

export function normalizeTranscript(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ').replace(/[।.]+$/, '').toLowerCase();
}

/** Same transcript again within a few seconds — recognition firing
 *  twice, or the user repeating "Haan" — never process it twice. */
export function isRepeatTranscript(
  prev: { text: string; atMs: number } | null,
  text: string,
  nowMs: number,
  windowMs = REPEAT_WINDOW_MS,
): boolean {
  if (!prev) return false;
  return normalizeTranscript(prev.text) === normalizeTranscript(text) && nowMs - prev.atMs < windowMs;
}

/** A transcript is "financial" (and therefore dangerous to guess at)
 *  when it carries a number or a money/service word. */
export function looksFinancial(text: string): boolean {
  // UPDATE 26: 'dhandha' (any spelling) is a financial word — a
  // spoken "dhanda add kar do" is a financial instruction even with
  // no amount yet. Spoken transcripts go through the same
  // respondToMessage() pipeline as typed chat (voice input is only a
  // modality), so the parser/router fix covers voice end to end.
  return /\d/.test(text) || /(cash|upi|rupaye|rupees?|paise|₹|kharcha|expense|transfer|commission|diye|diya|mila|mile|hue|hua|xerox|printing|pan|aadhaar|voter|ayushman|agent|customer|jama|payment|due|udhaar|dhandha|dhanda|dhandho|dhande|dhadhe|धंधा|धन्दा|ધંધો|kaam|business|hisab)/i.test(text);
}

/** Short "say it again" clarification in the user's own style — never
 *  a demand to rephrase in a fixed format. */
export function unclearClarification(transcript: string): string {
  const lang = detectLanguage(transcript || '').code;
  if (lang === 'gu') return 'Awaz saaf nathi sambhlayo — fari bolo, thodu dhime ane saaf.';
  if (lang === 'en') return 'I could not hear that clearly — please say it again, a little slowly.';
  return 'Awaz saaf nahi aayi — dobara bolo, thoda slow aur saaf.';
}

export type TranscriptDecision =
  | { action: 'send'; text: string }
  | { action: 'clarify'; text: string; reason: 'low-confidence' | 'empty' }
  | { action: 'ignore'; reason: 'duplicate' | 'empty' }
  | { action: 'interrupt'; remainder: string };

/**
 * Decide what to do with one speech-recognition result. Pure function
 * — the chat UI calls it, then routes 'send' through the normal
 * send() pipeline (intent router → preview → confirm), 'interrupt'
 * through stopSpeaking() + send(remainder), and 'clarify' as a bot
 * message asking the user to repeat. NOTHING is ever saved from a
 * transcript here.
 */
export function handleVoiceTranscript(opts: {
  transcript: string;
  /** Recognition confidence 0..1 (null when the browser gives none). */
  confidence?: number | null;
  prev?: { text: string; atMs: number } | null;
  nowMs?: number;
}): TranscriptDecision {
  const text = (opts.transcript || '').trim();
  if (!text) return { action: 'ignore', reason: 'empty' };
  const now = opts.nowMs ?? Date.now();
  // Interruption first — "Bas" must stop the speech even when the
  // confidence is low (short words score low).
  const intr = splitInterrupt(text);
  if (intr.interrupted) return { action: 'interrupt', remainder: intr.remainder };
  if (isRepeatTranscript(opts.prev || null, text, now)) return { action: 'ignore', reason: 'duplicate' };
  const conf = opts.confidence;
  if (conf !== undefined && conf !== null && conf < LOW_CONFIDENCE_THRESHOLD) {
    return { action: 'clarify', text: unclearClarification(text), reason: 'low-confidence' };
  }
  return { action: 'send', text };
}

/* ================= User-facing voice messages =================
 * Plain Hinglish, no provider/model/key/technical words anywhere. */

export const VOICE_MESSAGES = {
  unsupported:
    'Is browser mein voice input support nahi hai — Chrome mein try karo, ya type karke likho. Text chat hamesha kaam karta hai.',
  denied:
    'Microphone ki permission nahi mili — browser ke address bar mein mic icon par tap karke Allow karo, phir dobara try karo. Tab tak type karke likh sakte ho.',
  noMic:
    'Is device par microphone nahi mila — type karke likho, text chat hamesha kaam karta hai.',
  noSpeech:
    'Kuch suna nahi — dobara bolo, ya type karke likho.',
  network:
    'Voice samajhne ke liye internet chahiye tha aur connection nahi mila — text chat aur aapke records bina internet ke bhi kaam karte hain.',
  unrecognized:
    'Voice samajh nahi aaya — dobara bolo ya type karke likho.',
  stopped: 'Voice band kar diya.',
} as const;

export type VoiceErrorKind = 'unsupported' | 'denied' | 'no-mic' | 'no-speech' | 'network' | 'unrecognized';

export function voiceErrorMessage(kind: VoiceErrorKind): string {
  switch (kind) {
    case 'unsupported': return VOICE_MESSAGES.unsupported;
    case 'denied': return VOICE_MESSAGES.denied;
    case 'no-mic': return VOICE_MESSAGES.noMic;
    case 'no-speech': return VOICE_MESSAGES.noSpeech;
    case 'network': return VOICE_MESSAGES.network;
    default: return VOICE_MESSAGES.unrecognized;
  }
}

/* ================= Voice state machine ================= */

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Silence with no interim/final result while listening (ms) — after
 *  this the assistant stops listening and says it heard nothing. */
export const SILENCE_TIMEOUT_MS = 5000;

/* ================= Browser adapter (injectable) ================= */

export interface RecognitionResultLike {
  transcript: string;
  confidence?: number;
  isFinal: boolean;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((results: RecognitionResultLike[]) => void) | null;
  onerror: ((error: string) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export interface VoiceControllerDeps {
  /** Factory for a fresh recognition object (null = unsupported). */
  createRecognition: () => SpeechRecognitionLike | null;
  getSettings: () => VoiceSettings;
  /** Test hook: silence timeout (default SILENCE_TIMEOUT_MS). */
  silenceTimeoutMs?: number;
}

export interface VoiceControllerCallbacks {
  onState: (state: VoiceState) => void;
  onFinalTranscript: (text: string, confidence: number | null) => void;
  onInterimTranscript: (text: string) => void;
  onError: (kind: VoiceErrorKind) => void;
}

/**
 * Thin adapter over the browser speech-recognition object (INPUT
 * only — UPDATE 25 removed the device-voice output; spoken replies
 * are AI voice via ai-voice.ts, and the chat UI owns that player).
 * It owns NO business logic: transcripts go out through
 * onFinalTranscript (the chat UI routes them through
 * handleVoiceTranscript + send()). Continuous mode restarts
 * listening after each result — always visibly, through
 * onState('listening'), never secretly.
 */
export class VoiceController {
  private deps: VoiceControllerDeps;
  private cb: VoiceControllerCallbacks;
  private recognition: SpeechRecognitionLike | null = null;
  private state: VoiceState = 'idle';
  private continuous = false;
  private listeningWanted = false;
  /** True while a recognition session is live. In continuous mode the
   *  session stays live across results. Restart only happens when
   *  the session actually ended (onend) or was never started. */
  private recognitionActive = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(deps: VoiceControllerDeps, cb: VoiceControllerCallbacks) {
    this.deps = deps;
    this.cb = cb;
  }

  get currentState(): VoiceState {
    return this.state;
  }

  get isListening(): boolean {
    return this.state === 'listening';
  }

  /** UPDATE 25: always false — the device voice is gone, so this
   *  controller never speaks. The chat UI tracks AI-voice playback
   *  (AiVoicePlayer) separately. Kept so callers can ask without
   *  knowing which voice path is live. */
  get isSpeaking(): boolean {
    return false;
  }

  setContinuous(on: boolean): void {
    this.continuous = on;
  }

  private setState(s: VoiceState): void {
    if (this.disposed) return;
    this.state = s;
    this.cb.onState(s);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    const ms = this.deps.silenceTimeoutMs ?? SILENCE_TIMEOUT_MS;
    this.silenceTimer = setTimeout(() => {
      if (this.disposed || this.state !== 'listening') return;
      this.stopListeningInternal();
      this.cb.onError('no-speech');
    }, ms);
  }

  /** Start listening for one utterance (or continuously, if set). */
  startListening(langBcp47: string): boolean {
    if (this.disposed) return false;
    const recog = this.deps.createRecognition();
    if (!recog) {
      this.cb.onError('unsupported');
      return false;
    }
    this.listeningWanted = true;
    this.recognition = recog;
    recog.lang = langBcp47;
    recog.interimResults = true;
    recog.continuous = this.continuous;
    recog.onresult = (results) => {
      if (this.disposed) return;
      for (const r of results) {
        if (!r.isFinal) {
          this.armSilenceTimer();
          this.cb.onInterimTranscript(r.transcript);
        } else {
          this.armSilenceTimer();
          this.cb.onFinalTranscript(r.transcript, r.confidence ?? null);
          if (!this.continuous) this.stopListeningInternal();
        }
      }
    };
    recog.onerror = (error) => {
      if (this.disposed) return;
      if (error === 'aborted') return;
      this.stopListeningInternal();
      if (error === 'not-allowed' || error === 'service-not-allowed') this.cb.onError('denied');
      else if (error === 'audio-capture') this.cb.onError('no-mic');
      else if (error === 'network') this.cb.onError('network');
      else if (error === 'no-speech') this.cb.onError('no-speech');
      else this.cb.onError('unrecognized');
    };
    recog.onend = () => {
      if (this.disposed) return;
      this.recognitionActive = false;
      // Chrome ends recognition after a pause even in continuous mode —
      // restart visibly so the conversation keeps going.
      if (this.listeningWanted && this.continuous && this.state === 'listening') {
        this.startListening(langBcp47);
        return;
      }
      if (this.state === 'listening') this.setState('idle');
    };
    try {
      recog.start();
    } catch (e) {
      this.recognition = null;
      this.listeningWanted = false;
      const name = (e as { name?: string } | null)?.name;
      this.cb.onError(name === 'NotAllowedError' ? 'denied' : 'unrecognized');
      return false;
    }
    this.recognitionActive = true;
    this.setState('listening');
    this.armSilenceTimer();
    return true;
  }

  private stopListeningInternal(): void {
    this.listeningWanted = false;
    this.recognitionActive = false;
    this.clearSilenceTimer();
    const recog = this.recognition;
    this.recognition = null;
    if (recog) {
      recog.onresult = null;
      recog.onerror = null;
      recog.onend = null;
      try { recog.stop(); } catch { /* already stopped */ }
    }
    if (this.state === 'listening') this.setState('idle');
  }

  stopListening(): void {
    this.stopListeningInternal();
  }

  /**
   * UPDATE 25 — device voice REMOVED by the owner's instruction
   * ("Phone Ki Awaz Mat Do Proper Ai Ki Voice Chahiye Muje"). This
   * method now always returns false and never touches any speech
   * synthesis object: there is no device-voice fallback anywhere.
   * Spoken replies go through AiVoicePlayer (ai-voice.ts). Kept as a
   * method (rather than deleted) so old call sites fail loudly in
   * tests instead of silently speaking with the phone's voice.
   */
  speak(_text: string, _langBcp47: string): boolean {
    void _text;
    void _langBcp47;
    return false;
  }

  /** Stop any speech state. The AI-voice player is owned by the chat
   *  UI, not by this controller — interruptSpeech() here only clears
   *  the controller's own state (it never speaks, so there is
   *  nothing to cancel). The UI stops the <audio> player itself. */
  interruptSpeech(): void {
    if (this.state === 'speaking') this.setState('idle');
  }

  /** Stop everything: listening off. The mic is never left on. */
  stopAll(): void {
    this.interruptSpeech();
    this.stopListeningInternal();
  }

  dispose(): void {
    this.disposed = true;
    this.stopAll();
  }
}
