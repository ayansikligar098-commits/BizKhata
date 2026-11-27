'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import {
  applyDraftAnswer,
  computeFacts,
  factsSummary,
  findDuplicateWarning,
  parseAssistantMessage,
  savedEntryFor,
  type ActionDraft,
} from '@/lib/chatbot';
import { applyAssistantAction, deleteVerifyNote, verifyAppliedIds, type AssistantAction, type ExecResult } from '@/lib/assistant';
import { buildSystemPrompt, callConversationAIStream, cloudReplyMatchesLanguage, getAiServiceKey, guardCloudReply, hasAiServiceKey, type AiChatMessage } from '@/lib/conversation-ai';
import { langName, respondToMessage } from '@/lib/conversation';
import { STREAM_UNREACHABLE_MSG, Typewriter } from '@/lib/streaming';
import { markdownToHtml } from '@/lib/markdown';
import {
  INTERRUPT_ACK_HI,
  VoiceController,
  handleVoiceTranscript,
  isSpeechRecognitionSupported,
  recognitionLangFor,
  voiceErrorMessage,
  voiceSettingsFor,
  type SpeechRecognitionLike,
  type VoiceErrorKind,
  type VoiceState,
} from '@/lib/voice';
import {
  AI_VOICE_DAILY_LIMIT,
  AiVoicePlayer,
  aiVoiceFor,
  speakAiReply,
  voiceUsageToday,
  VOICE_LONG_REPLY_NOTE,
  VOICE_NO_KEY,
  VOICE_QUOTA_DONE,
  type AudioLike,
} from '@/lib/ai-voice';
import { type ChatContext, type KnowledgeTable } from '@/lib/knowledge';
import { loadState } from '@/lib/store';
import { formatINR } from '@/lib/money';
import { detectLanguage, voiceLangFor } from '@/lib/languages';
import { uid } from '@/lib/types';

/** Minimal Web Speech API shapes (not in TS's DOM lib). */
interface SpeechRecognitionResultAlt { transcript: string; confidence: number; }
interface SpeechRecognitionResultRow { 0: SpeechRecognitionResultAlt; isFinal: boolean; length: number; }
interface SpeechRecognitionEventLike {
  results: { length: number; [index: number]: SpeechRecognitionResultRow };
  resultIndex: number;
}
interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * BizKhata AI Assistant — "BizKhata AI Assistant", subtitle
 * "Your Intelligent Business Assistant". No third-party provider name,
 * no key, no technical error ever appears here.
 *
 * The chat is a conversational interface over the real store:
 *  - Questions → scoped knowledge retrieval (knowledge.ts) or the
 *    factual responder (chatbot.ts), both from real ledgers.
 *  - Actions → structured AssistantAction → human-readable preview →
 *    Confirm & Save / Edit / Cancel → backend executor (assistant.ts)
 *    with validation + audit + idempotency → verified result.
 * Chat history is stored per business profile (localStorage) and is
 * NEVER a financial record by itself.
 */

interface PreviewData {
  action: AssistantAction;
  idemKey: string;
  lines: string[];
  totalPaise: number;
  duplicateWarning?: string;
  editing: boolean;
  /** Editable rows (daily income) or single amount/method (other actions). */
  editRows: { service: string; amountRs: string; method: string }[];
  editAmountRs: string;
  editMethod: string;
  cancelled?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'bot';
  text: string;
  ts: string;
  /** Reply still being generated (typewriter / stream in progress). */
  streaming?: boolean;
  /** Generation was stopped by the user — kept text is final. */
  stopped?: boolean;
  /** Generation failed (network/stream error) — Retry is offered. */
  failed?: boolean;
  /** The configured cloud service failed or timed out, so the reply
   *  shown is the on-device engine's answer (fullText) instead — the
   *  UI shows one honest line saying so. Never a silent substitution,
   *  never a bare Retry with no answer. */
  cloudFailed?: boolean;
  /** UPDATE 25 (C-15): the cloud reply arrived in the WRONG language
   *  (e.g. English to a Hinglish user), so the on-device reply is
   *  shown instead — the UI shows one honest line saying so. */
  cloudLangMismatch?: boolean;
  /** Where the reply came from: the on-device engine ('local') or the
   *  owner's configured service via real SSE ('cloud'). */
  source?: 'local' | 'cloud';
  preview?: PreviewData;
  result?: { ok: boolean; lines: string[]; verified?: boolean; link?: { label: string; path: string }; title?: string; verifyNote?: string };
  table?: KnowledgeTable;
  links?: { label: string; path: string }[];
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMsg[];
  ctx: ChatContext;
}

const WELCOME =
  'Namaste! Main aapka BizKhata AI Assistant hoon — Your Intelligent Business Assistant. Aap mujhse apne business ke baare mein kuch bhi pooch sakte ho, ya aise hi bata do kya hua (jaise: "Aaj Xerox ke 300 cash hue"). Main pehle preview dikhaunga, aap confirm karoge, tabhi entry save hogi. Mere jawab aapke real record se aate hain.';

const QUICK_QUESTIONS = [
  'Aaj ka dhandha kitna hua?',
  'Cash Book kholo',
  'Kal ke kaam ki checklist banao',
];

/**
 * Context note for the cloud engine (UPDATE 20 §8): what the local
 * router already knows about this conversation, so the cloud reply
 * stays consistent with the pending offer / question / checklist
 * instead of starting over.
 */
function cloudContextNote(ctx: ChatContext): string {
  const parts: string[] = [];
  if (ctx.lastTopic) parts.push(`Current topic: ${ctx.lastTopic}.`);
  if (ctx.pendingOffer?.kind === 'checklist') parts.push(`You already offered a ${ctx.pendingOffer.topic} checklist for ${ctx.pendingOffer.when}; if the user says yes, confirm the checklist will be made.`);
  if (ctx.pendingOffer?.kind === 'app_change' && ctx.pendingOffer.spec) parts.push(`You already showed a proposed plan for "${ctx.pendingOffer.spec.name}"; if the user says yes, confirm it will be saved to the development queue (it is NOT built yet).`);
  if (ctx.pendingQuestion) parts.push(`You asked: how many ${ctx.pendingQuestion.label} (${ctx.pendingQuestion.topic})? The user may answer with just a number${ctx.pendingQuestion.answeredValue !== undefined ? ` (current value: ${ctx.pendingQuestion.answeredValue})` : ''}.`);
  if (ctx.activeChecklist) parts.push(`There is an active checklist (${ctx.activeChecklist.topic}, ${ctx.activeChecklist.when}); the user may ask to edit it, translate it, or see it again.`);
  // UPDATE 25 (C-13): translate-THIS-reply — the cloud must translate
  // ONLY the previous reply into the asked language, never switch
  // any language setting.
  if (ctx.translateTarget) parts.push(`The user asked to translate the previous reply into ${langName(ctx.translateTarget)} — translate ONLY that reply into that language, nothing else; do not change any language setting.`);
  // UPDATE 23 — the last VERIFIED save, so the cloud can never invent
  // a different history ("koi entry save hi nahi ki thi... pehle se
  // tha" was the 2026-11-27 16:03 fabrication).
  if (ctx.lastVerifiedSave) parts.push(`VERIFIED SAVE (never contradict): ${ctx.lastVerifiedSave} — never say it was never saved or that it existed before.`);
  else if (ctx.lastSavedEntry) parts.push(`VERIFIED SAVE (never contradict): "${ctx.lastSavedEntry.label}" (${ctx.lastSavedEntry.date}) was saved and verified in the records — never say it was never saved or that it existed before.`);
  return parts.join(' ');
}

function chatKey(profileId: string): string {
  return `bizkhata.chat.v1.${profileId}`;
}

function loadConversations(profileId: string): { conversations: Conversation[]; activeId: string } {
  try {
    const raw = window.localStorage.getItem(chatKey(profileId));
    if (raw) {
      const parsed = JSON.parse(raw) as { conversations: Conversation[]; activeId: string };
      if (Array.isArray(parsed.conversations) && parsed.conversations.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  const first: Conversation = {
    id: uid('chat'),
    title: 'New chat',
    createdAt: new Date().toISOString(),
    messages: [{ id: uid('m'), role: 'bot', text: WELCOME, ts: new Date().toISOString() }],
    ctx: {},
  };
  return { conversations: [first], activeId: first.id };
}

function newConversation(): Conversation {
  return {
    id: uid('chat'),
    title: 'New chat',
    createdAt: new Date().toISOString(),
    messages: [{ id: uid('m'), role: 'bot', text: WELCOME, ts: new Date().toISOString() }],
    ctx: {},
  };
}

function timeStr(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function previewFromAction(action: AssistantAction, lines: string[], totalPaise: number, duplicateWarning?: string): PreviewData {
  const editRows =
    action.kind === 'daily_income'
      ? action.entries.map((e) => ({ service: e.service, amountRs: String(e.amountPaise / 100), method: e.method }))
      : [];
  const singleAmount =
    action.kind === 'expense' ? action.amountPaise
    : action.kind === 'mt_transfer' ? action.amountPaise
    : action.kind === 'agent_payment' ? action.amountPaise
    : action.kind === 'internal_transfer' ? action.amountPaise
    : action.kind === 'customer_payment' ? action.amountPaise
    : action.kind === 'refund' ? action.amountPaise
    : action.kind === 'correct_entry' ? action.newAmountPaise
    : 0;
  const singleMethod =
    action.kind === 'expense' ? action.method
    : action.kind === 'mt_transfer' ? action.method
    : action.kind === 'agent_payment' ? action.method
    : action.kind === 'internal_transfer' ? action.to
    : action.kind === 'customer_payment' ? action.method
    : action.kind === 'refund' ? action.method
    : 'cash';
  return {
    action,
    idemKey: uid('idem'),
    lines,
    totalPaise,
    duplicateWarning,
    editing: false,
    editRows,
    editAmountRs: String(singleAmount / 100),
    editMethod: singleMethod,
  };
}

/** Rebuild an action from edited preview rows (Edit flow). */
function rebuildAction(preview: PreviewData): AssistantAction | null {
  const a = preview.action;
  if (a.kind === 'daily_income') {
    const entries = preview.editRows
      .map((r) => {
        const paise = Math.round(parseFloat(r.amountRs || '0') * 100);
        return { service: r.service, amountPaise: paise, method: (r.method === 'upi' ? 'upi' : r.method === 'other' ? 'other' : 'cash') as 'cash' | 'upi' | 'other' };
      })
      .filter((e) => e.amountPaise > 0 && e.service);
    if (entries.length === 0) return null;
    return { kind: 'daily_income', date: a.date, entries };
  }
  const paise = Math.round(parseFloat(preview.editAmountRs || '0') * 100);
  if (paise <= 0) return null;
  const method = (preview.editMethod === 'upi' ? 'upi' : 'cash') as 'cash' | 'upi';
  if (a.kind === 'expense') return { ...a, amountPaise: paise, method };
  if (a.kind === 'mt_transfer') return { ...a, amountPaise: paise, method };
  if (a.kind === 'agent_payment') return { ...a, amountPaise: paise, method };
  if (a.kind === 'internal_transfer') return { ...a, amountPaise: paise, to: method, from: method === 'cash' ? 'upi' : 'cash' };
  if (a.kind === 'customer_payment') return { ...a, amountPaise: paise, method };
  if (a.kind === 'refund') return { ...a, amountPaise: paise, method };
  if (a.kind === 'correct_entry') return { ...a, newAmountPaise: paise };
  return a;
}

function previewLinesFor(action: AssistantAction): string[] {
  if (action.kind === 'daily_income') {
    return action.entries.map((e) => `${e.service} ${formatINR(e.amountPaise)} ${e.method === 'other' ? '(due — abhi mile nahi)' : `(${e.method.toUpperCase()})`}${e.customerName ? ` — ${e.customerName}` : ''}`);
  }
  if (action.kind === 'expense') return [`Expense: ${action.category} — ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`, `Service: ${action.service}`];
  if (action.kind === 'mt_transfer') return [`Money Transfer: principal ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — principal income NAHI hai.`, `Commission: ${formatINR(action.commissionPaise)} — sirf yehi income hai.`];
  if (action.kind === 'mt_fund') return [`MT Fund received: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — bhai se`];
  if (action.kind === 'agent_payment') return [`Agent payment: ${action.agentName} ko ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`];
  if (action.kind === 'internal_transfer') return [`Internal transfer: ${formatINR(action.amountPaise)} ${action.from.toUpperCase()} → ${action.to.toUpperCase()} — ₹0 income, ₹0 expense.`];
  if (action.kind === 'customer_payment') return [`Payment received: ${action.customerName} se ${formatINR(action.amountPaise)} (${action.method.toUpperCase()})`];
  if (action.kind === 'customer_add') return [`Add customer: ${action.name}${action.mobile ? ` (${action.mobile})` : ''}`];
  if (action.kind === 'correct_entry') return [`Correct: ${action.label}`, `Naya amount: ${formatINR(action.newAmountPaise)} (pehle ${formatINR(action.oldAmountPaise)})`];
  if (action.kind === 'delete_entry') return [`Delete: ${action.label}`, 'Ye entry Recycle Bin mein jayegi.'];
  return [`Refund: ${formatINR(action.amountPaise)} (${action.method.toUpperCase()}) — reversal, ordinary kharcha nahi.`];
}

function totalFor(action: AssistantAction): number {
  if (action.kind === 'daily_income') return action.entries.reduce((a, e) => a + e.amountPaise, 0);
  if (action.kind === 'expense' || action.kind === 'mt_transfer' || action.kind === 'agent_payment' || action.kind === 'internal_transfer' || action.kind === 'customer_payment' || action.kind === 'refund') return action.amountPaise;
  if (action.kind === 'mt_fund') return action.amountPaise;
  if (action.kind === 'correct_entry') return action.newAmountPaise;
  return 0;
}

function useChat(onNavigateAway?: () => void) {
  const app = useApp();
  const router = useRouter();
  const profileId = app.profile?.id || '';
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState('');
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  /** Contextual follow-up chips for the last reply (UPDATE 20 §2).
   *  Empty = no chips. Fresh chats show the starter set instead. */
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [historyQuery, setHistoryQuery] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  const msgsRef = React.useRef<HTMLDivElement>(null);
  const convRef = React.useRef<{ conversations: Conversation[]; activeId: string }>({ conversations: [], activeId: '' });
  const draftRef = React.useRef<ActionDraft | null>(null);
  const pendingRef = React.useRef<{ msgId: string; preview: PreviewData } | null>(null);
  // UPDATE 18 voice state. `listening` is kept as a derived alias so
  // the existing UI keeps working; the source of truth is voiceState.
  const [voiceState, setVoiceState] = React.useState<VoiceState>('idle');
  const [speakOn, setSpeakOnState] = React.useState(false);
  const [continuous, setContinuousState] = React.useState(false);
  const [interim, setInterim] = React.useState('');
  const [speaking, setSpeaking] = React.useState<{ msgId: string; wordIndex: number; totalWords: number } | null>(null);
  const [voiceSupported, setVoiceSupported] = React.useState(false);
  const voiceRef = React.useRef<VoiceController | null>(null);
  const profileRef = React.useRef(app.profile);
  profileRef.current = app.profile;
  // UPDATE 18 — the voice controller's callbacks are bound ONCE (when
  // the mic is first tapped) and outlive the render that created them.
  // Any engine call reachable from a voice transcript MUST read the
  // latest store through this ref — the closure snapshot predates the
  // entries the user just saved by voice, so a totals question asked
  // after a voice save would otherwise quote the old (empty) figures.
  const stateRef = React.useRef(app.state);
  stateRef.current = app.state;
  const voiceTurnRef = React.useRef(false);
  const shortReplyRef = React.useRef(false);
  const prevTranscriptRef = React.useRef<{ text: string; atMs: number } | null>(null);
  const speakingMsgRef = React.useRef<string | null>(null);
  // UPDATE 25 — AI voice (ai-voice.ts): one <audio> player + the
  // daily quota counter, shown near the mic and in Settings → Voice.
  const aiPlayerRef = React.useRef<AiVoicePlayer | null>(null);
  const lastTtsCallRef = React.useRef<number | undefined>(undefined);
  const speakTokenRef = React.useRef(0);
  const voiceKeyNoticeShownRef = React.useRef(false);
  const voiceQuotaNoticeDateRef = React.useRef('');
  const [voiceUsed, setVoiceUsed] = React.useState(() => voiceUsageToday().used);
  const listening = voiceState === 'listening';
  // UPDATE 17 streaming state: one generation at a time, cancellable.
  const [streaming, setStreaming] = React.useState(false);
  const streamingRef = React.useRef(false);
  const streamMsgIdRef = React.useRef<string | null>(null);
  const typewriterRef = React.useRef<Typewriter | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const genRef = React.useRef(0);

  const active = conversations.find((c) => c.id === activeId) || conversations[0];
  const messages = active?.messages || [];

  // Load this profile's chat history (never mix profiles).
  React.useEffect(() => {
    if (!profileId) return;
    const loaded = loadConversations(profileId);
    // A reply that was still streaming when the chat unmounted
    // (navigation away mid-reply, page reload, crash) was persisted
    // with streaming: true — and nothing ever completes it on remount,
    // so its thinking indicator spins forever and any wait-for-idle
    // check never resolves (found by the UPDATE 17 conversation drive:
    // "Cash Book kholo" navigated away mid-reply, stranding it).
    // Normalise on load: drop messages that never displayed anything,
    // keep interrupted ones with their partial text, marked stopped.
    const conversations = loaded.conversations.map((c) => ({
      ...c,
      messages: c.messages
        .filter((m) => !(m.streaming && !m.text && !m.preview))
        .map((m) => (m.streaming ? { ...m, streaming: false, stopped: m.text ? true : m.stopped } : m)),
    }));
    setConversations(conversations);
    setActiveId(loaded.activeId);
    draftRef.current = null;
    pendingRef.current = null;
    // Voice preferences are per-profile: pick them up on profile switch.
    const vs = voiceSettingsFor(app.profile);
    setSpeakOnState(vs.repliesEnabled);
    setContinuousState(vs.continuous);
    voiceRef.current?.setContinuous(vs.continuous);
    try {
      setVoiceSupported(isSpeechRecognitionSupported(window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }));
    } catch { setVoiceSupported(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // Persist history + keep the ref in sync for async handlers.
  React.useEffect(() => {
    convRef.current = { conversations, activeId };
    if (profileId && conversations.length > 0) {
      try {
        window.localStorage.setItem(chatKey(profileId), JSON.stringify({ conversations, activeId }));
      } catch { /* ignore */ }
    }
  }, [conversations, activeId, profileId]);

  // Abort any active stream + stop the typewriter when the chat
  // panel/page unmounts, and never leave a generation running — or
  // the microphone on.
  React.useEffect(() => () => {
    genRef.current++;
    streamingRef.current = false;
    abortRef.current?.abort();
    typewriterRef.current?.stop();
    abortRef.current = null;
    typewriterRef.current = null;
    streamMsgIdRef.current = null;
    voiceRef.current?.dispose();
    voiceRef.current = null;
  }, []);

  // Smooth auto-scroll as text grows — only if the user is already
  // near the bottom, so reading earlier messages is never yanked away.
  // "Near the bottom" is judged against the height BEFORE this
  // render's growth: a single send adds a user bubble + a thinking
  // bubble (~200px) in one render, which would otherwise push the gap
  // past the threshold in one step and strand the list away from the
  // bottom for the whole reply (found by the UPDATE 17 drive: the gap
  // jumped 0 → 203 on send, so the guard never engaged and every
  // later reply typed out of view). A user who scrolled up before the
  // send still has a large pre-growth gap and is left alone.
  const prevShRef = React.useRef(0);
  React.useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    const grew = el.scrollHeight - prevShRef.current;
    prevShRef.current = el.scrollHeight;
    const gapBeforeGrowth = el.scrollHeight - grew - el.scrollTop - el.clientHeight;
    if (gapBeforeGrowth < 140) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Pin to the latest message on first open and when switching
  // conversation. Without this, the near-bottom guard above can never
  // engage after a reload: a long history mounts with scrollTop = 0
  // (gap to the bottom > 140), so every later reply types out of view
  // below the fold and the list looks stuck at the top. A fresh mount
  // has no scroll position to preserve — the user has not scrolled up
  // yet — so jumping to the bottom here does not violate the guard;
  // once pinned, the guard above keeps following new text, and a user
  // who then scrolls up is still left alone.
  React.useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [activeId]);

  function updateActive(fn: (c: Conversation) => Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === activeId ? fn(c) : c)));
  }

  function pushMsg(msg: ChatMsg) {
    updateActive((c) => {
      const title = c.messages.length <= 1 && msg.role === 'user'
        ? msg.text.slice(0, 40)
        : c.title === 'New chat' && msg.role === 'user' ? msg.text.slice(0, 40) : c.title;
      return { ...c, title, messages: [...c.messages, msg] };
    });
  }

  function updateMsg(id: string, fn: (m: ChatMsg) => ChatMsg) {
    updateActive((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? fn(m) : m)) }));
  }

  /* ================= UPDATE 25 — voice (AI voice out, mic in) =================
   * Mic = browser SpeechRecognition (voice.ts), replies = REAL AI
   * voice (ai-voice.ts: quota + Interactions API + <audio> playback).
   * The phone/device voice is GONE by the owner's instruction
   * (2026-11-27 19:01 IST) — no speechSynthesis anywhere, no silent
   * fallback to it. The intelligence is the SAME pipeline as typed
   * chat (send() below → respondToMessage → preview → confirm);
   * voice only changes how words go in and out. No recording is
   * stored or uploaded; the transcript is the only thing that reaches
   * the chat pipeline, and the spoken reply text is sent only to the
   * voice service the owner configured with his own key.
   */

  const speakOnRef = React.useRef(false);
  speakOnRef.current = speakOn;
  const continuousRef = React.useRef(false);
  continuousRef.current = continuous;

  /** Build (once) the injectable voice controller over the real
   *  browser recognition object (input only — UPDATE 25). */
  function ensureVoiceController(): VoiceController | null {
    if (typeof window === 'undefined') return null;
    if (voiceRef.current) return voiceRef.current;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const adaptRecognition = (r: BrowserSpeechRecognition): SpeechRecognitionLike => {
      const like: SpeechRecognitionLike = {
        get lang() { return r.lang; },
        set lang(v: string) { r.lang = v; },
        get interimResults() { return r.interimResults; },
        set interimResults(v: boolean) { r.interimResults = v; },
        get continuous() { return r.continuous; },
        set continuous(v: boolean) { r.continuous = v; },
        onresult: null,
        onerror: null,
        onend: null,
        start: () => r.start(),
        stop: () => { try { r.stop(); } catch { /* already stopped */ } },
        abort: () => { try { r.abort(); } catch { /* ignore */ } },
      };
      r.onresult = (e: SpeechRecognitionEventLike) => {
        const results: { transcript: string; confidence?: number; isFinal: boolean }[] = [];
        for (let i = e.resultIndex || 0; i < e.results.length; i++) {
          const res = e.results[i];
          const alt = res[0];
          if (alt) results.push({ transcript: alt.transcript, confidence: typeof alt.confidence === 'number' ? alt.confidence : undefined, isFinal: res.isFinal });
        }
        if (results.length > 0) like.onresult?.(results);
      };
      r.onerror = (e: { error: string }) => like.onerror?.(e?.error || 'unknown');
      r.onend = () => like.onend?.();
      return like;
    };
    const ctrl = new VoiceController(
      {
        createRecognition: () => {
          if (!SR) return null;
          try {
            return adaptRecognition(new SR());
          } catch {
            return null;
          }
        },
        getSettings: () => voiceSettingsFor(profileRef.current),
      },
      {
        onState: (s) => {
          setVoiceState(s);
          if (s !== 'listening') setInterim('');
          if (s !== 'speaking') setSpeaking(null);
        },
        onFinalTranscript: (text, confidence) => handleFinalTranscript(text, confidence),
        onInterimTranscript: (text) => setInterim(text),
        onError: (kind: VoiceErrorKind) => {
          setVoiceState('idle');
          setInterim('');
          pushMsg({ id: uid('m'), role: 'bot', text: voiceErrorMessage(kind), ts: new Date().toISOString() });
        },
      },
    );
    ctrl.setContinuous(continuous);
    voiceRef.current = ctrl;
    return ctrl;
  }

  /** Build (once) the AI-voice <audio> player. Playback stops
   *  immediately on interrupt; nothing is ever queued behind a
   *  stopped reply. In continuous mode, listening restarts when the
   *  spoken reply ends. */
  function ensureAiPlayer(): AiVoicePlayer | null {
    if (typeof window === 'undefined') return null;
    if (aiPlayerRef.current) return aiPlayerRef.current;
    const player = new AiVoicePlayer({
      // HTMLAudioElement.onended carries a `this` type that the
      // narrow AudioLike shape does not — the cast is structural
      // only; play/pause/src/onended behave identically.
      createAudio: () => new Audio() as unknown as AudioLike,
      createObjectUrl: (bytes, mime) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    });
    player.onEnded = () => {
      setSpeaking(null);
      speakingMsgRef.current = null;
      setVoiceState((s) => (s === 'speaking' ? 'idle' : s));
      if (continuousRef.current) {
        const ctrl = voiceRef.current;
        if (ctrl) ctrl.startListening(recognitionLang());
      }
    };
    aiPlayerRef.current = player;
    return player;
  }

  /** Route one final transcript through the voice edge, then through
   *  the SAME send() pipeline as typed chat. Nothing is ever saved
   *  from a transcript alone — financial actions still need the
   *  on-screen preview + Confirm. */
  function handleFinalTranscript(text: string, confidence: number | null) {
    setInterim('');
    const decision = handleVoiceTranscript({ transcript: text, confidence, prev: prevTranscriptRef.current });
    if (decision.action === 'ignore') return; // duplicate / empty
    prevTranscriptRef.current = { text, atMs: Date.now() };
    if (decision.action === 'clarify') {
      pushMsg({ id: uid('m'), role: 'bot', text: decision.text, ts: new Date().toISOString() });
      speak(decision.text);
      return;
    }
    if (decision.action === 'interrupt') {
      speakTokenRef.current++;
      aiPlayerRef.current?.stop();
      voiceRef.current?.interruptSpeech();
      setSpeaking(null);
      if (!decision.remainder) {
        // Only "Bas" — stop, acknowledge briefly, wait for the next
        // instruction. No engine call, no new question.
        const ack = INTERRUPT_ACK_HI;
        pushMsg({ id: uid('m'), role: 'bot', text: ack, ts: new Date().toISOString() });
        speak(ack);
        return;
      }
      void send(decision.remainder, { fromVoice: true, short: true });
      return;
    }
    void send(decision.text, { fromVoice: true });
  }

  /** Speak a bot reply aloud with the REAL AI voice (UPDATE 25) —
   *  when voice replies are on, or when this turn came from the
   *  microphone. Speaks the FINAL text (the typewriter/stream
   *  already finished it). Short replies only (first 2 sentences,
   *  max 400 chars); long replies stay text-only with a note.
   *  No key → one honest guidance message, never speaks. Daily
   *  limit reached → one honest line for the day, never the device
   *  voice. Rate-gap (called <21s after the last voice call) → one
   *  retry after the gap, then gives up quietly for this reply. */
  async function speak(text: string, msgId?: string) {
    if (typeof window === 'undefined') return;
    if (!speakOnRef.current && !voiceTurnRef.current) return;
    const token = ++speakTokenRef.current;
    const profile = profileRef.current;
    const player = ensureAiPlayer();
    if (!player) return;
    if (!hasAiServiceKey()) {
      if (!voiceKeyNoticeShownRef.current) {
        voiceKeyNoticeShownRef.current = true;
        pushMsg({ id: uid('m'), role: 'bot', text: VOICE_NO_KEY, ts: new Date().toISOString() });
      }
      return;
    }
    // speakAiReply always speaks the short version (first 2
    // sentences, max 400 chars) — the old "short" flag only marked
    // turns after an interruption, and is consumed here.
    const toSpeak = text;
    shortReplyRef.current = false;
    const run = async (lastCallMs: number | undefined): Promise<void> => {
      if (token !== speakTokenRef.current) return; // superseded / stopped
      let res;
      try {
        res = await speakAiReply({
          text: toSpeak,
          voiceName: aiVoiceFor(profile),
          key: getAiServiceKey(),
          fetchImpl: (input, init) => fetch(input, init as RequestInit) as unknown as Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
          player,
          nowMs: Date.now(),
          lastCallMs,
        });
      } catch {
        return; // network failure — the text reply already stands
      }
      if (token !== speakTokenRef.current) return;
      if (res.ok) {
        lastTtsCallRef.current = res.lastCallMs;
        setVoiceUsed(res.used);
        speakingMsgRef.current = msgId || null;
        if (msgId) {
          const words = toSpeak.split(/\s+/).filter(Boolean);
          setSpeaking({ msgId, wordIndex: 0, totalWords: words.length });
        }
        setVoiceState('speaking');
        if (res.trimmed) {
          pushMsg({ id: uid('m'), role: 'bot', text: VOICE_LONG_REPLY_NOTE, ts: new Date().toISOString() });
        }
        return;
      }
      if (res.reason === 'rate-gap' && res.waitMs !== undefined) {
        // One retry after the gap — rapid successive replies must
        // never 429 in the user's face.
        window.setTimeout(() => { void run(lastTtsCallRef.current); }, res.waitMs);
        return;
      }
      if (res.reason === 'quota') {
        const today = voiceUsageToday().date;
        if (voiceQuotaNoticeDateRef.current !== today) {
          voiceQuotaNoticeDateRef.current = today;
          setVoiceUsed(AI_VOICE_DAILY_LIMIT);
          pushMsg({ id: uid('m'), role: 'bot', text: VOICE_QUOTA_DONE, ts: new Date().toISOString() });
        }
        return;
      }
      // 'no-key' (key removed mid-turn), 'network', 'upstream',
      // 'empty' — the text reply already stands; stay silent.
    };
    void run(lastTtsCallRef.current);
  }

  /** Voice-replies toggle — persisted on the business profile. */
  function setSpeakOn(v: boolean) {
    setSpeakOnState(v);
    speakOnRef.current = v;
    const pid = profileRef.current?.id;
    if (!pid) return;
    app.mutate((s) => {
      const p = s.profiles.find((x) => x.id === pid);
      if (p) p.voiceReplies = v;
    });
  }

  /** Continuous-conversation toggle — persisted on the profile. */
  function toggleContinuous() {
    const next = !continuous;
    setContinuousState(next);
    voiceRef.current?.setContinuous(next);
    const pid = profileRef.current?.id;
    if (pid) {
      app.mutate((s) => {
        const p = s.profiles.find((x) => x.id === pid);
        if (p) p.voiceContinuous = next;
      });
    }
    if (!next) voiceRef.current?.stopListening();
  }

  /** Stop the current speech immediately (Stop button / mic tap).
   *  Listening is left alone — the user can speak the next
   *  instruction straight away. Stops the AI-voice <audio> player
   *  immediately (UPDATE 25) — nothing queued ever plays after. */
  function stopVoice() {
    speakTokenRef.current++;
    aiPlayerRef.current?.stop();
    voiceRef.current?.interruptSpeech();
    setSpeaking(null);
    speakingMsgRef.current = null;
    if (voiceState === 'speaking') setVoiceState('idle');
  }

  function newChat() {
    stopGeneration();
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    draftRef.current = null;
    pendingRef.current = null;
    setSuggestions([]);
    setShowHistory(false);
  }

  function clearHistory() {
    if (!window.confirm('Saari chat history delete karni hai? Financial records par koi asar nahi padega.')) return;
    stopGeneration();
    const c = newConversation();
    setConversations([c]);
    setActiveId(c.id);
    draftRef.current = null;
    pendingRef.current = null;
    try { window.localStorage.removeItem(chatKey(profileId)); } catch { /* ignore */ }
  }

  /** Verify the backend actually stored the applied records.
   *  Delete-aware: a delete is verified by the target being GONE
   *  from the live records and present in the Recycle Bin / audit
   *  log (see verifyAppliedIds in lib/assistant.ts). The deleted
   *  record's own id can never be found among live ids — and the
   *  recycle item mints a NEW id — so the old plain presence check
   *  could never pass for a delete and the card always showed the
   *  misleading "verification pending" line. Saves are unchanged:
   *  the record must be present. */
  function verifySaved(appliedIds: string[], isDelete: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          resolve(verifyAppliedIds(loadState(), appliedIds, isDelete));
        } catch {
          resolve(false);
        }
      }, 600);
    });
  }

  async function confirmPreview(msgId: string) {
    const pending = pendingRef.current;
    if (!pending || pending.msgId !== msgId || busy) return;
    const preview = pending.preview;
    setBusy(true);
    let result: ExecResult | undefined;
    // Execute ONLY through the backend action layer (never direct writes).
    // Profile id through the ref (see stateRef note above): a voice
    // "Haan" reaches here from the once-bound controller callbacks, and
    // the closure snapshot may predate a profile switch.
    const pid = (profileRef.current || app.profile).id;
    app.mutate((s) => {
      result = applyAssistantAction(s, pid, preview.action, preview.idemKey);
    });
    const res = result as ExecResult | undefined;
    pendingRef.current = null;
    if (!res) {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: ['Kuch gadbad hui — entry save nahi hui. Dobara try karo.'] } }));
      setBusy(false);
      return;
    }
    if (res.ok) {
      const isDelete = preview.action.kind === 'delete_entry';
      const verified = await verifySaved(res.appliedIds, isDelete);
      updateMsg(msgId, (m) => ({
        ...m,
        preview: undefined,
        result: {
          ok: true,
          lines: res.lines,
          verified,
          link: res.link || undefined,
          title: isDelete ? '✓ Deleted' : '✓ Saved',
          verifyNote: isDelete ? deleteVerifyNote(verified) : undefined,
        },
      }));
      // UPDATE 23 — record the verified save in the conversation
      // context (only after backend + store verification), so "isko
      // remove kardo" resolves to THIS entry. A verified delete
      // clears it, so a second "isko remove" can never claim the
      // same entry twice.
      if (isDelete) {
        updateActive((c) => ({ ...c, ctx: { ...c.ctx, lastSavedEntry: undefined, lastVerifiedSave: undefined, lastTopic: 'delete' } }));
      } else if (verified) {
        const saved = savedEntryFor(preview.action, res.appliedIds);
        if (saved) {
          updateActive((c) => ({ ...c, ctx: { ...c.ctx, lastSavedEntry: saved, lastVerifiedSave: `Saved and verified: ${saved.label} (${saved.date})` } }));
        }
      }
      // Conversation context: remember the service just saved.
      if (preview.action.kind === 'daily_income' && preview.action.entries.length > 0) {
        updateActive((c) => ({ ...c, ctx: { ...c.ctx, lastService: preview.action.kind === 'daily_income' ? preview.action.entries[0].service : c.ctx.lastService, lastTopic: 'daily_income' } }));
      }
      speak(isDelete ? `${res.summary} ${verified ? 'Delete verify ho gaya.' : ''}` : `${res.summary} ${verified ? 'Save verify ho gaya.' : ''}`);
    } else if (res.duplicate) {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: [res.summary] } }));
    } else {
      updateMsg(msgId, (m) => ({ ...m, preview: undefined, result: { ok: false, lines: [res.summary] } }));
      speak('Entry save nahi hui. ' + res.summary);
    }
    setBusy(false);
  }

  function cancelPreview(msgId: string) {
    if (pendingRef.current?.msgId !== msgId) return;
    pendingRef.current = null;
    draftRef.current = null;
    updateMsg(msgId, (m) => ({ ...m, preview: m.preview ? { ...m.preview, cancelled: true } : undefined }));
    pushMsg({ id: uid('m'), role: 'bot', text: 'Cancelled — kuch bhi save nahi hua.', ts: new Date().toISOString() });
  }

  function applyEdit(msgId: string) {
    // Read the preview from the message itself — the pending ref can be
    // stale after inline edits (the message is the source of truth).
    const conv = convRef.current.conversations.find((c) => c.id === convRef.current.activeId);
    const preview = conv?.messages.find((m) => m.id === msgId)?.preview;
    if (!preview) return;
    const rebuilt = rebuildAction(preview);
    if (!rebuilt) {
      pushMsg({ id: uid('m'), role: 'bot', text: 'Edit mein amount ₹0 se zyada hona chahiye. Preview dobara check karo.', ts: new Date().toISOString() });
      return;
    }
    const lines = previewLinesFor(rebuilt);
    const total = totalFor(rebuilt);
    const dup = findDuplicateWarning(stateRef.current, (profileRef.current || app.profile).id, rebuilt);
    const next: PreviewData = { ...preview, action: rebuilt, lines, totalPaise: total, duplicateWarning: dup || undefined, editing: false };
    pendingRef.current = { msgId, preview: next };
    updateMsg(msgId, (m) => ({ ...m, preview: next }));
  }

  /** Mark the currently pending preview as superseded by a newer message. */
  function supersedePending() {
    const pending = pendingRef.current;
    if (!pending) return;
    updateMsg(pending.msgId, (m) => (m.preview ? { ...m, preview: { ...m.preview, cancelled: true } } : m));
    pendingRef.current = null;
  }

  /* ================= UPDATE 17 — streaming reply engine ================= */

  /** Stop the active generation cleanly: abort the stream request,
   *  stop the typewriter, keep exactly the text shown so far, and mark
   *  the message stopped. Safe to call when nothing is streaming. */
  function stopGeneration() {
    // Stopping a generation also stops any speech of a previous reply.
    speakTokenRef.current++;
    aiPlayerRef.current?.stop();
    voiceRef.current?.interruptSpeech();
    setSpeaking(null);
    speakingMsgRef.current = null;
    if (!streamingRef.current) return;
    genRef.current++;
    streamingRef.current = false;
    setStreaming(false);
    abortRef.current?.abort();
    abortRef.current = null;
    typewriterRef.current?.stop();
    typewriterRef.current = null;
    const id = streamMsgIdRef.current;
    streamMsgIdRef.current = null;
    if (id) {
      updateMsg(id, (m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m));
    }
  }

  /** Mark a streaming message as failed (network/stream error): keep
   *  any partial text, show Retry. `fallbackText` is used only when
   *  nothing arrived at all. */
  function markFailed(msgId: string, fallbackText: string) {
    streamingRef.current = false;
    setStreaming(false);
    abortRef.current = null;
    typewriterRef.current = null;
    streamMsgIdRef.current = null;
    updateMsg(msgId, (m) => {
      if (!m.streaming) return m;
      return { ...m, streaming: false, failed: true, text: m.text || fallbackText };
    });
  }

  /**
   * Display one bot reply progressively. Two honest paths:
   *  - cloudJob: genuine SSE from the owner's configured service via
   *    /api/ai-chat — chunks feed the typewriter as they arrive; the
   *    thinking indicator stays until the first chunk. If the service
   *    fails or the 30s stream timeout hits, the on-device reply
   *    (fullText, already computed) is typed out instead and the
   *    message is flagged cloudFailed — the user always gets an
   *    answer, with one honest line saying the cloud AI could not be
   *    reached. A bare Retry with no answer is never shown.
   *  - local: the on-device engine already produced `fullText` — the
   *    typewriter reveals it at ~11 words/sec after a brief thinking
   *    pause. This is display pacing over local text, NOT a stream.
   * The message is created empty by botReply() below; this only fills
   * it in. Completion marks the message done and speaks it (if voice
   * replies are on). A newer generation (higher gen token) silently
   * supersedes this one.
   */
  async function displayText(
    msgId: string,
    fullText: string,
    opts: { source: 'local' | 'cloud'; cloudJob?: { history: AiChatMessage[]; system: string }; expectedLang?: import('@/lib/languages').AiLangCode },
  ) {
    const token = genRef.current + 1;
    genRef.current = token;
    streamingRef.current = true;
    setStreaming(true);
    streamMsgIdRef.current = msgId;
    const abort = new AbortController();
    abortRef.current = abort;
    const tw = new Typewriter({
      onUpdate: (displayed) => {
        if (token !== genRef.current) return;
        updateMsg(msgId, (m) => (m.streaming ? { ...m, text: displayed } : m));
      },
      onDone: (displayed) => {
        if (token !== genRef.current) return;
        streamingRef.current = false;
        setStreaming(false);
        abortRef.current = null;
        typewriterRef.current = null;
        streamMsgIdRef.current = null;
        // UPDATE 23 — deterministic cloud guard: a streamed cloud
        // reply is checked BEFORE it is final. The cloud never
        // performs financial actions, so any past-tense save/delete/
        // correct/refund claim — or any contradiction of the verified
        // save in this conversation — is replaced with the honest
        // limitation (guardCloudReply). Local replies are never
        // guarded (they come from the real ledgers). Note: the claim
        // may have been typed progressively while streaming and is
        // then replaced at completion — the routing fix (delete
        // messages never reach the cloud at all) is the primary
        // prevention; this is the second layer.
        let finalText = displayed;
        let langMismatch = false;
        if (opts.source === 'cloud') {
          const ctxNow = (convRef.current.conversations.find((c) => c.id === convRef.current.activeId)?.ctx) || {};
          const guarded = guardCloudReply(displayed, { verifiedSaveLabel: ctxNow.lastVerifiedSave || ctxNow.lastSavedEntry?.label || null });
          if (guarded.blocked) finalText = guarded.text;
          // UPDATE 25 (C-15): a cloud reply in the WRONG language is
          // replaced with the local reply (fullText) — never shown
          // as-is. The message is flagged so the UI says so honestly.
          else if (opts.expectedLang && !cloudReplyMatchesLanguage(displayed, opts.expectedLang)) {
            finalText = fullText;
            langMismatch = true;
          }
        }
        updateMsg(msgId, (m) => (m.streaming ? { ...m, text: finalText, streaming: false, cloudLangMismatch: langMismatch || undefined, ts: new Date().toISOString() } : m));
        speak(finalText, msgId);
      },
    });
    typewriterRef.current = tw;
    try {
      if (opts.cloudJob) {
        let gotChunk = false;
        const res = await callConversationAIStream(
          opts.cloudJob.history,
          opts.cloudJob.system,
          (chunk) => {
            if (token !== genRef.current) return;
            gotChunk = true;
            tw.append(chunk);
          },
          abort.signal,
        );
        if (token !== genRef.current) return; // stopped / superseded
        if (res.ok && gotChunk) {
          tw.end();
        } else if (res.aborted) {
          tw.stop(); // stopGeneration() already marked the message
        } else {
          // Configured service failed or timed out: fall back to the
          // local reply the engine already produced (fullText) so the
          // user always gets an answer — the on-device reply is typed
          // out progressively, and the message is flagged cloudFailed
          // so the UI shows one honest line that the cloud AI could
          // not be reached. Never a silent substitution, never a bare
          // Retry with no answer (that left the user with nothing).
          updateMsg(msgId, (m) => ({ ...m, cloudFailed: true, source: 'local' }));
          tw.setSource(fullText);
        }
      } else {
        // Brief thinking pause so the indicator is genuinely visible,
        // then type the locally generated reply out progressively.
        await new Promise((r) => setTimeout(r, 280));
        if (token !== genRef.current) return;
        tw.setSource(fullText);
      }
    } catch {
      if (token !== genRef.current) return;
      tw.stop();
      markFailed(msgId, STREAM_UNREACHABLE_MSG);
    }
  }

  /**
   * Create a bot message (empty + streaming) and display its reply
   * progressively. Returns the message immediately so callers can
   * attach a preview to it (Confirm & Save flow) — the text fills in
   * afterwards. Voice is spoken on completion, not on creation.
   */
  function botReply(
    text2: string,
    extra?: Partial<ChatMsg>,
    cloudJob?: { history: AiChatMessage[]; system: string },
    expectedLang?: import('@/lib/languages').AiLangCode,
  ): ChatMsg {
    const msg: ChatMsg = {
      id: uid('m'),
      role: 'bot',
      text: '',
      ts: new Date().toISOString(),
      ...extra,
      streaming: true,
      source: cloudJob ? 'cloud' : 'local',
    };
    pushMsg(msg);
    void displayText(msg.id, text2, cloudJob ? { source: 'cloud', cloudJob, expectedLang } : { source: 'local' });
    return msg;
  }

  /** Re-run the last user message with the same conversation context,
   *  replacing the last bot reply. Disabled while streaming. */
  async function regenerate() {
    if (streamingRef.current) return;
    const conv = convRef.current.conversations.find((c) => c.id === convRef.current.activeId);
    if (!conv) return;
    let lastUserIdx = -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const q = conv.messages[lastUserIdx].text;
    updateActive((c) => ({ ...c, messages: c.messages.slice(0, lastUserIdx + 1) }));
    await respond(q);
  }

  /** Retry a failed generation: same message, same context. */
  async function retryFailed() {
    await regenerate();
  }

  /** Switch conversation — a running generation is stopped first so
   *  its text never lands in the wrong conversation. */
  function switchConversation(id: string) {
    stopGeneration();
    setActiveId(id);
  }

  /**
   * Send one message through the pipeline. `opts.fromVoice` marks a
   * turn that came from the microphone: its reply is spoken aloud even
   * when the voice-replies toggle is off, and `opts.short` (after an
   * interruption — "Bas, short mein batao") speaks the short version
   * of the reply. A typed message clears the voice-turn flag, so a
   * later typed reply is not spoken out of nowhere.
   */
  async function send(text: string, opts?: { fromVoice?: boolean; short?: boolean }) {
    const q = text.trim();
    if (!q) return;
    voiceTurnRef.current = !!opts?.fromVoice;
    shortReplyRef.current = !!opts?.short;
    // A new message stops any speech in progress (interruption) and
    // any streaming generation — never two generations at once.
    if (aiPlayerRef.current?.isPlaying) {
      speakTokenRef.current++;
      aiPlayerRef.current.stop();
    }
    voiceRef.current?.interruptSpeech();
    setSpeaking(null);
    if (streamingRef.current) stopGeneration();
    setInput('');
    setBusy(true);
    const userMsg: ChatMsg = { id: uid('m'), role: 'user', text: q, ts: new Date().toISOString() };
    pushMsg(userMsg);
    await respond(q);
    setBusy(false);
  }

  async function respond(q: string) {
    const ctx: ChatContext = (convRef.current.conversations.find((c) => c.id === convRef.current.activeId)?.ctx) || {};
    // UPDATE 25: the last bot reply's text, for "translate this" /
    // "shorten this" requests (conversation.ts reads ctx.lastBotText).
    const convMsgs = convRef.current.conversations.find((c) => c.id === convRef.current.activeId)?.messages || [];
    const lastBot = [...convMsgs].reverse().find((m) => m.role === 'bot' && m.text && !m.streaming);
    // UPDATE 25 (C-1): a pendingAction is only real while its preview
    // is actually still on screen (pendingRef). After Confirm/Cancel
    // the ctx must NOT carry the old pendingAction — otherwise a
    // later "Aur 200 UPI" would merge into (and re-save) an entry
    // that is already saved. The draft/confirm gates below read
    // ctxIn, never the raw ctx.
    const ctxIn: ChatContext = pendingRef.current
      ? { ...ctx, lastBotText: lastBot?.text }
      : { ...ctx, pendingAction: undefined, lastBotText: lastBot?.text };
    // Latest store/profile through refs (see stateRef note above): this
    // function is also reached from the once-bound voice callbacks, whose
    // closure snapshot predates entries saved after the mic was first
    // tapped. Text chat reads the same refs — identical values.
    const state = stateRef.current;
    const profile = profileRef.current || app.profile;
    const setCtx = (patch: ChatContext) => {
      updateActive((c) => ({ ...c, ctx: { ...c.ctx, ...patch } }));
    };

    try {
      // 1. Answering a clarification question for an incomplete action.
      if (draftRef.current) {
        const parsed = applyDraftAnswer(draftRef.current, q, state, profile, ctxIn);
        if (parsed.kind === 'draft') {
          draftRef.current = parsed.draft;
          botReply(parsed.draft.question);
          setBusy(false);
          return;
        }
        draftRef.current = null;
        if (parsed.kind === 'action') {
          supersedePending();
          const preview = previewFromAction(parsed.action, parsed.previewLines, parsed.totalPaise, parsed.duplicateWarning);
          const msg = botReply('Ye entries save karun?', { preview });
          pendingRef.current = { msgId: msg.id, preview };
          // Remember the service at preview time (UPDATE 21 §5): the
          // next message ("Aur 200 UPI") resolves on the same service.
          if (parsed.action.kind === 'daily_income' && parsed.action.entries.length > 0) {
            setCtx({ lastService: parsed.action.entries[0].service });
          }
          setBusy(false);
          return;
        }
        if (parsed.kind === 'error') {
          botReply(parsed.text);
          setBusy(false);
          return;
        }
        // Fell through — parse the message fresh below.
      }

      // 2. Confirm / cancel of a pending preview (pending context wins
      //    over the router — "haan" after a preview means "save it").
      //    UPDATE 17 / BUG A: a bare "Ha" is ALSO how the owner accepts
      //    a pending checklist offer — that must reach the router
      //    (accept_offer), never the "no pending entry" line. And with
      //    no pending preview AND no pending offer, "haan" confirms
      //    nothing: say so honestly instead of claiming a missing entry.
      const parsed0 = parseAssistantMessage(q, state, profile, ctxIn);
      if (parsed0.kind === 'confirm') {
        if (pendingRef.current) {
          setBusy(false);
          await confirmPreview(pendingRef.current.msgId);
          return;
        }
        if (!ctxIn.pendingOffer) {
          botReply('Theek hai! Batao kis liye haan — koi entry save karni hai, checklist banana hai, ya kuch aur help chahiye?');
          setBusy(false);
          return;
        }
        // Checklist offer pending: fall through to the router below —
        // classifyIntent resolves the bare yes against the offer.
      }
      if (parsed0.kind === 'cancel') {
        if (pendingRef.current) {
          cancelPreview(pendingRef.current.msgId);
          setBusy(false);
          return;
        }
        if (!ctxIn.pendingOffer) {
          botReply('Cancel karne ke liye koi pending entry nahi hai.');
          setBusy(false);
          return;
        }
        // An offer is pending: "Nahi" declines it — fall through to
        // the router (decline_offer), never the pending-entry line.
      }

      // 3. Unified conversation router (UPDATE 14/15/16) — intent is
      //    decided FIRST, before any business-data path, so a greeting
      //    or a plan can never become a money question. Financial
      //    actions return here as structured actions (preview below);
      //    do-commands (navigation / checklist / summary / language
      //    switch) are EXECUTED, not described.
      const res = respondToMessage({ message: q, state, profile, ctx: ctxIn, preferredLang: profile.aiLanguage || 'auto' });
      setCtx(res.newCtx);

      // Language switch: apply it to the profile immediately so the
      // next reply (and the whole app) uses the new language.
      if (res.languageChanged) {
        const code = res.languageChanged;
        app.mutate((s) => {
          const p = s.profiles.find((x) => x.id === profile.id);
          if (p) p.aiLanguage = code;
        });
        botReply(res.text);
        setBusy(false);
        return;
      }

      // Financial action → preview → Confirm & Save (never saved here).
      if (res.kind === 'action' && res.action) {
        supersedePending();
        const preview = previewFromAction(res.action, res.previewLines || [], res.totalPaise || 0, res.duplicateWarning);
        const msg = botReply(res.text, { preview });
        pendingRef.current = { msgId: msg.id, preview };
        setBusy(false);
        return;
      }
      // Clarification draft (missing method/service/amount/…) — ask the
      // user instead of guessing.
      if (res.draftQuestion && res.draft) {
        draftRef.current = res.draft as ActionDraft;
        botReply(res.draftQuestion);
        setBusy(false);
        return;
      }
      // Navigation — actually open the page. The reply is posted
      // complete, not typed: the user leaves this page immediately,
      // and a streaming reply would be stranded half-typed by the
      // unmount (see the load normalisation above). History keeps the
      // whole reply for when they come back.
      if (res.kind === 'navigation' && res.navigateTo) {
        pushMsg({
          id: uid('m'),
          role: 'bot',
          text: res.text,
          ts: new Date().toISOString(),
          streaming: false,
          source: 'local',
          links: res.links,
        });
        router.push(res.navigateTo);
        if (onNavigateAway) onNavigateAway();
        setBusy(false);
        return;
      }
      // Checklist / summary — the real artefact, already built/saved.
      if (res.kind === 'checklist' || res.kind === 'summary') {
        botReply(res.text, { table: res.table, links: res.links });
        setBusy(false);
        return;
      }

      // 4. Dynamic conversational AI (UPDATE 15) — streaming (UPDATE 17):
      //    UPDATE 20 §8: for general / casual / unknown / plan questions
      //    the cloud engine is the PRIMARY reasoning path when a key is
      //    configured (with history + profile + tools + the pending
      //    offer/question/checklist in the system prompt). The local
      //    reply is only the fallback: if the service fails or times
      //    out, displayText types the local reply with the grey cloud
      //    note — never a silent substitution. Business-data questions
      //    and financial actions keep local as primary (figures from
      //    real ledgers; money never moves on a cloud reply).
      const cloudPrimary = res.intent === 'general' || res.intent === 'casual' || res.intent === 'unknown' || res.intent === 'plan';
      let cloudJob: { history: AiChatMessage[]; system: string } | undefined;
      if (hasAiServiceKey() && (res.cloudNeeded || (cloudPrimary && res.kind === 'text' && !res.checklist))) {
        const history: AiChatMessage[] = (convRef.current.conversations.find((c) => c.id === convRef.current.activeId)?.messages || [])
          .filter((m) => !m.preview)
          .slice(-10)
          .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.text }));
        history.push({ role: 'user', content: q });
        const facts = computeFacts(state, profile);
        const system = buildSystemPrompt({
          lang: res.newCtx.lastLanguage || 'hi',
          langName: langName(res.newCtx.lastLanguage || 'hi'),
          profileName: profile.name,
          category: profile.category,
          services: profile.services,
          factsSummary: factsSummary(facts),
          contextNote: cloudContextNote(res.newCtx),
        });
        cloudJob = { history, system };
      }
      // Contextual follow-up chips for this reply (UPDATE 20 §2).
      setSuggestions(res.suggestions || []);
      botReply(res.text, { table: res.table, links: res.links }, cloudJob, res.newCtx.lastLanguage || 'hi');
      setBusy(false);
    } catch (e) {
      botReply('Sorry, kuch gadbad hui — AI abhi available nahi hai, baad me try karo. Aapka data safe hai, kuch save nahi hua.');
      setBusy(false);
    }
  }

  /**
   * Mic button. Three states, always visible:
   *  - speaking → stop the speech immediately, start listening for
   *    the new instruction (interruption).
   *  - listening → stop listening (mic off, nothing left running).
   *  - idle → start listening. Unsupported browser / denied
   *    permission surface as a chat message with guidance — text
   *    chat keeps working either way.
   */
  function toggleMic() {
    if (typeof window === 'undefined') return;
    const ctrl = ensureVoiceController();
    if (!ctrl) {
      pushMsg({ id: uid('m'), role: 'bot', text: voiceErrorMessage('unsupported'), ts: new Date().toISOString() });
      return;
    }
    if (voiceState === 'speaking' || aiPlayerRef.current?.isPlaying) {
      speakTokenRef.current++;
      aiPlayerRef.current?.stop();
      setSpeaking(null);
      ctrl.interruptSpeech();
      ctrl.setContinuous(continuous);
      ctrl.startListening(recognitionLang());
      return;
    }
    if (voiceState === 'listening') {
      ctrl.stopAll();
      setVoiceState('idle');
      return;
    }
    ctrl.setContinuous(continuous);
    ctrl.startListening(recognitionLang());
  }

  /** Recognition language (UPDATE 25, B-1): the profile's AI language
   *  when set, else the language of the current conversation — via
   *  recognitionLangFor, which detects it from the last user message
   *  (the helper existed but nothing called it) — else hi-IN, the
   *  owner's language. The old en-IN default made a fresh
   *  conversation recognise Hinglish speech with the English
   *  recogniser. */
  function recognitionLang(): string {
    const profile = profileRef.current;
    if (profile?.aiLanguage && profile.aiLanguage !== 'auto') return voiceLangFor(profile.aiLanguage);
    const conv = convRef.current.conversations.find((c) => c.id === convRef.current.activeId);
    const lastUser = [...(conv?.messages || [])].reverse().find((m) => m.role === 'user');
    if (lastUser?.text) return recognitionLangFor(profile, lastUser.text);
    if (conv?.ctx?.lastLanguage) return voiceLangFor(conv.ctx.lastLanguage);
    return 'hi-IN';
  }

  return {
    messages, input, setInput, busy, send, msgsRef,
    conversations, activeId, setActiveId: switchConversation, newChat, clearHistory,
    historyQuery, setHistoryQuery, showHistory, setShowHistory,
    suggestions,
    confirmPreview, cancelPreview, applyEdit, updateMsg,
    listening, toggleMic, speakOn, setSpeakOn,
    voiceState, continuous, toggleContinuous, stopVoice, interim, speaking, voiceSupported,
    streaming, stopGeneration, regenerate, retryFailed,
    // UPDATE 25: AI-voice daily counter (10/day) for the chat UI.
    voiceUsed, voiceLimit: AI_VOICE_DAILY_LIMIT,
    profileName: app.profile?.name || '',
  };
}

function PreviewCard({ msg, chat }: { msg: ChatMsg; chat: ReturnType<typeof useChat> }) {
  const p = msg.preview;
  if (!p) return null;
  const app = useApp();
  const services = app.profile?.services || [];
  if (p.cancelled) {
    return <div className="chat-result error">❌ Cancelled — kuch bhi save nahi hua.</div>;
  }
  const setEdit = (fn: (prev: PreviewData) => PreviewData) => {
    chat.updateMsg(msg.id, (m) => (m.preview ? { ...m, preview: fn(m.preview) } : m));
  };
  return (
    <div className="chat-preview" data-testid="ai-preview">
      <div className="chat-preview-title">Transaction Preview — check karo, phir Confirm dabao</div>
      {p.editing ? (
        <div className="chat-edit">
          {p.action.kind === 'daily_income' ? (
            <>
              {p.editRows.map((row, i) => (
                <div key={i} className="chat-edit-row">
                  <select className="input" value={row.service} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, service: e.target.value } : r)) }))} aria-label="Service">
                    {services.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="input" type="number" min="0" step="0.01" value={row.amountRs} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, amountRs: e.target.value } : r)) }))} aria-label="Amount in rupees" />
                  <select className="input" value={row.method} onChange={(e) => setEdit((prev) => ({ ...prev, editRows: prev.editRows.map((r, j) => (j === i ? { ...r, method: e.target.value } : r)) }))} aria-label="Payment method">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="other">Udhaar / Due</option>
                  </select>
                  <button className="icon-btn" aria-label="Remove row" onClick={() => setEdit((prev) => ({ ...prev, editRows: prev.editRows.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="chat-link" onClick={() => setEdit((prev) => ({ ...prev, editRows: [...prev.editRows, { service: services[0] || 'Xerox', amountRs: '', method: 'cash' }] }))}>+ Add row</button>
            </>
          ) : (
            <div className="chat-edit-row">
              <input className="input" type="number" min="0" step="0.01" value={p.editAmountRs} onChange={(e) => setEdit((prev) => ({ ...prev, editAmountRs: e.target.value }))} aria-label="Amount in rupees" />
              <select className="input" value={p.editMethod} onChange={(e) => setEdit((prev) => ({ ...prev, editMethod: e.target.value }))} aria-label="Payment method">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          )}
          <div className="chat-preview-btns">
            <button className="btn" onClick={() => chat.applyEdit(msg.id)}>Save Preview</button>
            <button className="btn btn-secondary" onClick={() => setEdit((prev) => ({ ...prev, editing: false }))}>Back</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="chat-preview-list">
            {p.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          {p.totalPaise > 0 && <div className="chat-preview-total">Total: {formatINR(p.totalPaise)}</div>}
          {p.duplicateWarning && <div className="chat-warn">{p.duplicateWarning}</div>}
          <div className="chat-preview-btns">
            <button className="btn" onClick={() => chat.confirmPreview(msg.id)} disabled={chat.busy} data-testid="ai-confirm">✓ Confirm &amp; Save</button>
            <button className="btn btn-secondary" onClick={() => setEdit((prev) => ({ ...prev, editing: true }))}>✎ Edit</button>
            <button className="btn btn-secondary" onClick={() => chat.cancelPreview(msg.id)} data-testid="ai-cancel">Cancel</button>
          </div>
          <div className="chat-preview-note">Confirm karne par hi entry save hogi — usse pehle kuch save nahi hota.</div>
        </>
      )}
    </div>
  );
}

function ResultCard({ msg }: { msg: ChatMsg }) {
  const r = msg.result;
  if (!r) return null;
  return (
    <div className={`chat-result ${r.ok ? 'ok' : 'error'}`} data-testid={r.ok ? 'ai-saved' : 'ai-error'}>
      <div style={{ fontWeight: 700 }}>{r.title || (r.ok ? '✓ Saved' : '✕ Not saved')}</div>
      <ul className="chat-preview-list">
        {r.lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {r.ok && <div className="chat-preview-note">{r.verifyNote || (r.verified ? '✓ Save verify ho gaya — records mein dikh raha hai.' : 'Save ho gaya — verification abhi pending hai, Daily Business mein check kar lo.')}</div>}
    </div>
  );
}

function ChatBody({ chat }: { chat: ReturnType<typeof useChat> }) {
  const router = useRouter();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const lastBot = [...chat.messages].reverse().find((m) => m.role === 'bot');

  /** Render the message being spoken aloud with the words already
   *  said highlighted (boundary events; degrades to a plain render
   *  when the browser sends no boundary events). */
  function renderSpoken(m: ChatMsg) {
    const sp = chat.speaking;
    if (!sp) return <span className="chat-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(m.text) }} />;
    const plain = m.text.replace(/[*#`>|]/g, '');
    const parts = plain.split(/(\s+)/);
    let w = 0;
    return (
      <span className="chat-spoken" data-testid="chat-speaking">
        {parts.map((p, i) => {
          if (/^\s+$/.test(p) || p === '') return <span key={i}>{p}</span>;
          const idx = w++;
          return <span key={i} className={idx < sp.wordIndex ? 'chat-spoken-done' : undefined}>{p}</span>;
        })}
      </span>
    );
  }

  /** Voice status line — the mic is never on secretly: listening /
   *  speaking / thinking is always shown here, with a Stop control. */
  function voiceStatus(): string | null {
    if (chat.voiceState === 'listening') return `🎙️ Sun raha hoon…${chat.interim ? ` “${chat.interim}”` : ''} — dobara tap karo to stop`;
    if (chat.voiceState === 'speaking') return '🔊 Bol raha hoon… — ⏹ dabakar roko, ya “Bas” bolo';
    if (chat.voiceState === 'thinking' || (chat.busy && chat.streaming)) return 'Soch raha hoon…';
    if (chat.continuous && chat.voiceState === 'idle') return 'Continuous voice on — mic tap karo, phir bolte raho';
    return null;
  }

  async function copyText(id: string, text: string) {
    const done = () => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch { /* clipboard unavailable — nothing to show */ }
    }
  }

  return (
    <>
      <div className="chat-msgs" ref={chat.msgsRef}>
        {chat.messages.map((m) => (
          <div key={m.id} className={`chat-msg-wrap ${m.role}`}>
            <div
              className={`chat-msg ${m.role}${m.streaming ? ' streaming' : ''}`}
              data-testid={m.role === 'user' ? 'chat-user-msg' : 'chat-bot-msg'}
              data-streaming={m.streaming ? 'true' : 'false'}
            >
              {m.role === 'user' ? (
                m.text
              ) : m.streaming && !m.text ? (
                <span className="chat-thinking" data-testid="chat-thinking">
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                  <span className="chat-thinking-text">BizKhata AI is thinking...</span>
                </span>
              ) : m.role === 'bot' && chat.speaking?.msgId === m.id ? (
                renderSpoken(m)
              ) : (
                <span className="chat-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(m.text) }} />
              )}
              {m.streaming && m.text ? <span className="chat-cursor" aria-hidden="true" /> : null}
              {!m.streaming && <span className="chat-time">{timeStr(m.ts)}</span>}
            </div>
            {m.role === 'bot' && m.streaming && (
              <div className="chat-msg-actions">
                <button className="btn btn-secondary chat-stop-btn" onClick={chat.stopGeneration} data-testid="chat-stop">
                  ■ Stop Generating
                </button>
              </div>
            )}
            {m.role === 'bot' && !m.streaming && m.text && (
              <div className="chat-msg-actions">
                <button className="chat-action-btn" onClick={() => copyText(m.id, m.text)} data-testid="chat-copy">
                  {copiedId === m.id ? '✓ Copied' : '⧉ Copy'}
                </button>
                {lastBot && m.id === lastBot.id && !m.failed && (
                  <button className="chat-action-btn" onClick={() => chat.regenerate()} disabled={chat.streaming} data-testid="chat-regenerate">
                    ↻ Regenerate
                  </button>
                )}
                {m.failed && (
                  <button className="chat-action-btn" onClick={() => chat.retryFailed()} disabled={chat.streaming} data-testid="chat-retry">
                    ↻ Retry
                  </button>
                )}
              </div>
            )}
            {m.role === 'bot' && m.failed && (
              <div className="chat-failed-note">Jawab poora nahi mila — Retry dabakar dobara try karo.</div>
            )}
            {m.role === 'bot' && m.stopped && (
              <div className="chat-stopped-note">Stopped — upar dikh raha jawab hi final hai.</div>
            )}
            {m.role === 'bot' && m.cloudFailed && !m.streaming && (
              <div className="chat-cloud-note">Cloud AI se jawab nahi mila — ye jawab aapke record aur app ki madad se diya hai.</div>
            )}
            {m.role === 'bot' && m.cloudLangMismatch && !m.streaming && (
              <div className="chat-cloud-note">Cloud AI ne galat bhasha mein jawab diya — ye jawab aapki bhasha mein, aapke record se diya hai.</div>
            )}
            {m.preview && <PreviewCard msg={m} chat={chat} />}
            {m.result && <ResultCard msg={m} />}
            {m.table && (
              <div className="chat-table-wrap">
                <table className="chat-table">
                  <thead><tr>{m.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {m.table.rows.map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {m.links && m.links.length > 0 && (
              <div className="chat-links">
                {m.links.map((l) => (
                  <button key={l.path} className="chat-link" onClick={() => router.push(l.path)}>{l.label} →</button>
                ))}
              </div>
            )}
            {m.result?.link && (
              <div className="chat-links">
                <button className="chat-link" onClick={() => router.push(m.result!.link!.path)}>{m.result!.link!.label} →</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Contextual follow-up chips (UPDATE 20 §2): only suggestions
          relevant to the last reply. A fresh chat shows the starter
          set; after that, no chips unless the reply earned some. */}
      {(() => {
        const hasUser = chat.messages.some((m) => m.role === 'user');
        const chips = hasUser ? chat.suggestions : QUICK_QUESTIONS;
        if (chips.length === 0) return null;
        return (
          <div className="chat-chips">
            {chips.map((q) => (
              <button key={q} className="chat-chip" onClick={() => chat.send(q)}>
                {q}
              </button>
            ))}
          </div>
        );
      })()}
      <div className="chat-input-row">
        <button
          className={`icon-btn chat-mic ${chat.listening ? 'listening' : ''} ${chat.voiceState === 'speaking' ? 'speaking' : ''}`}
          onClick={chat.toggleMic}
          aria-label={chat.listening ? 'Stop voice input' : chat.voiceState === 'speaking' ? 'Stop speaking and listen' : 'Voice input'}
          title={chat.voiceSupported ? 'Voice input (Hindi / English / Hinglish) — mic tap karo, bolo, phir suno' : 'Voice input — is browser mein support nahi hai, type karke likho'}
          data-testid="chat-mic"
        >
          🎙️
        </button>
        <button
          className={`icon-btn chat-voice-cont ${chat.continuous ? 'active' : ''}`}
          onClick={chat.toggleContinuous}
          aria-label={chat.continuous ? 'Turn off continuous conversation' : 'Turn on continuous conversation'}
          aria-pressed={chat.continuous}
          title="Continuous conversation — mic tap karo, phir bina dobara tap kiye bolte raho"
          data-testid="voice-continuous"
        >
          🔁
        </button>
        {chat.voiceState === 'speaking' && (
          <button
            className="icon-btn chat-voice-stop"
            onClick={chat.stopVoice}
            aria-label="Stop speaking"
            title="Bolna roko"
            data-testid="voice-stop"
          >
            ⏹
          </button>
        )}
        <input
          className="input"
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') chat.send(chat.input); }}
          placeholder="Apna sawal likho ya bolo… (22 Indian languages — Hinglish, Gujarati, Marathi, Tamil…)"
          aria-label="Ask the AI assistant"
          data-testid="chat-input"
        />
        <button className="btn" onClick={() => chat.send(chat.input)} disabled={!chat.input.trim()} data-testid="chat-send">
          Send
        </button>
      </div>
      <div className="chat-note" data-testid="voice-status">
        BizKhata AI Assistant • Figures always from your real records — nothing is sent anywhere.
        {voiceStatus() ? ` • ${voiceStatus()}` : ''}
        {chat.streaming ? ' • Generating…' : ''}
        {/* UPDATE 25: the AI-voice daily counter — visible whenever
            voice replies are on, so the 10-a-day limit is never a
            surprise. */}
        {chat.speakOn && (
          <span data-testid="voice-counter"> • AI voice: {chat.voiceUsed}/{chat.voiceLimit} aaj</span>
        )}
      </div>
    </>
  );
}

/** Overlay chat panel (opened by the floating button). */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const chat = useChat(onClose);
  return (
    <div className="chat-panel" role="dialog" aria-label="BizKhata AI Assistant">
      <div className="chat-panel-head">
        <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Your Intelligent Business Assistant • {chat.profileName}</div>
        </div>
        <button className="icon-btn" onClick={() => chat.setSpeakOn(!chat.speakOn)} aria-label={chat.speakOn ? 'Turn off voice replies' : 'Turn on voice replies'} title="Voice replies">
          {chat.speakOn ? '🔊' : '🔇'}
        </button>
        <button className="icon-btn" onClick={chat.newChat} aria-label="New chat" title="New chat">＋</button>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>
      <ChatBody chat={chat} />
    </div>
  );
}

/** Floating chat button — fixed bottom-right on every private screen. */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  // On the dedicated /chatbot page the full chat is already on screen.
  if ((pathname || '').replace(/\/$/, '') === '/chatbot') return null;
  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="BizKhata AI Assistant"
      >
        💬
      </button>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/** Dedicated full-page chat (/chatbot) with conversation history. */
export function ChatPageView() {
  const chat = useChat();
  const filtered = chat.conversations.filter((c) => {
    if (!chat.historyQuery.trim()) return true;
    const q = chat.historyQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q));
  });
  return (
    <div className="chat-page-wrap">
      {chat.showHistory && (
        <div className="chat-history">
          <div className="chat-history-head">
            <strong>Chat History</strong>
            <button className="icon-btn" onClick={() => chat.setShowHistory(false)} aria-label="Close history">✕</button>
          </div>
          <input
            className="input"
            value={chat.historyQuery}
            onChange={(e) => chat.setHistoryQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search chat history"
          />
          <div className="chat-history-list">
            {filtered.length === 0 && <p className="empty">Koi chat nahi mili.</p>}
            {filtered.map((c) => (
              <button
                key={c.id}
                className={`chat-history-item ${c.id === chat.activeId ? 'active' : ''}`}
                onClick={() => { chat.setActiveId(c.id); chat.setShowHistory(false); }}
              >
                <span className="chat-history-title">{c.title}</span>
                <span className="chat-history-date">{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={chat.clearHistory}>Clear All History</button>
        </div>
      )}
      <div className="chat-page">
        <div className="chat-panel-head">
          <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 18 }}>B</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>BizKhata AI Assistant</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Your Intelligent Business Assistant • {chat.profileName} • Ask in any of 22 Indian languages — Hinglish, Gujarati, Marathi, Tamil…</div>
          </div>
          <button className="icon-btn" onClick={() => chat.setSpeakOn(!chat.speakOn)} aria-label={chat.speakOn ? 'Turn off voice replies' : 'Turn on voice replies'} title="Voice replies">
            {chat.speakOn ? '🔊' : '🔇'}
          </button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'transparent' }} onClick={() => chat.setShowHistory(!chat.showHistory)}>History</button>
          <button className="btn btn-secondary" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'transparent' }} onClick={chat.newChat}>+ New Chat</button>
        </div>
        <ChatBody chat={chat} />
      </div>
    </div>
  );
}
